import { app, BrowserWindow } from "electron";
import { getWebLlmSession, openWebLlmLoginWindow } from "./web-llm-manager";

let bgWindow: BrowserWindow | null = null;

async function getOrCreateBgWindow(url: string): Promise<BrowserWindow> {
  if (bgWindow && !bgWindow.isDestroyed()) {
    return bgWindow;
  }

  bgWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // 背景隱藏執行
    webPreferences: {
      partition: "persist:web-llm",
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await bgWindow.loadURL(url);
  return bgWindow;
}

export async function runChatGPTWebPrompt(
  prompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const win = await getOrCreateBgWindow("https://chatgpt.com");

  // 檢查是否處於未登入介面
  const isLoginPage = win.webContents.getURL().includes("/auth/login");
  if (isLoginPage) {
    await openWebLlmLoginWindow("chatgpt_web");
    throw new Error("請先在彈出的登入視窗完成 ChatGPT Plus 帳號登入！");
  }

  // 透過在 Webview 頁面執行 Script 自動填入輸入框並點擊送出，擷取串流文字
  const script = `
    (async function() {
      const textarea = document.querySelector("#prompt-textarea") || document.querySelector("textarea");
      if (!textarea) return { error: "找不到輸入框" };

      textarea.value = ${JSON.stringify(prompt)};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(r => setTimeout(r, 300));
      const sendBtn = document.querySelector('button[data-testid="send-button"]') || document.querySelector('button[aria-label="Send prompt"]');
      if (sendBtn) {
        sendBtn.click();
        return { ok: true };
      }
      return { error: "找不到發送按鈕" };
    })();
  `;

  const initRes = await win.webContents.executeJavaScript(script);
  if (initRes?.error) {
    throw new Error(`ChatGPT Web 驅動失敗: ${initRes.error}`);
  }

  // 輪詢讀取最後一條語音/模型回覆區塊
  let accumulated = "";
  let staleCount = 0;

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const pollScript = `
      (function() {
        const turnEls = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (!turnEls || turnEls.length === 0) return { text: "", isGenerating: true };
        const lastTurn = turnEls[turnEls.length - 1];
        const text = lastTurn.textContent || "";
        const isGenerating = !!document.querySelector('button[data-testid="stop-button"]') || !!document.querySelector('.streaming');
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
      if (staleCount >= 2) break; // 穩定完成生成
    }
  }

  if (!accumulated) {
    throw new Error("ChatGPT Web 生成超時或尚未登入，請確認登入狀態！");
  }

  return accumulated;
}
