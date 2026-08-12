import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`sealed:${value}`), decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, "") } }));
import { preserveCurrentSecrets, protectSecrets, redactSecrets, revealSecrets } from "./secret-vault";

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
});
