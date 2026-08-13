import { ipcMain } from "electron";
import { IPC } from "../../../shared/ipc-channels";
import { openGeminiLoginWindow, focusLoginWindowIfOpen } from "./gemini-window";
import { getGeminiLoginState, testGeminiConnection } from "./gemini-bridge";
import { clearGeminiSession } from "./gemini-session";

let registered = false;

/** 設定頁「登入／登入狀態／重新登入／測試連線／登出」全部走這裡。 */
export function registerGeminiIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle(IPC.GEMINI_OPEN_LOGIN, async () => {
    if (!focusLoginWindowIfOpen()) {
      openGeminiLoginWindow();
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.GEMINI_GET_STATUS, async () => {
    return getGeminiLoginState();
  });

  ipcMain.handle(IPC.GEMINI_TEST_CONNECTION, async () => {
    return testGeminiConnection();
  });

  ipcMain.handle(IPC.GEMINI_LOGOUT, async () => {
    await clearGeminiSession();
    return { ok: true };
  });
}
