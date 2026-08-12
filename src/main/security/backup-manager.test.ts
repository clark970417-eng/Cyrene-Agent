import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => false, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString("utf8") } }));
import { BackupManager } from "./backup-manager";

const dirs: string[] = [];
function temp(): string { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-backup-test-")); dirs.push(dir); return dir; }
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("BackupManager", () => {
  it("備份並選擇性還原聊天、記憶與歷史統計", () => {
    const userData = temp();
    fs.mkdirSync(path.join(userData, "cyrene-chats"));
    fs.writeFileSync(path.join(userData, "cyrene-chats", "one.json"), "chat-old");
    fs.writeFileSync(path.join(userData, "memory.json"), "memory-old");
    fs.writeFileSync(path.join(userData, "token-usage.json"), "tokens-old");
    fs.writeFileSync(path.join(userData, "call-usage.json"), "calls-old");
    const backup = path.join(temp(), "test.cybackup");
    const manager = new BackupManager(userData, "1.2.3");
    expect(manager.create(backup, ["conversations", "memories", "planning"]).fileCount).toBe(4);
    fs.writeFileSync(path.join(userData, "token-usage.json"), "tokens-new");
    manager.restore(backup, ["planning"]);
    expect(fs.readFileSync(path.join(userData, "token-usage.json"), "utf8")).toBe("tokens-old");
    expect(manager.inspect(backup).appVersion).toBe("1.2.3");
  });

  it("備份會移除密鑰，還原時保留目前密鑰", () => {
    const userData = temp();
    const file = path.join(userData, "model-settings.json");
    fs.writeFileSync(file, JSON.stringify({ apiKey: "old-secret", model: "old" }));
    const backup = path.join(temp(), "settings.cybackup");
    const manager = new BackupManager(userData, "1.0.0");
    manager.create(backup, ["settings"]);
    fs.writeFileSync(file, JSON.stringify({ apiKey: "current-secret", model: "new" }));
    manager.restore(backup, ["settings"]);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ apiKey: "current-secret", model: "old" });
  });
});
