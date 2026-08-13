import { session, Session } from "electron";

/**
 * 昔漣專用的 Gemini 持久化網頁工作階段。
 * 使用獨立 partition，與其他網頁登入（如 ChatGPT）完全隔離；
 * Electron 會把它的 cookie／storage 持久化到 userData，App 重啟後登入狀態仍會保留。
 */
export const GEMINI_PERSIST_PARTITION = "persist:cyrene-gemini";

export function getGeminiSession(): Session {
  return session.fromPartition(GEMINI_PERSIST_PARTITION);
}

/** 只用 cookie 做初步判斷；真正是否可用仍需搭配 DOM 偵測（見 gemini-dom-adapter）。 */
export async function hasGoogleLoginCookies(): Promise<boolean> {
  const cookies = await getGeminiSession().cookies.get({ domain: ".google.com" });
  return cookies.some((c) => c.name === "SID" || c.name === "HSID" || c.name === "SAPISID" || c.name === "__Secure-1PSID");
}

/** 登出：清除這個 partition 底下的所有登入資料，不影響其他網頁服務或使用者其他 Google 工作階段。 */
export async function clearGeminiSession(): Promise<void> {
  const sess = getGeminiSession();
  await sess.clearStorageData();
  await sess.clearCache();
}
