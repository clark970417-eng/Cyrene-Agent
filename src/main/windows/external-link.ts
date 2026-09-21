import { app, BrowserWindow, shell } from "electron";
import { isDev } from "../env";

/**
 * 处理外部 URL：非 http(s) 拒绝，开发环境 localhost:5173 也拒绝（避免调试时误开）。
 * 返回 true 表示已拦截并转交给系统浏览器。
 */
export function openExternalUrl(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (isDev && url.startsWith("http://localhost:5173")) return false;
  void shell.openExternal(url);
  return true;
}

/**
 * 为 BrowserWindow 挂载外链拦截：
 *  - setWindowOpenHandler：拦截新窗口/外部链接
 *  - will-navigate：拦截页面内导航
 */
export function attachExternalLinkHandler(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    return openExternalUrl(url) ? { action: "deny" } : { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (openExternalUrl(url)) {
      event.preventDefault();
    }
  });
}

function isCyrenePage(url: string): boolean {
  return url.startsWith("file://") ||
    url.startsWith("cyrene-") ||
    (isDev && (url.startsWith("http://localhost:5173") || url.startsWith("http://127.0.0.1:5173")));
}

/** Protect every current and future Cyrene renderer without breaking remote login windows. */
export function installGlobalNavigationGuard(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (!isCyrenePage(contents.getURL())) return { action: "allow" };
      openExternalUrl(url);
      return { action: "deny" };
    });

    contents.on("will-navigate", (event, url) => {
      if (!isCyrenePage(contents.getURL())) return;
      event.preventDefault();
      openExternalUrl(url);
    });
  });
}
