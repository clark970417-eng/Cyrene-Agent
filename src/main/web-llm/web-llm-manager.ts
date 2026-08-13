import { app, BrowserWindow, session } from "electron";
import * as path from "path";

export type WebLlmProvider = "chatgpt_web" | "gemini_web";

export interface WebLlmStatus {
  provider: WebLlmProvider;
  isLoggedIn: boolean;
  activeModel: string;
}

let loginWindow: BrowserWindow | null = null;

const PERSIST_PARTITION = "persist:web-llm";

/** 取與管理 Web LLM 共用的獨立 Electron Session */
export function getWebLlmSession() {
  return session.fromPartition(PERSIST_PARTITION);
}

/** 開啟供用戶登入 ChatGPT / Gemini 網頁的視窗 */
export async function openWebLlmLoginWindow(provider: WebLlmProvider): Promise<void> {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const targetUrl =
    provider === "chatgpt_web" ? "https://chatgpt.com" : "https://gemini.google.com";

  loginWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    title: provider === "chatgpt_web" ? "登入 ChatGPT Plus" : "登入 Gemini Advanced",
    autoHideMenuBar: true,
    webPreferences: {
      partition: PERSIST_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loginWindow.loadURL(targetUrl);

  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

/** 檢查特定網頁服務登入狀態 */
export async function checkWebLlmStatus(provider: WebLlmProvider): Promise<WebLlmStatus> {
  const sess = getWebLlmSession();
  const cookies = await sess.cookies.get({});

  if (provider === "chatgpt_web") {
    // 檢查包含 session token 的 cookie (如 __Secure-next-auth.session-token)
    const isLoggedIn = cookies.some(
      (c) => c.name.includes("session-token") || c.name.includes("cf_clearance")
    );
    return {
      provider,
      isLoggedIn,
      activeModel: "GPT-4o (Web)",
    };
  } else {
    // 檢查包含 Google 登入 SID / HSID cookie
    const isLoggedIn = cookies.some(
      (c) => c.domain?.includes("google") && (c.name === "SID" || c.name === "HSID" || c.name === "SAPISID")
    );
    return {
      provider,
      isLoggedIn,
      activeModel: "Gemini 1.5 Pro (Web)",
    };
  }
}
