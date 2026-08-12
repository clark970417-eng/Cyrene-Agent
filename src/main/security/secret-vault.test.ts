import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`sealed:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, "") } }));
import {
  preserveCurrentSecrets,
  preserveLockedSecrets,
  protectSecrets,
  redactSecrets,
  revealSecrets,
} from "./secret-vault";

describe("secret vault", () => {
  it("保護巢狀密鑰並可還原", () => {
    const value = { apiKey: "main", nested: { clientSecret: "nested" }, model: "demo" };
    expect(revealSecrets(protectSecrets(value))).toEqual(value);
  });
  it("備份移除密鑰且還原保留目前密鑰", () => {
    const current = protectSecrets({ apiKey: "keep", model: "new" });
    const incoming = redactSecrets({ apiKey: "old", model: "old" });
    expect(preserveCurrentSecrets(incoming, current)).toEqual({ apiKey: current.apiKey, model: "old" });
  });
  it("快捷鍵不會被誤判為憑證", () => {
    const value = protectSecrets({ screenshotHotkey: "Alt+Shift+S", apiKey: "secret" });
    expect(value.screenshotHotkey).toBe("Alt+Shift+S");
    expect(value.apiKey).toMatch(/^cyvault:v1:/);
  });
  it("Keychain 暫時鎖定時保留磁碟原密文", () => {
    const current = protectSecrets({ apiKey: "keep", nested: { clientSecret: "nested" } });
    expect(preserveLockedSecrets({ apiKey: "", nested: { clientSecret: "" } }, current)).toEqual(current);
  });
});
