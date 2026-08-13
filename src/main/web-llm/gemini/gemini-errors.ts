/**
 * Gemini 網頁背景模型的錯誤分類。
 * 每一種錯誤都對應聊天終態（completed/cancelled/timeout/login_required/failed）中的一種，
 * 讓上層（chat-loop / IPC）能可靠地結束流程，不會永久停在「昔漣正在等模型回應」。
 */

export type GeminiErrorCode =
  | "login_required"
  | "captcha"
  | "rate_limited"
  | "network_error"
  | "dom_changed"
  | "timeout"
  | "cancelled";

export class GeminiWebError extends Error {
  readonly code: GeminiErrorCode;

  constructor(code: GeminiErrorCode, message: string) {
    super(message);
    this.name = "GeminiWebError";
    this.code = code;
  }
}

export class GeminiLoginRequiredError extends GeminiWebError {
  constructor(message = "請先在彈出的登入視窗完成 Gemini 帳號登入。") {
    super("login_required", message);
    this.name = "GeminiLoginRequiredError";
  }
}

export class GeminiCaptchaError extends GeminiWebError {
  constructor(message = "Gemini 網頁出現驗證（CAPTCHA），請在登入視窗手動完成驗證。") {
    super("captcha", message);
    this.name = "GeminiCaptchaError";
  }
}

export class GeminiRateLimitError extends GeminiWebError {
  constructor(message = "Gemini 目前已達使用額度上限，請稍後再試。") {
    super("rate_limited", message);
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiNetworkError extends GeminiWebError {
  constructor(message = "無法連線到 Gemini 網頁，請確認網路連線。") {
    super("network_error", message);
    this.name = "GeminiNetworkError";
  }
}

export class GeminiDomChangedError extends GeminiWebError {
  constructor(message = "Gemini 網頁介面已變更，昔漣暫時無法自動操作，請通知開發者更新。") {
    super("dom_changed", message);
    this.name = "GeminiDomChangedError";
  }
}

export class GeminiTimeoutError extends GeminiWebError {
  constructor(message = "Gemini 回應逾時，請稍後再試一次。") {
    super("timeout", message);
    this.name = "GeminiTimeoutError";
  }
}

/** 取消時建構標準 DOMException，讓上層既有的 AbortError 分類邏輯可以直接辨識。 */
export function makeGeminiCancelledError(): DOMException {
  return new DOMException("Gemini 請求已取消", "AbortError");
}
