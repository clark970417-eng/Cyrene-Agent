import { Live2DManager } from "./live2d/manager";
import "./ui/theme";
import { InteractionController } from "./live2d/interaction";
import { MouseFocusController } from "./live2d/focus";
import { ExpressionResetController } from "./live2d/expression-reset";
import { MouthSyncController } from "./live2d/mouth-sync";
import { SpeakingMotionController } from "./live2d/speaking-motion";
// OpenerBubbleController 已被移除（主动开口子系统整体删除）。
import { ClickThroughController } from "./live2d/click-through";
import { Live2DRendererLifecycleTracker } from "./live2d/lifecycle-diagnostics";
import { resolveAsset } from "../shared/renderer-base";

const canvas = document.getElementById("live2d-canvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #live2d-canvas not found");
const petReply = document.getElementById("pet-reply") as HTMLDivElement | null;
const petChatForm = document.getElementById("pet-chat-form") as HTMLFormElement | null;
const petChatInput = document.getElementById("pet-chat-input") as HTMLInputElement | null;
const petChatSubmit = document.getElementById("pet-chat-submit") as HTMLButtonElement | null;

type PetChatSession = {
  id: string;
  title: string;
  mode?: string;
  messages: Array<{ id: string; role: "user" | "model"; content: string; at: number }>;
};

type PetChatBridge = {
  petChat?: {
    getInputVisibility: () => Promise<boolean>;
    onInputVisibility: (callback: (visible: boolean) => void) => () => void;
  };
  chatStore?: {
    list: (options?: { mode?: "chat" }) => Promise<Array<{ id: string; title: string }>>;
    get: (id: string) => Promise<PetChatSession | null>;
    create: (payload: { title: string; identityId: null; mode: "chat" }) => Promise<PetChatSession>;
    append: (id: string, message: { id: string; role: "user" | "model"; content: string; at: number }) => Promise<PetChatSession | null>;
    getActiveSession: () => Promise<string | null>;
  };
  agui?: {
    run: (input: { messages: unknown[]; userTurnId: string; assistantTurnId: string; sessionId: string; source?: "pet" }) => Promise<{ success: boolean; error?: string }>;
    onEvent: (callback: (event: { type?: string; delta?: string; message?: string; error?: string }) => void) => () => void;
  };
};

const petBridge = window as unknown as Window & PetChatBridge;
let petChatVisible = false;
let petChatVisibilityOff: (() => void) | null = null;
let petReplyTimer: number | null = null;

function compactPetReply(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) return normalized;
  const sentence = normalized.slice(0, 220).match(/^.*?[。！？!?](?=\s|$)/)?.[0];
  return `${sentence || normalized.slice(0, 217)}…`;
}

function showPetReply(text: string): void {
  if (!petReply) return;
  petReply.textContent = compactPetReply(text);
  petReply.hidden = false;
  if (petReplyTimer !== null) window.clearTimeout(petReplyTimer);
  petReplyTimer = window.setTimeout(() => {
    petReply.hidden = true;
    petReplyTimer = null;
  }, 14_000);
}

function setPetChatVisible(visible: boolean): void {
  petChatVisible = visible;
  if (petChatForm) petChatForm.hidden = !visible;
  if (!visible) {
    petChatInput?.blur();
    if (petReply) petReply.hidden = true;
    window.cyrene.setTextInputActive(false);
    clickThrough?.resume();
    void window.cyrene.setInteractive(false);
    return;
  }
  clickThrough?.pause();
  void window.cyrene.setInteractive(true);
}

async function resolvePetChatSession(): Promise<PetChatSession> {
  const store = petBridge.chatStore;
  if (!store) throw new Error("聊天記錄服務尚未就緒");
  const activeId = await store.getActiveSession();
  if (activeId) {
    const active = await store.get(activeId);
    if (active?.mode === "chat") return active;
  }
  const existing = (await store.list({ mode: "chat" })).find((session) => session.title === "昔漣桌寵");
  if (existing) {
    const session = await store.get(existing.id);
    if (session) return session;
  }
  return store.create({ title: "昔漣桌寵", identityId: null, mode: "chat" });
}

