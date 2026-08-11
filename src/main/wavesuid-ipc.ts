import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, desktopCapturer, dialog, ipcMain, shell, systemPreferences } from "electron";
import { IPC } from "../shared/ipc-channels";
import { loadChannelsSettings } from "./channels/settings-store";
import { requestWavesUid } from "./channels/adapters/discord/wavesuid";

type LoginState = { phase: "idle" | "waiting" | "connected" | "failed"; message: string; uid?: string };
let loginState: LoginState = { phase: "idle", message: "尚未連結國際服帳號。" };

function mediaType(name: string): string {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.json$/i.test(name)) return "application/json";
  return "application/octet-stream";
}

function baseDir(): string { return path.join(os.homedir(), ".local", "share", "cyrene-wavesuid"); }
function playersPath(): string { return process.env.CYRENE_WAVESUID_PLAYERS_DIR?.trim() || path.join(baseDir(), "gsuid_core", "data", "WutheringWavesUID", "players"); }
function databasePath(): string { return path.join(baseDir(), "gsuid_core", "data", "GsData.db"); }
function userId(): string { return loadChannelsSettings().discord.codexImageOwnerId || "desktop-owner"; }
function context(messageId: string) {
  return { botSelfId: "discord", messageId, userId: userId(), userName: "夥伴", isDirect: true };
}

function exec(file: string, args: string[], timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => execFile(file, args, { timeout }, (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)));
}

async function linkedUid(): Promise<string | undefined> {
  if (!fs.existsSync(databasePath())) return undefined;
  const safe = userId().replace(/[^0-9]/g, "");
  if (!safe) return undefined;
  try {
    const stdout = await exec("sqlite3", ["-noheader", databasePath(), `SELECT uid FROM wavesuser WHERE bot_id = 'discord' AND user_id = '${safe}' AND cookie != '' ORDER BY id DESC LIMIT 1;`], 2_500);
    const uid = stdout.trim();
    return /^\d{9}$/.test(uid) ? uid : undefined;
  } catch { return undefined; }
}

