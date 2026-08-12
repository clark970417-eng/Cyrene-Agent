import { safeStorage } from "electron";

const VAULT_PREFIX = "cyvault:v1:";

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  return normalized === "pass"
    || normalized.endsWith("password")
    || normalized.endsWith("pass")
    || normalized.includes("apikey")
    || normalized.endsWith("key")
    || normalized.endsWith("secret")
    || normalized.endsWith("token")
    || normalized === "accesskeyid";
}

export function isProtectedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(VAULT_PREFIX);
}

export function protectSecret(value: string): string {
  if (!value || isProtectedSecret(value) || !safeStorage.isEncryptionAvailable()) return value;
  return VAULT_PREFIX + safeStorage.encryptString(value).toString("base64");
}

export function revealSecret(value: string): string {
  if (!isProtectedSecret(value)) return value;
  if (!safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(VAULT_PREFIX.length), "base64"));
  } catch {
    return "";
  }
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