async function sendPetChat(text: string): Promise<string> {
  const store = petBridge.chatStore;
  const agui = petBridge.agui;
  if (!store || !agui) throw new Error("昔漣的對話服務尚未就緒");
  const session = await resolvePetChatSession();
  const userTurnId = crypto.randomUUID();
  const assistantTurnId = crypto.randomUUID();
  const updated = await store.append(session.id, { id: userTurnId, role: "user", content: text, at: Date.now() });
  if (!updated) throw new Error("訊息未能存入對話記錄");

  let reply = "";
  let terminalError: Error | null = null;
  const off = agui.onEvent((event) => {
    if (event.type === "TEXT_MESSAGE_CONTENT" && event.delta) reply += event.delta;
    if (event.type === "RUN_ERROR") terminalError = new Error(event.message || event.error || "昔漣暫時無法回覆");
  });
  try {
    const result = await agui.run({
      messages: updated.messages.slice(-16).map((message) => ({ role: message.role, content: message.content, at: message.at })),
      userTurnId,
      assistantTurnId,
      sessionId: session.id,
      source: "pet",
    });
    if (!result.success) throw new Error(result.error || "昔漣暫時無法回覆");
    if (terminalError) throw terminalError;
  } finally {
    off();
  }

  const normalizedReply = reply.trim() || "我在這裡，剛才沒有成功整理出回覆，再和我說一次好嗎？";
  await store.append(session.id, { id: assistantTurnId, role: "model", content: normalizedReply, at: Date.now() });
  return normalizedReply;
}

if (!window.cyrene) {
  (window as unknown as { cyrene: unknown }).cyrene = {
    minimize: () => {},
    hide: () => {},
    quit: () => {},
    setInteractive: (_: boolean) => Promise.resolve(),
    setTextInputActive: (_active: boolean) => {},
    moveBy: (_dx: number, _dy: number) => {},
    moveTo: (_x: number, _y: number) => {},
    setDragging: (_isDragging: boolean) => {},
    captureFrame: () => Promise.resolve(null),
    getCursorPosition: () => Promise.resolve(null),
    onPetZoom: (_cb: (zoom: number) => void) => () => {},
    onPetVisibilityChanged: (_cb: (visible: boolean) => void) => () => {},
  };
}

declare global {
  interface Window {
    live2dSpeech?: {
      onPrepare: (callback: () => void) => () => void;
      onMouthStart: (callback: (payload: { durationMs: number }) => void) => () => void;
      onMouthStop: (callback: () => void) => () => void;
    };
    live2dAction?: {
      onPlayAction: (callback: (target: import("../shared/live2d-actions").Live2DTarget) => void) => () => void;
    };
  }
}

let interaction: InteractionController | null = null;
let focus: MouseFocusController | null = null;
let expressionReset: ExpressionResetController | null = null;
let mouthSync: MouthSyncController | null = null;
let speakingMotion: SpeakingMotionController | null = null;
let clickThrough: ClickThroughController | null = null;
let petZoomOff: (() => void) | null = null;
let petVisibilityOff: (() => void) | null = null;
let petVisible = true;
let live2dSpeechOffs: Array<() => void> = [];
const live2dLifecycle = new Live2DRendererLifecycleTracker();

void petBridge.petChat?.getInputVisibility()
  .then(setPetChatVisible)
  .catch(() => setPetChatVisible(false));
petChatVisibilityOff = petBridge.petChat?.onInputVisibility(setPetChatVisible) ?? null;

petChatInput?.addEventListener("focus", () => {
  clickThrough?.pause();
  void window.cyrene.setInteractive(true);
  window.cyrene.setTextInputActive(true);
});
petChatInput?.addEventListener("blur", () => {
  window.cyrene.setTextInputActive(false);
  if (petChatVisible) {
    clickThrough?.pause();
    void window.cyrene.setInteractive(true);
  }
});
petChatInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") petChatInput.blur();
});
petChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = petChatInput?.value.trim() ?? "";
  if (!text || !petChatInput || !petChatSubmit) return;
  petChatInput.value = "";
  petChatInput.disabled = true;
  petChatSubmit.disabled = true;
  const placeholder = petChatInput.placeholder;
  petChatInput.placeholder = "昔漣正在想…";
  try {
    showPetReply(await sendPetChat(text));
  } catch (error) {
    showPetReply(error instanceof Error ? error.message : "昔漣暫時無法回覆，請稍後再試。");
  } finally {
    petChatInput.disabled = false;
    petChatSubmit.disabled = false;
    petChatInput.placeholder = placeholder;
    petChatInput.focus();
  }
});

function trackSubscription(label: string, off: () => void): () => void {
  return live2dLifecycle.track("subscription", label, off);
}

function addTrackedEventListener(
  target: EventTarget,
  label: string,
  type: string,
  listener: EventListenerOrEventListenerObject,
): void {
  target.addEventListener(type, listener);
  live2dLifecycle.track("listener", label, () => target.removeEventListener(type, listener));
}

