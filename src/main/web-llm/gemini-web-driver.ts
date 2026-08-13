import { BrowserWindow } from "electron";
import { openWebLlmLoginWindow } from "./web-llm-manager";

let bgGeminiWindow: BrowserWindow | null = null;

async function getOrCreateGeminiWindow(): Promise<BrowserWindow> {
  if (bgGeminiWindow && !bgGeminiWindow.isDestroyed()) {
    return bgGeminiWindow;
  }

  bgGeminiWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      partition: "persist:web-llm",
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await bgGeminiWindow.loadURL("https://gemini.google.com");
  return bgGeminiWindow;
}

export async function runGeminiWebPrompt(
  prompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const win = await getOrCreateGeminiWindow();

  const isLoginPage = win.webContents.getURL().includes("accounts.google.com");
  if (isLoginPage) {
    await openWebLlmLoginWindow("gemini_web");
    throw new Error("請先在彈出的登入視窗完成 Gemini Advanced 帳號登入！");
  }

  const script = `
    (async function() {
      const inputEl = document.querySelector('.ql-editor') || document.querySelector('rich-textarea div[contenteditable="true"]');
      if (!inputEl) return { error: "找不到 Gemini 輸入欄" };

      inputEl.focus();
      document.execCommand('insertText', false, ${JSON.stringify(prompt)});

      await new Promise(r => setTimeout(r, 400));
      const sendBtn = document.querySelector('button.send-button') || document.querySelector('button[aria-label*="Send"]');
      if (sendBtn) {
        sendBtn.click();
        return { ok: true };
      }
      return { error: "找不到 Gemini 發送按鈕" };
    })();
  `;

  const initRes = await win.webContents.executeJavaScript(script);
  if (initRes?.error) {
    throw new Error(`Gemini Web 驅動失敗: ${initRes.error}`);
  }

  let accumulated = "";
  let staleCount = 0;

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const pollScript = `
      (function() {
        const responseEls = document.querySelectorAll('message-content');
        if (!responseEls || responseEls.length === 0) return { text: "", isGenerating: true };
        const lastResp = responseEls[responseEls.length - 1];
        const text = lastResp.textContent || "";
        const isGenerating = !!document.querySelector('.sparkle-container') || !!document.querySelector('mat-progress-bar');
        return { text, isGenerating };
      })();
    `;

    const pollRes = await win.webContents.executeJavaScript(pollScript).catch(() => null);
    if (!pollRes) continue;

    if (pollRes.text && pollRes.text !== accumulated) {
      const delta = pollRes.text.slice(accumulated.length);
      accumulated = pollRes.text;
      if (onChunk && delta) onChunk(delta);
      staleCount = 0;
    } else if (accumulated && !pollRes.isGenerating) {
      staleCount++;
      if (staleCount >= 2) break;
    }
  }

  if (!accumulated) {
    throw new Error("Gemini Web 生成超時，請確認是否已登入 Gemini Advanced！");
  }

  return accumulated;
}
