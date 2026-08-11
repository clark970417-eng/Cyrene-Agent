import { BrowserWindow, screen, type NativeImage } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { createMainWindow, PET_WINDOW_BASE_HEIGHT, PET_WINDOW_BASE_WIDTH, type MainWindowSettingsSlice } from "../startup/create-main-window";
import {
  createReactChatWindow,
  navigateUnifiedWorkspace,
} from "./create-aux-windows";
import { broadcastToAllWindows } from "./broadcast";
import { PetWindowMoveController } from "../pet-window-movement";
import { reactChatWindow } from "./window-state";

export interface WindowManagerOptions {
  getCurrentAppIconPath: () => string;
  isDev: boolean;
  loadMainWindowSettingsSlice: () => MainWindowSettingsSlice & { petZoom?: number; petAlwaysOnTop?: boolean };
  persistMainWindowPosition: (position: { x: number; y: number }) => void;
}

export interface WindowManager {
  createMainWindow(): BrowserWindow;
  createReactChatWindow(sessionId?: string): void;
  createSidebarWindow(): void;
  createSettingsWindow(section?: string): void;
  createTasksWindow(): void;
  createStickerManagerWindow(): void;
  createCallWindow(): void;
  setPetDockVisible(visible: boolean): void;
  updatePetDock(bounds: { x: number; y: number; width: number; height: number; isDocked: boolean }): void;
  isPetDocked(): boolean;

  showMainWindow(): void;
  hideMainWindow(): void;
  toggleMainWindow(): void;
  minimizeMainWindow(): void;
  setMainWindowAlwaysOnTop(alwaysOnTop: boolean): void;
  setMainWindowInteractive(interactive: boolean): void;
  setMainWindowTextInputActive(active: boolean): void;
  setMainWindowDragging(isDragging: boolean): void;
  moveMainWindowRelative(dx: number, dy: number): void;
  moveMainWindowTo(x: number, y: number): void;
  applyMainWindowZoom(zoom: number): void;
  captureMainWindowFrame(): Promise<string | null>;
  captureMainWindow(): Promise<Electron.NativeImage | null>;
  getCursorScreenPosition(): { x: number; y: number };
  setIconForAllWindows(icon: NativeImage): void;
  sendToMainWindow(channel: string, payload?: unknown): void;
  broadcast(channel: string, payload: unknown): void;

  onMainWindowReady(handler: (win: BrowserWindow) => void): void;
  onMainWindowClosed(handler: () => void): void;
  onMainWindowMoved(handler: (position: { x: number; y: number }) => void): void;

  dispose(): void;
}

