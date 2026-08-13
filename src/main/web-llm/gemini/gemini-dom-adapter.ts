import type { WebContents } from "electron";

/**
 * 所有跟 Gemini 網頁 DOM 結構有關的邏輯集中在這個檔案。
 * Google 網頁改版時，理論上只需要更新這裡的選擇器／腳本，不用動 gemini-bridge 或其他程式。
 *
 * 每個函式都對應「讀懂教學文件」10 種必要狀態裡的一部分：
 * detectPageState → 登入態 / CAPTCHA
 * sendMessage     → 輸入訊息、送出訊息
 * pollLatestReply → 等待新回覆、判斷回覆完成、只擷取本輪最新回覆、額度限制
 */

export type GeminiPageState = "login" | "captcha" | "app" | "unknown";

export interface GeminiPollResult {
  text: string;
  isGenerating: boolean;
  quotaLimited: boolean;
  error?: string;
}

async function exec<T>(webContents: WebContents, script: string): Promise<T> {
  return webContents.executeJavaScript(script, true) as Promise<T>;
}

/** 判斷目前頁面狀態：需要登入／CAPTCHA／正常進入聊天頁。 */
export async function detectPageState(webContents: WebContents): Promise<GeminiPageState> {
  const url = webContents.getURL();
  if (url.includes("accounts.google.com")) return "login";
  if (/\/sorry\/|recaptcha/i.test(url)) return "captcha";

  const script = `
    (function() {
      const hasCaptcha = !!document.querySelector('iframe[src*="recaptcha"], div.g-recaptcha, #captcha-form');
      if (hasCaptcha) return "captcha";
      const hasComposer = !!document.querySelector('.ql-editor, rich-textarea div[contenteditable="true"]');
      if (hasComposer) return "app";
      return "unknown";
    })();
  `;
  try {
    const state = await exec<GeminiPageState>(webContents, script);
    return state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** 在輸入框打字並送出訊息。prompt 以 JSON 字串安全帶入，避免任何注入問題。 */
export async function sendMessage(
  webContents: WebContents,
  promptText: string
): Promise<{ ok: true } | { error: string }> {
  const script = `
    (function() {
      const inputEl =
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('.ql-editor') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]');
      if (!inputEl) return { error: "找不到 Gemini 輸入欄，介面可能已變更" };

      inputEl.focus();
      document.execCommand('insertText', false, ${JSON.stringify(promptText)});
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));

      return { __pending: true };
    })();
  `;
  try {
    const res = await exec<{ __pending?: true; error?: string }>(webContents, script);
    if (res?.error) return { error: res.error };
  } catch (err) {
    return { error: `輸入訊息失敗：${String(err)}` };
  }

  // 送出按鈕通常要等輸入框內容變化後才會從 disabled 變成可點擊，稍等一輪再找按鈕。
  await new Promise((r) => setTimeout(r, 300));

  const sendScript = `
    (function() {
      const sendBtn =
        document.querySelector('button.send-button:not([disabled])') ||
        document.querySelector('button[aria-label*="Send" i]:not([disabled])') ||
        document.querySelector('button[aria-label*="傳送" i]:not([disabled])') ||
        document.querySelector('button[aria-label*="送出" i]:not([disabled])');
      if (!sendBtn) return { error: "找不到 Gemini 送出按鈕，介面可能已變更" };
      sendBtn.click();
      return { ok: true };
    })();
  `;
  try {
    const res = await exec<{ ok?: true; error?: string }>(webContents, sendScript);
    if (res?.error) return { error: res.error };
    return { ok: true };
  } catch (err) {
    return { error: `送出訊息失敗：${String(err)}` };
  }
}

const QUOTA_PATTERNS = [
  "reached your limit",
  "已達.*上限",
  "已达.*上限",
  "usage limit",
  "try again later",
];

/** 輪詢目前最新一則回覆；只取「本輪」最後一則 assistant 訊息的完整文字。 */
export async function pollLatestReply(webContents: WebContents): Promise<GeminiPollResult> {
  const script = `
    (function() {
      const responseEls = document.querySelectorAll('message-content');
      const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[aria-label*="停止" i]');
      const spinner = document.querySelector('.loading-indicator, mat-progress-bar, .sparkle-container');
      const isGenerating = !!stopBtn || !!spinner;

      if (!responseEls || responseEls.length === 0) {
        return { text: "", isGenerating, quotaLimited: false };
      }
      const lastResp = responseEls[responseEls.length - 1];
      const text = lastResp.textContent || "";
      return { text, isGenerating, quotaLimited: false };
    })();
  `;
  try {
    const res = await exec<GeminiPollResult>(webContents, script);
    if (!res) return { text: "", isGenerating: false, quotaLimited: false, error: "輪詢無回應" };
    const lower = res.text.toLowerCase();
    const quotaLimited = QUOTA_PATTERNS.some((p) => new RegExp(p, "i").test(lower) || new RegExp(p, "i").test(res.text));
    return { ...res, quotaLimited };
  } catch (err) {
    return { text: "", isGenerating: false, quotaLimited: false, error: String(err) };
  }
}

/** 點擊 Gemini 頁面上的「停止產生」按鈕（若存在），用於使用者主動取消。 */
export async function clickStopGenerating(webContents: WebContents): Promise<void> {
  const script = `
    (function() {
      const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[aria-label*="停止" i]');
      if (stopBtn) stopBtn.click();
    })();
  `;
  try {
    await exec(webContents, script);
  } catch {
    // 找不到就算了，取消本來就是 best-effort。
  }
}
