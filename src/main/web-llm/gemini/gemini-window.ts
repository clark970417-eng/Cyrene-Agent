import { BrowserWindow } from "electron";
import { GEMINI_PERSIST_PARTITION } from "./gemini-session";

const GEMINI_URL = "https://gemini.google.com/app";

let bgWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null;

/**
 * 背景視窗：平常聊天時完全隱藏（show:false），只用來代替使用者操作 Gemini 網頁。
 * 與登入視窗共用同一個 persist:cyrene-gemini partition，登入狀態會同步。
 */
export async function getOrCreateBackgroundWindow(): Promise<BrowserWindow> {
  if (bgWindow && !bgWindow.isDestroyed()) {
    return bgWindow;
  }

  bgWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      partition: GEMINI_PERSIST_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  bgWindow.on("closed", () => {
    bgWindow = null;
  });

  await bgWindow.loadURL(GEMINI_URL);
  return bgWindow;
}

export function isBackgroundWindowReady(): boolean {
  return !!bgWindow && !bgWindow.isDestroyed();
}

export async function reloadBackgroundWindow(): Promise<void> {
  if (bgWindow && !bgWindow.isDestroyed()) {
    bgWindow.destroy();
  }
  bgWindow = null;
  await getOrCreateBackgroundWindow();
}

/**
 * 獨立登入視窗：只在使用者第一次使用、或登入失效需要重新登入時開啟。
 * 密碼、兩步驟驗證、CAPTCHA 一律由使用者在這個視窗手動完成，
 * 昔漣不會讀取、攔截或自動填入任何帳號密碼資料。
 */
export function openGeminiLoginWindow(): BrowserWindow {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return loginWindow;
  }

  loginWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    title: "登入 Gemini（昔漣背景模型）",
    autoHideMenuBar: true,
    webPreferences: {
      partition: GEMINI_PERSIST_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  loginWindow.loadURL(GEMINI_URL);

  loginWindow.on("closed", () => {
    loginWindow = null;
    // 登入視窗關閉後，讓背景視窗重新載入一次，確保拿到最新的登入 cookie。
    void reloadBackgroundWindow().catch((err) => {
      console.error("[Gemini] 登入後重新載入背景視窗失敗：", err);
    });
  });

  return loginWindow;
}

export function isLoginWindowOpen(): boolean {
  return !!loginWindow && !loginWindow.isDestroyed();
}

export function focusLoginWindowIfOpen(): boolean {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return true;
  }
  return false;
}

export function destroyGeminiWindows(): void {
  if (bgWindow && !bgWindow.isDestroyed()) bgWindow.destroy();
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.destroy();
  bgWindow = null;
  loginWindow = null;
}
