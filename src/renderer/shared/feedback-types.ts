export type FeedbackTone = "success" | "info" | "warning" | "error";

export interface FeedbackNoticeOptions {
  tone: FeedbackTone;
  message: string;
  durationMs?: number;
  focusTarget?: HTMLElement | null;
}

export interface FeedbackAlertOptions {
  tone: FeedbackTone;
  title: string;
  message: string;
  details?: string;
  confirmText?: string;
}

export interface FeedbackConfirmOptions {
  title: string;
  message: string;
  tone?: FeedbackTone;
  dangerous?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export interface FeedbackApi {
  notice(options: FeedbackNoticeOptions): void;
  alert(options: FeedbackAlertOptions): Promise<void>;
  confirm(options: FeedbackConfirmOptions): Promise<boolean>;
}

export const FEEDBACK_NOTICE_DURATION_MS = 3_200;
export const FEEDBACK_NOTICE_MAX_COUNT = 3;