export function createWindowManager(options: WindowManagerOptions): WindowManager {
  let mainWindow: BrowserWindow | null = null;
  let petDockVisible = true;
  let petTextInputActive = false;
  let petDragging = false;
  let petDockBounds: { x: number; y: number; width: number; height: number; isDocked: boolean } | null = null;
  const readyHandlers: Array<(win: BrowserWindow) => void> = [];
  const closedHandlers: Array<() => void> = [];
  const movedHandlers: Array<(position: { x: number; y: number }) => void> = [];

  const petWindowMoveController = new PetWindowMoveController(
    () => mainWindow,
    (position) => {
      options.persistMainWindowPosition(position);
    },
  );

  function getUsableMainWindow(): BrowserWindow | null {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow;
  }

  function applyPetDock(): void {
    const pet = getUsableMainWindow();
    const host = reactChatWindow;
    const slot = petDockBounds;
    if (!pet || !host || host.isDestroyed() || !slot?.isDocked) return;
    if (!petDockVisible || !host.isVisible()) {
      pet.hide();
      return;
    }
    const zoom = 0.45;
    const width = Math.round(PET_WINDOW_BASE_WIDTH * zoom);
    const height = Math.round(PET_WINDOW_BASE_HEIGHT * zoom);
    const hostBounds = host.getBounds();
    pet.setParentWindow(host);
    pet.setAlwaysOnTop(false);
    pet.setIgnoreMouseEvents(false);
    pet.setBounds({
      x: Math.round(hostBounds.x + slot.x + (slot.width - width) / 2),
      y: Math.round(hostBounds.y + slot.y + slot.height - height + 16),
      width,
      height,
    });
    pet.webContents.send(IPC.PET_ZOOM, zoom);
    pet.webContents.send(IPC.PET_CHAT_INPUT_VISIBILITY, false);
    pet.showInactive();
  }

  function applyDetachedPetAppearance(): void {
    const pet = getUsableMainWindow();
    if (!pet) return;
    const settings = options.loadMainWindowSettingsSlice();
    const zoom = Math.max(0.5, Math.min(2, settings.petZoom ?? 1));
    const width = Math.round(PET_WINDOW_BASE_WIDTH * zoom);
    const height = Math.round(PET_WINDOW_BASE_HEIGHT * zoom);
    pet.setParentWindow(null);
    pet.setSize(width, height);
    pet.setAlwaysOnTop(!petTextInputActive && settings.petAlwaysOnTop !== false, "screen-saver");
    pet.webContents.send(IPC.PET_ZOOM, zoom);
    pet.webContents.send(IPC.PET_CHAT_INPUT_VISIBILITY, true);
  }

  function undockPetForDrag(): void {
    if (!petDockBounds?.isDocked) return;
    petDockBounds = { ...petDockBounds, isDocked: false };
    const pet = getUsableMainWindow();
    pet?.setParentWindow(null);
    pet?.webContents.send(IPC.PET_CHAT_INPUT_VISIBILITY, false);
    reactChatWindow?.webContents.send("workspace:pet-dock-changed", false);
  }

  function setMainWindow(window: BrowserWindow): void {
    mainWindow = window;
    window.once("ready-to-show", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      for (const handler of readyHandlers) {
        try { handler(mainWindow); } catch (err) { console.error("[WindowManager] ready handler failed:", err); }
      }
    });
    window.on("closed", () => {
      petWindowMoveController.dispose();
      mainWindow = null;
      for (const handler of closedHandlers) {
        try { handler(); } catch (err) { console.error("[WindowManager] closed handler failed:", err); }
      }
    });
    window.on("moved", () => {
      const win = mainWindow;
      if (!win || win.isDestroyed()) return;
      try {
        const [x, y] = win.getPosition();
        for (const handler of movedHandlers) {
          try { handler({ x, y }); } catch (err) { console.error("[WindowManager] moved handler failed:", err); }
        }
      } catch {
        // ignore
      }
    });
  }

  return {
    createMainWindow(): BrowserWindow {
      if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
      const win = createMainWindow({
        getCurrentAppIconPath: options.getCurrentAppIconPath,
        isDev: options.isDev,
        loadGeneralSettings: options.loadMainWindowSettingsSlice,
      });
      setMainWindow(win);
      return win;
    },

    createReactChatWindow,
    createSidebarWindow(): void { navigateUnifiedWorkspace("overview"); },
    createSettingsWindow(section?: string): void { navigateUnifiedWorkspace("settings", section); },
    createTasksWindow(): void { navigateUnifiedWorkspace("tasks"); },
    createStickerManagerWindow(): void { navigateUnifiedWorkspace("stickers"); },
    createCallWindow(): void { navigateUnifiedWorkspace("call"); },
    setPetDockVisible(visible: boolean): void {
      petDockVisible = visible;
      applyPetDock();
    },
    updatePetDock(bounds): void {
      petDockBounds = bounds;
      if (!bounds.isDocked) {
        if (!petDragging) applyDetachedPetAppearance();
        reactChatWindow?.webContents.send("workspace:pet-dock-changed", false);
        return;
      }
      applyPetDock();
    },
    isPetDocked(): boolean {
      return petDockBounds?.isDocked ?? true;
    },

    showMainWindow(): void {
      getUsableMainWindow()?.show();
    },
    hideMainWindow(): void {
      getUsableMainWindow()?.hide();
    },
    toggleMainWindow(): void {
      const win = getUsableMainWindow();
      if (!win) return;
      win.isVisible() ? win.hide() : win.show();
    },
    minimizeMainWindow(): void {
      getUsableMainWindow()?.minimize();
    },
    setMainWindowAlwaysOnTop(alwaysOnTop: boolean): void {
      const win = getUsableMainWindow();
      if (!win) return;
      win.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? "screen-saver" : "normal");
    },
    setMainWindowInteractive(interactive: boolean): void {
      const win = getUsableMainWindow();
      if (!win) return;
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    },
    setMainWindowTextInputActive(active: boolean): void {
      petTextInputActive = active;
      if (petDockBounds?.isDocked) return;
      const win = getUsableMainWindow();
      if (!win) return;
      const settings = options.loadMainWindowSettingsSlice();
      win.setAlwaysOnTop(!active && settings.petAlwaysOnTop !== false, active ? "normal" : "screen-saver");
    },
    setMainWindowDragging(isDragging: boolean): void {
      const win = getUsableMainWindow();
      if (!win) return;
      petDragging = isDragging;
      if (isDragging) undockPetForDrag();
      if (!isDragging) {
        petWindowMoveController.finishDragging();
        applyDetachedPetAppearance();
      }
      try {
        win.setOpacity(isDragging ? 0.99 : 1.0);
      } catch (error) {
        console.warn("[WindowManager] Failed to update pet window dragging opacity:", error);
      }
    },
    moveMainWindowRelative(dx: number, dy: number): void {
      petWindowMoveController.moveRelative(dx, dy);
    },
    moveMainWindowTo(x: number, y: number): void {
      petWindowMoveController.queueAbsolute(x, y);
    },
    applyMainWindowZoom(zoom: number): void {
      const win = getUsableMainWindow();
      if (!win) return;
      const width = Math.round(PET_WINDOW_BASE_WIDTH * zoom);
      const height = Math.round(PET_WINDOW_BASE_HEIGHT * zoom);
      win.setSize(width, height);
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.PET_ZOOM, zoom);
      }
    },
    async captureMainWindowFrame(): Promise<string | null> {
      const image = await this.captureMainWindow();
      return image ? image.toDataURL() : null;
    },
    async captureMainWindow(): Promise<Electron.NativeImage | null> {
      const win = getUsableMainWindow();
      if (!win) return null;
      try {
        return await win.webContents.capturePage();
      } catch (err) {
        console.error("[WindowManager] captureMainWindow failed:", err);
        return null;
      }
    },
    getCursorScreenPosition(): { x: number; y: number } {
      return screen.getCursorScreenPoint();
    },
    setIconForAllWindows(icon: NativeImage): void {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.setIcon(icon);
      }
    },
    sendToMainWindow(channel: string, payload?: unknown): void {
      const win = getUsableMainWindow();
      if (!win) return;
      if (payload === undefined) win.webContents.send(channel);
      else win.webContents.send(channel, payload);
    },
    broadcast(channel: string, payload: unknown): void {
      broadcastToAllWindows(channel, payload);
    },

    onMainWindowReady(handler: (win: BrowserWindow) => void): void {
      readyHandlers.push(handler);
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        try { handler(mainWindow); } catch (err) { console.error("[WindowManager] ready handler failed:", err); }
      }
    },
    onMainWindowClosed(handler: () => void): void {
      closedHandlers.push(handler);
    },
    onMainWindowMoved(handler: (position: { x: number; y: number }) => void): void {
      movedHandlers.push(handler);
    },

    dispose(): void {
      petWindowMoveController.dispose();
    },
  };
}