async function waitForPage(url: string): Promise<boolean> {
  for (let i = 0; i < 20; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok && /國際服登入|international\/login/u.test(await response.text())) return true;
    } catch { /* local service may still be preparing */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function registerWavesUidIpc(): void {
  for (const channel of [IPC.WAVES_UID_STATUS, IPC.WAVES_UID_RUN, IPC.WAVES_UID_PICK_FILE, IPC.WAVES_UID_CAPTURE_DISCORD, IPC.WAVES_UID_LOGIN, IPC.WAVES_UID_LOGIN_STATUS, IPC.WAVES_UID_DATA_STATUS, IPC.WAVES_UID_DELETE_DATA]) ipcMain.removeHandler(channel);

  ipcMain.handle(IPC.WAVES_UID_STATUS, async () => {
    const ocr = fs.existsSync(path.join(baseDir(), "bin", "cyrene-vision-ocr"));
    try {
      const response = await fetch("http://127.0.0.1:8765/app", { signal: AbortSignal.timeout(2_500) });
      return { online: response.ok || response.status === 307, localOcr: ocr };
    } catch { return { online: false, localOcr: ocr }; }
  });
  ipcMain.handle(IPC.WAVES_UID_DATA_STATUS, async () => {
    try {
      const entries = await fsp.readdir(playersPath(), { withFileTypes: true });
      return { uids: entries.filter((entry) => entry.isDirectory() && /^\d{9}$/.test(entry.name) && fs.existsSync(path.join(playersPath(), entry.name, "userData.json"))).map((entry) => entry.name).sort() };
    } catch { return { uids: [] as string[] }; }
  });
  ipcMain.handle(IPC.WAVES_UID_DELETE_DATA, async (_event, value: string) => {
    const uid = String(value ?? "").trim();
    if (!/^\d{9}$/.test(uid)) return { ok: false, error: "UID 格式不正確" };
    const root = path.resolve(playersPath());
    const target = path.resolve(root, uid);
    if (!target.startsWith(root + path.sep)) return { ok: false, error: "資料路徑不安全" };
    await fsp.rm(target, { recursive: true, force: false }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    return { ok: true };
  });
  ipcMain.handle(IPC.WAVES_UID_RUN, async (_event, payload: { command?: string; attachments?: Array<{ name: string; url: string; contentType?: string }> }) => {
    try {
      const reply = await requestWavesUid(payload?.command?.trim().slice(0, 500) || "幫助", { ...context(`electron-${Date.now()}`), attachments: (payload?.attachments ?? []).slice(0, 4) });
      const media: Array<{ name: string; url?: string; dataUrl?: string }> = [];
      reply.attachments.forEach((attachment, index) => {
        const name = attachment.name || `wavesuid-${index + 1}.bin`;
        const source = attachment.attachment;
        if (typeof source === "string") { media.push({ name, url: source }); return; }
        if (!Buffer.isBuffer(source) && !(source instanceof Uint8Array)) return;
        const buffer = Buffer.from(source);
        media.push({ name, dataUrl: `data:${mediaType(name)};base64,${buffer.toString("base64")}` });
      });
      return { ok: true, text: reply.text, media };
    } catch (error) { return { ok: false, text: "", media: [], error: error instanceof Error ? error.message : String(error) }; }
  });
  ipcMain.handle(IPC.WAVES_UID_PICK_FILE, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = owner ? await dialog.showOpenDialog(owner, { title: "選擇鳴潮資料或圖片", properties: ["openFile"], filters: [{ name: "鳴潮資料與圖片", extensions: ["json", "txt", "png", "jpg", "jpeg", "webp", "gif"] }] }) : await dialog.showOpenDialog({ properties: ["openFile"] });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    const stat = await fsp.stat(filePath);
    if (stat.size > 24 * 1024 * 1024) throw new Error("檔案不可超過 24 MB");
    const name = path.basename(filePath);
    return { name, contentType: mediaType(name), url: `base64://${(await fsp.readFile(filePath)).toString("base64")}` };
  });
  ipcMain.handle(IPC.WAVES_UID_LOGIN_STATUS, async () => {
    const uid = await linkedUid();
    return uid ? { phase: "connected" as const, message: "國際服帳號已連結，可直接查詢體力。", uid } : { ...loginState };
  });
  ipcMain.handle(IPC.WAVES_UID_LOGIN, async () => {
    const id = userId();
    const loginUrl = `http://127.0.0.1:8765/waves/i/${createHash("sha256").update(id).digest("hex").slice(0, 8)}`;
    loginState = { phase: "waiting", message: "正在準備本機國際服登入頁…" };
    void requestWavesUid("登入", context(`electron-login-${Date.now()}`), undefined, 620_000).then((reply) => {
      const success = /(?:登入|登录)成功/u.test(reply.text);
      const uid = /(?:特徵碼|特征码|uid)[^\d]*(\d{9})/iu.exec(reply.text)?.[1];
      loginState = success ? { phase: "connected", message: "國際服帳號已連結，可直接查詢體力。", uid } : { phase: "failed", message: reply.text.trim() || "登入沒有完成，請重新連結。" };
    }).catch((error) => { loginState = { phase: "failed", message: error instanceof Error ? error.message : String(error) }; });
    if (!await waitForPage(loginUrl)) return { ok: false, error: "本機登入頁準備逾時，請確認 GsCore 在線後重試。" };
    await shell.openExternal(loginUrl);
    return { ok: true, phase: "waiting" };
  });
  ipcMain.handle(IPC.WAVES_UID_CAPTURE_DISCORD, async () => {
    if (process.platform === "darwin" && ["denied", "restricted"].includes(systemPreferences.getMediaAccessStatus("screen"))) return { ok: false, error: "請先在 macOS「隱私權與安全性 → 螢幕與系統錄音」允許昔漣擷取畫面。" };
    const crop = path.join(baseDir(), "bin", "cyrene-vision-card-crop");
    if (!fs.existsSync(crop)) return { ok: false, error: "尚未安裝本機角色卡裁切器。" };
    const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 3200, height: 2000 }, fetchWindowIcons: false });
    const source = sources.filter((item) => /discord/i.test(item.name) && !item.thumbnail.isEmpty()).sort((a, b) => { const x = a.thumbnail.getSize(); const y = b.thumbnail.getSize(); return y.width * y.height - x.width * x.height; })[0];
    if (!source) return { ok: false, error: "找不到 Discord 視窗，請先開啟官方角色卡大圖。" };
    const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "cyrene-wuwa-capture-"));
    const input = path.join(temp, "discord.png");
    const output = path.join(temp, "card.png");
    try {
      await fsp.writeFile(input, source.thumbnail.toPNG(), { mode: 0o600 });
      await exec(crop, [input, output]);
      const bytes = await fsp.readFile(output);
      if (!bytes.length) throw new Error("裁切後圖片為空白");
      return { ok: true, file: { name: `wuwa-discord-${Date.now()}.png`, contentType: "image/png", url: `base64://${bytes.toString("base64")}` } };
    } catch (error) { return { ok: false, error: `沒有找到清晰的橫向角色卡：${error instanceof Error ? error.message : String(error)}` }; }
    finally { await fsp.rm(temp, { recursive: true, force: true }); }
  });
}
