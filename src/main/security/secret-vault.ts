import { safeStorage } from "electron";

const VAULT_PREFIX = "cyvault:v1:";

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  // 快捷鍵只是 UI 鍵盤組合，不是憑證。舊版的 screenshotHotkey 曾因
  // endsWith("key") 被誤加密，造成新版看起來像沒有沿用設定。
  if (normalized.endsWith("hotkey")) return false;
  return normalized === "pass"
    || normalized.endsWith("password")
    || normalized.endsWith("pass")
    || normalized.includes("apikey")
    || normalized.endsWith("key")
    || normalized.endsWith("secret")
    || normalized.endsWith("token")
    || normalized === "accesskeyid";
}

/** Electron ready 前 safeStorage 可能暫時回 false；失敗狀態不能被快取。 */
export function isSecretVaultAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function isProtectedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(VAULT_PREFIX);
}

export function protectSecret(value: string): string {
  if (!value || isProtectedSecret(value) || !isSecretVaultAvailable()) return value;
  return VAULT_PREFIX + safeStorage.encryptString(value).toString("base64");
}

export function revealSecret(value: string): string {
  if (!isProtectedSecret(value)) return value;
  if (!isSecretVaultAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(VAULT_PREFIX.length), "base64"));
  } catch {
    return "";
  }
}

/**
 * Keychain 尚未就緒時，已加密的欄位在記憶體中會暫時呈現空字串。
 * 儲存其他設定時必須把磁碟上的原密文放回去，不能以空值覆寫。
 */
export function preserveLockedSecrets(incoming: unknown, currentRaw: unknown, key = ""): unknown {
  if (isSecretKey(key) && isProtectedSecret(currentRaw)) {
    if (incoming === "" || incoming === null || incoming === undefined) return currentRaw;
  }
  if (Array.isArray(incoming)) return incoming;
  if (incoming && typeof incoming === "object") {
    const source = currentRaw && typeof currentRaw === "object"
      ? currentRaw as Record<string, unknown>
      : {};
    return Object.fromEntries(Object.entries(incoming as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      preserveLockedSecrets(child, source[childKey], childKey),
    ]));
  }
  return incoming;
}

function transformSecrets(value: unknown, mode: "protect" | "reveal", key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => transformSecrets(item, mode));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      transformSecrets(child, mode, childKey),
    ]));
  }
  if (typeof value !== "string" || !isSecretKey(key)) return value;
  return mode === "protect" ? protectSecret(value) : revealSecret(value);
}

export function protectSecrets<T>(value: T): T {
  return transformSecrets(value, "protect") as T;
}

export function revealSecrets<T>(value: T): T {
  return transformSecrets(value, "reveal") as T;
}

/** 建立可攜式備份時移除所有密鑰，避免把認證資料帶離這台 Mac。 */
export function redactSecrets(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      isSecretKey(childKey) ? "" : redactSecrets(child, childKey),
    ]));
  }
  return isSecretKey(key) ? "" : value;
}

/** 還原一般設定時沿用目前電腦上的密鑰，不以備份中的空值覆蓋。 */
export function preserveCurrentSecrets(incoming: unknown, current: unknown, key = ""): unknown {
  if (isSecretKey(key)) return current ?? incoming;
  if (Array.isArray(incoming)) return incoming;
  if (incoming && typeof incoming === "object") {
    const source = current && typeof current === "object" ? current as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(incoming as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      preserveCurrentSecrets(child, source[childKey], childKey),
    ]));
  }
  return incoming;
}
