import { app, BrowserWindow, ipcMain, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { IPC } from "../shared/ipc-channels";
import { EXTRA_GAME_IDS, type GameResult, type GameRoomStats, type ScoreStats } from "../shared/game-room-types";
import {
  addNotebookEntry,
  deleteNotebookEntry,
  getSharedNotebookPath,
  onNotebookChanged,
  readNotebook,
  updateNotebookEntry,
} from "./notebook-manager";

function emptyScore(): ScoreStats {
  return { played: 0, userWins: 0, cyreneWins: 0, draws: 0 };
}

function defaultGameStats(): GameRoomStats {
  return {
    resonance: { played: 0, bestMatches: 0, totalMatches: 0 },
    ticTacToe: emptyScore(),
    extras: Object.fromEntries(EXTRA_GAME_IDS.map((id) => [id, emptyScore()])) as GameRoomStats["extras"],
  };
}

function gameStatsPath(): string {
  return path.join(app.getPath("userData"), "game-room-stats.json");
}

async function loadGameStats(): Promise<GameRoomStats> {
  try {
    const raw = JSON.parse(await fs.readFile(gameStatsPath(), "utf8")) as Partial<GameRoomStats>;
    const defaults = defaultGameStats();
    return {
      resonance: { ...defaults.resonance, ...raw.resonance },
      ticTacToe: { ...defaults.ticTacToe, ...raw.ticTacToe },
      extras: Object.fromEntries(EXTRA_GAME_IDS.map((id) => [id, { ...defaults.extras[id], ...raw.extras?.[id] }])) as GameRoomStats["extras"],
    };
  } catch {
    return defaultGameStats();
  }
}

async function saveGameStats(stats: GameRoomStats): Promise<GameRoomStats> {
  await fs.mkdir(path.dirname(gameStatsPath()), { recursive: true });
  await fs.writeFile(gameStatsPath(), JSON.stringify(stats, null, 2), "utf8");
  return stats;
}

function broadcastNotebookChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("shared-notebook:changed");
  }
}

export function registerCustomFeaturesIpc(): () => void {
  const handlers = [
    "sidebar:read-shared-notebook", "sidebar:open-shared-notebook", "sidebar:get-notebook-entries",
    "sidebar:add-notebook-entry", "sidebar:update-notebook-entry", "sidebar:delete-notebook-entry",
    IPC.GAME_ROOM_GET_STATS, IPC.GAME_ROOM_RECORD_RESULT, IPC.GAME_ROOM_RESET_STATS,
  ];
  for (const channel of handlers) ipcMain.removeHandler(channel);

  ipcMain.handle("sidebar:read-shared-notebook", async () => (await readNotebook()).rawContent);
  ipcMain.handle("sidebar:open-shared-notebook", async () => {
    const notebookPath = getSharedNotebookPath();
    await fs.mkdir(path.dirname(notebookPath), { recursive: true });
    try { await fs.access(notebookPath); } catch { await fs.writeFile(notebookPath, "# 🌸 昔漣與夥伴的共享筆記本 🌸\n\n## 📅 成長足跡與共同日誌\n", "utf8"); }
    return (await shell.openPath(notebookPath)) === "";
  });
  ipcMain.handle("sidebar:get-notebook-entries", async () => (await readNotebook()).entries);
  ipcMain.handle("sidebar:add-notebook-entry", async (_event, options) => {
    try { return { ok: true, entry: await addNotebookEntry(options) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("sidebar:update-notebook-entry", async (_event, id: string, content: string, title?: string) => {
    try { return { ok: await updateNotebookEntry(id, content, title) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle("sidebar:delete-notebook-entry", async (_event, id: string) => {
    try { return { ok: await deleteNotebookEntry(id) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  });

  ipcMain.handle(IPC.GAME_ROOM_GET_STATS, loadGameStats);
  ipcMain.handle(IPC.GAME_ROOM_RESET_STATS, () => saveGameStats(defaultGameStats()));
  ipcMain.handle(IPC.GAME_ROOM_RECORD_RESULT, async (_event, result: GameResult) => {
    const stats = await loadGameStats();
    if (result.game === "resonance") {
      const matches = Math.max(0, Math.min(5, Math.round(result.matches ?? 0)));
      stats.resonance.played += 1;
      stats.resonance.totalMatches += matches;
      stats.resonance.bestMatches = Math.max(stats.resonance.bestMatches, matches);
    } else {
      const score = result.game === "tic-tac-toe" ? stats.ticTacToe : stats.extras[result.game];
      if (score) {
        score.played += 1;
        if (result.outcome === "user") score.userWins += 1;
        else if (result.outcome === "cyrene") score.cyreneWins += 1;
        else score.draws += 1;
      }
    }
    return saveGameStats(stats);
  });
  ipcMain.on(IPC.GAME_ROOM_REACT, (_event, name: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.LIVE2D_PLAY_ACTION, { expression: String(name).slice(0, 64) });
    }
  });

  const unsubscribe = onNotebookChanged(broadcastNotebookChanged);
  return () => {
    unsubscribe();
    for (const channel of handlers) ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(IPC.GAME_ROOM_REACT);
  };
}
