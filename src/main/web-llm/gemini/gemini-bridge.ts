import { getOrCreateBackgroundWindow, openGeminiLoginWindow } from "./gemini-window";
import { detectPageState, sendMessage, pollLatestReply, clickStopGenerating } from "./gemini-dom-adapter";
import { hasGoogleLoginCookies } from "./gemini-session";
import {
  GeminiLoginRequiredError,
  GeminiCaptchaError,
  GeminiRateLimitError,
  GeminiNetworkError,
  GeminiDomChangedError,
  GeminiTimeoutError,
  makeGeminiCancelledError,
} from "./gemini-errors";

const POLL_INTERVAL_MS = 1000;
/** 連續幾次「文字沒變化且不在產生中」才視為回覆完成，避免抓到還沒渲染完的中間狀態。 */
const STABLE_TICKS_TO_FINISH = 2;
const DEFAULT_TIMEOUT_MS = 90_000;

export interface GeminiPromptOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(makeGeminiCancelledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(makeGeminiCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 供設定頁「登入狀態」與聊天前置檢查共用：綜合 cookie + DOM 兩層判斷。 */
export async function getGeminiLoginState(): Promise<{ isLoggedIn: boolean; state: "login" | "captcha" | "app" | "unknown" }> {
  const hasCookies = await hasGoogleLoginCookies();
  if (!hasCookies) return { isLoggedIn: false, state: "login" };

  try {
    const win = await getOrCreateBackgroundWindow();
    const state = await detectPageState(win.webContents);
    return { isLoggedIn: state === "app", state };
  } catch {
    // 背景視窗建立失敗，僅回報 cookie 層的判斷，避免整個狀態查詢卡死。
    return { isLoggedIn: hasCookies, state: "unknown" };
  }
}

/** 設定頁「測試連線」：只確認能不能進到 Gemini 聊天頁面，不會真的送出訊息、不消耗額度。 */
export async function testGeminiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const { isLoggedIn, state } = await getGeminiLoginState();
    if (state === "captcha") {
      return { ok: false, message: "Gemini 網頁出現驗證（CAPTCHA），請重新登入並手動完成驗證。" };
    }
    if (!isLoggedIn) {
      return { ok: false, message: "尚未登入 Gemini，請先完成登入。" };
    }
    return { ok: true, message: "已登入，Gemini 背景模型可以正常使用。" };
  } catch (err) {
    return { ok: false, message: `連線測試失敗：${String(err)}` };
  }
}

/**
 * 昔漣聊天介面的核心橋接函式：把一段完整 prompt 送去背景 Gemini 網頁，
 * 等待生成完成後回傳完整文字；支援串流回呼、取消、逾時。
 * 絕不會無限期停住——要嘛 resolve 完整文字，要嘛在 timeoutMs 內以明確錯誤 reject。
 */
export async function runGeminiPrompt(
  promptText: string,
  onChunk?: (delta: string) => void,
  options: GeminiPromptOptions = {}
): Promise<string> {
  const { signal } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  if (signal?.aborted) throw makeGeminiCancelledError();

  let win;
  try {
    win = await getOrCreateBackgroundWindow();
  } catch (err) {
    throw new GeminiNetworkError(`無法開啟 Gemini 背景視窗：${String(err)}`);
  }

  const state = await detectPageState(win.webContents);
  if (state === "login") {
    openGeminiLoginWindow();
    throw new GeminiLoginRequiredError();
  }
  if (state === "captcha") {
    openGeminiLoginWindow();
    throw new GeminiCaptchaError();
  }
  if (state === "unknown") {
    throw new GeminiDomChangedError();
  }

  const sendResult = await sendMessage(win.webContents, promptText);
  if ("error" in sendResult) {
    throw new GeminiDomChangedError(sendResult.error);
  }

  let accumulated = "";
  let stableTicks = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      await clickStopGenerating(win.webContents);
      throw makeGeminiCancelledError();
    }

    try {
      await abortableDelay(POLL_INTERVAL_MS, signal);
    } catch {
      await clickStopGenerating(win.webContents);
      throw makeGeminiCancelledError();
    }

    const poll = await pollLatestReply(win.webContents);
    if (poll.error) {
      // 單次輪詢失敗不代表整體失敗（可能正好在切換頁面渲染），繼續嘗試直到逾時。
      continue;
    }
    if (poll.quotaLimited) {
      throw new GeminiRateLimitError();
    }

    if (poll.text && poll.text !== accumulated) {
      const delta = poll.text.slice(accumulated.length);
      accumulated = poll.text;
      if (delta && onChunk) onChunk(delta);
      stableTicks = 0;
    } else if (accumulated && !poll.isGenerating) {
      stableTicks++;
      if (stableTicks >= STABLE_TICKS_TO_FINISH) {
        return accumulated;
      }
    }
  }

  if (accumulated) {
    // 已經拿到部分內容但一直没稳定收尾，仍然把已经生成的內容視為結果，避免白白丟棄。
    return accumulated;
  }
  throw new GeminiTimeoutError();
}