const manager = new Live2DManager({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
  modelPath: resolveAsset("models/cyrene/Cyrene.model3.json"),
  onLoad: () => {
    console.log("[Cyrene] Model loaded");
    const model = manager.getModel();
    if (!model) return;

    expressionReset = new ExpressionResetController(model);
    mouthSync = new MouthSyncController(model);
    speakingMotion = new SpeakingMotionController(model);
    const speechOffs: Array<() => void> = [];
    speechOffs.push(
      trackSubscription("live2dSpeech:onPrepare", window.live2dSpeech?.onPrepare(() => {
        void expressionReset?.resetNow();
        mouthSync?.stop();
        speakingMotion?.stop();
      }) ?? (() => {})),
      trackSubscription("live2dSpeech:onMouthStart", window.live2dSpeech?.onMouthStart((payload) => {
        mouthSync?.start(Number(payload.durationMs ?? 0));
        speakingMotion?.start();
      }) ?? (() => {})),
      trackSubscription("live2dSpeech:onMouthStop", window.live2dSpeech?.onMouthStop(() => {
        mouthSync?.stop();
        speakingMotion?.stop();
      }) ?? (() => {})),
    );
    // LLM-driven action bridge: when Main sends a resolved Live2DTarget, play it.
    speechOffs.push(
      trackSubscription("live2dAction:onPlayAction", window.live2dAction?.onPlayAction((target) => {
        void manager.playAction(target);
      }) ?? (() => {})),
    );
    live2dSpeechOffs = speechOffs;
    interaction = new InteractionController(canvas, model, manager.getHitAreaDefs(), {
      onTrigger: (area) => {
        expressionReset?.restart();
        console.log("[Cyrene] hit", area.name, "->", area.group + ":" + area.motionName);
      },
      onMiss: (area) =>
        console.warn("[Cyrene] hit", area.name, "has no resolvable motion"),
    });

    focus = new MouseFocusController(canvas, model);
    focus.focusCenter(true);

    clickThrough = new ClickThroughController(canvas, manager, {
      onInteractive: (interactive) => void window.cyrene.setInteractive(interactive),
    });
    if (petChatVisible) {
      clickThrough.pause();
      void window.cyrene.setInteractive(true);
    }

    // Apply the persisted zoom on load and track future changes. The main
    // process has already resized the window to base × zoom; this rescales
    // the model to match.
    petZoomOff = trackSubscription("cyrene:onPetZoom", window.cyrene.onPetZoom((zoom) => manager.applyZoom(zoom)));
    petVisibilityOff = trackSubscription("cyrene:onPetVisibilityChanged", window.cyrene.onPetVisibilityChanged((visible) => {
      petVisible = visible;
      if (!visible) {
        clickThrough?.pause();
        focus?.pause();
        manager.pause();
        return;
      }
      if (!isDragging) {
        manager.resume();
        focus?.resume();
        if (!petChatVisible) clickThrough?.resume();
      }
    }));

    // 启动竞态修复：主进程在渲染进程就绪前发的 PET_ZOOM 事件会被丢弃。
    // 注册监听后主动从磁盘读一次 petZoom 并应用，确保重启后模型大小生效。
    window.settings?.getGeneral().then((cfg) => {
      if (cfg?.petZoom && cfg.petZoom !== 1) {
        manager.applyZoom(cfg.petZoom);
      }
    }).catch(() => { /* 设置读取失败不影响加载 */ });

    (window as unknown as { __cyrene: unknown }).__cyrene = {
      manager,
      interaction,
      focus,
      expressionReset,
      resetExpression: () => expressionReset?.resetNow(),
      getLive2DDiagnostics: () => ({
        resources: manager.getResourceMetrics(),
        lifecycle: live2dLifecycle.getDiagnostics(),
        controllers: {
          interaction: interaction !== null,
          focus: focus !== null,
          expressionReset: expressionReset !== null,
          mouthSync: mouthSync !== null,
          speakingMotion: speakingMotion !== null,
          clickThrough: clickThrough !== null,
        },
        petVisible,
        isDragging,
      }),
    };
  },
  onError: (err) => {
    console.error("[Cyrene] Failed to load model:", err);
  },
});

manager.init();

addTrackedEventListener(window, "window:resize", "resize", () => {
  manager.resize(window.innerWidth, window.innerHeight);
  focus?.focusCenter(true);
});

window.addEventListener("beforeunload", () => {
  window.cyrene.setTextInputActive(false);
  petChatVisibilityOff?.();
  petChatVisibilityOff = null;
  if (petReplyTimer !== null) window.clearTimeout(petReplyTimer);
  expressionReset?.dispose();
  expressionReset = null;
  for (const off of live2dSpeechOffs) off();
  live2dSpeechOffs = [];
  mouthSync?.dispose();
  mouthSync = null;
  speakingMotion?.dispose();
  speakingMotion = null;
  focus?.dispose();
  focus = null;
  clickThrough?.dispose();
  clickThrough = null;
  petZoomOff?.();
  petZoomOff = null;
  petVisibilityOff?.();
  petVisibilityOff = null;
  interaction?.dispose();
  interaction = null;
  manager.dispose();
  live2dLifecycle.disposeAll();
});

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let pendingPosition: { x: number; y: number } | null = null;
let rafId: number | null = null;
let dragOverlay: HTMLImageElement | null = null;
let dragToken = 0;

