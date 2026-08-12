import * as fs from "fs";
import * as path from "path";
import { app, dialog, ipcMain, safeStorage } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { BackupManager } from "./backup-manager";

function countProtectedValues(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countProtectedValues(item), 0);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).reduce<number>((sum, item) => sum + countProtectedValues(item), 0);
  return typeof value === "string" && (/^(?:cyvault:v1:|enc:|obf:)/).test(value) ? 1 : 0;
}

export function registerBackupIpc(): BackupManager {
  const manager = new BackupManager(app.getPath("userData"), app.getVersion());

  ipcMain.handle(IPC.SECURITY_GET_STATUS, () => {
    let protectedCount = 0;
    for (const name of ["app-settings.json", "model-settings.json", "channels-settings.json", "game-bot-settings.json"]) {
      try { protectedCount += countProtectedValues(JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), name), "utf8"))); } catch { /* 檔案可不存在 */ }
    }
    return { available: safeStorage.isEncryptionAvailable(), backend: process.platform === "darwin" ? "macOS Keychain" : "系統保管庫", protectedCount, plaintextCount: 0, lockedCount: 0 };
  });
  ipcMain.handle(IPC.BACKUP_GET_CONFIG, () => manager.getConfig());
  ipcMain.handle(IPC.BACKUP_SAVE_CONFIG, (_event, patch) => {
    const config = manager.saveConfig(patch ?? {});
    if (config.autoEnabled) manager.runAutoBackupIfDue();
    return config;
  });
  ipcMain.handle(IPC.BACKUP_CREATE, async (_event, categories) => {
    const result = await dialog.showSaveDialog({ title: "建立昔漣時間膠囊", defaultPath: `昔漣備份-${new Date().toISOString().slice(0, 10)}.cybackup`, filters: [{ name: "昔漣備份", extensions: ["cybackup"] }] });
    if (result.canceled || !result.filePath) return null;
    const output = result.filePath.endsWith(".cybackup") ? result.filePath : `${result.filePath}.cybackup`;
    return manager.create(output, categories);
  });
  ipcMain.handle(IPC.BACKUP_PICK_INSPECT, async () => {
    const result = await dialog.showOpenDialog({ title: "選擇昔漣時間膠囊", properties: ["openFile"], filters: [{ name: "昔漣備份", extensions: ["cybackup"] }] });
    return result.canceled || !result.filePaths[0] ? null : manager.inspect(result.filePaths[0]);
  });
  ipcMain.handle(IPC.BACKUP_RESTORE, (_event, payload) => {
    if (!payload?.filePath) throw new Error("請先選擇備份檔");
    return manager.restore(payload.filePath, payload.categories);
  });
  ipcMain.on(IPC.SECURITY_RESTART_APP, () => { app.relaunch(); app.exit(0); });

  return manager;
}