let dragOverlayUrl: string | null = null;

function clearDragOverlay(): void {
  if (dragOverlay) {
    dragOverlay.remove();
    dragOverlay = null;
  }
  if (dragOverlayUrl) {
    URL.revokeObjectURL(dragOverlayUrl);
    dragOverlayUrl = null;
  }
  canvas.style.visibility = "";
}

function captureCanvasBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      // preserveDrawingBuffer is enabled, so the last rendered frame is
      // readable even after the PIXI ticker has been paused.
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch (err) {
      console.warn("[Cyrene] canvas.toBlob failed", err);
      resolve(null);
    }
  });
}

async function showDragOverlay(token: number): Promise<void> {
  const blob = await captureCanvasBlob();
  if (!blob || token !== dragToken || !isDragging) return;

  const url = URL.createObjectURL(blob);
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.draggable = false;
  img.style.position = "fixed";
  img.style.inset = "0";
  img.style.width = "100vw";
  img.style.height = "100vh";
  img.style.objectFit = "contain";
  img.style.pointerEvents = "none";
  img.style.userSelect = "none";
  img.style.zIndex = "10";

  img.onload = () => {
    if (token !== dragToken || !isDragging) {
      URL.revokeObjectURL(url);
      return;
    }
    dragOverlay?.remove();
    dragOverlay = img;
    dragOverlayUrl = url;
    document.body.appendChild(img);
    canvas.style.visibility = "hidden";
  };
  img.onerror = () => URL.revokeObjectURL(url);
}

function scheduleMoveTo(screenX: number, screenY: number): void {
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
  if (!Number.isFinite(dragOffsetX) || !Number.isFinite(dragOffsetY)) return;
  pendingPosition = {
    x: screenX - dragOffsetX,
    y: screenY - dragOffsetY,
  };
  if (rafId === null) {
    rafId = requestAnimationFrame(flushMove);
  }
}

function flushMove(): void {
  rafId = null;
  if (pendingPosition) {
    window.cyrene.moveTo(pendingPosition.x, pendingPosition.y);
    pendingPosition = null;
  }
}

function cancelPendingMove(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingPosition = null;
}

function finishDrag(): void {
  isDragging = false;
  dragToken += 1;
  cancelPendingMove();
  clearDragOverlay();
  if (petVisible) {
    manager.resume();
    focus?.resume();
  }
  window.cyrene.setDragging(false);
  if (petVisible && !petChatVisible) clickThrough?.resume();
}

// Click-through is driven per-pixel by ClickThroughController on pointermove.
// We only need enter/leave to bookend the cursor's stay in the window:
// entering hands control to the controller, leaving the window entirely
// means there's nothing to capture (and no move will fire), so pass through.
addTrackedEventListener(canvas, "canvas:pointerenter", "pointerenter", () => {
  if (!petChatVisible) clickThrough?.resume();
});

addTrackedEventListener(canvas, "canvas:pointercancel", "pointercancel", () => {
  if (isDragging) finishDrag();
});

addTrackedEventListener(canvas, "canvas:pointerleave", "pointerleave", () => {
  if (isDragging) return;
  void window.cyrene.setInteractive(false);
});

addTrackedEventListener(canvas, "canvas:pointerdown", "pointerdown", (e) => {
  const event = e as PointerEvent;
  if (isDragging) return;
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return;
  if (!Number.isFinite(window.screenX) || !Number.isFinite(window.screenY)) return;
  isDragging = true;
  dragToken += 1;
  const token = dragToken;
  dragOffsetX = event.screenX - window.screenX;
  dragOffsetY = event.screenY - window.screenY;
  cancelPendingMove();
  clickThrough?.pause();
  focus?.pause(true);
  manager.pause();
  void window.cyrene.setInteractive(true);
  window.cyrene.setDragging(true);
  try {
    (event.target as Element).setPointerCapture(event.pointerId);
  } catch {}
  void showDragOverlay(token);
});

addTrackedEventListener(canvas, "canvas:pointermove", "pointermove", (e) => {
  const event = e as PointerEvent;
  if (!isDragging) return;
  scheduleMoveTo(event.screenX, event.screenY);
});

addTrackedEventListener(canvas, "canvas:pointerup", "pointerup", (e) => {
  const event = e as PointerEvent;
  if (!isDragging) return;
  scheduleMoveTo(event.screenX, event.screenY);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  flushMove();
  finishDrag();

  try {
    (event.target as Element).releasePointerCapture(event.pointerId);
  } catch {}

  const rect = canvas.getBoundingClientRect();
  const outside =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;
  if (outside) void window.cyrene.setInteractive(false);
});
