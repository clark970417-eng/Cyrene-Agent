import { Popover } from "antd";
import React, { useState } from "react";
import type { ContextUsageCategoryKey, ContextUsageSnapshot } from "../../../../../shared/context-usage";
import "./ContextUsageRing.css";

const SIZE = 22;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CATEGORY_LABELS: Record<ContextUsageCategoryKey, string> = {
  systemPrompt: "角色與系統設定",
  tools: "工具定義",
  skills: "技能",
  runtimeAndToolLogs: "執行紀錄",
  conversation: "對話內容",
  other: "其他",
};

export function computeContextRatio(totalTokens: number, contextWindowTokens: number): number {
  if (!Number.isFinite(totalTokens) || !Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) return 0;
  return Math.max(0, totalTokens / contextWindowTokens);
}

function formatTokens(value: number): string {
  if (value < 1_000) return String(Math.round(value));
  const thousands = value / 1_000;
  return `${thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

interface CompactResult {
  ok: boolean;
  error?: string;
}

function compactConversation(sessionId: string): Promise<CompactResult> | undefined {
  return (window as typeof window & {
    chatStore?: { compactConversation?: (id: string) => Promise<CompactResult> };
  }).chatStore?.compactConversation?.(sessionId);
}

export function ContextUsageRing({
  usage,
  sessionId,
  onCompacted,
}: {
  usage?: ContextUsageSnapshot;
  sessionId?: string;
  onCompacted?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [compactState, setCompactState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [compactError, setCompactError] = useState("");
  if (!usage) return null;
  const ratio = computeContextRatio(usage.totalTokens, usage.contextWindowTokens);
  const visualRatio = Math.min(1, ratio);
  const tone = ratio >= 0.9 ? "alert" : ratio >= 0.7 ? "warm" : "normal";
  const percent = Math.round(ratio * 100);
  const categories = usage.categories.filter((item) => item.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const title = `上下文已使用 ${percent}%`;

  async function handleCompact() {
    if (!sessionId || compactState === "running") return;
    const invoke = compactConversation(sessionId);
    if (!invoke) {
      setCompactState("error");
      setCompactError("目前無法使用整理功能");
      return;
    }
    setCompactState("running");
    setCompactError("");
    try {
      const result = await invoke;
      if (!result.ok) throw new Error(result.error || "整理失敗");
      await onCompacted?.();
      setCompactState("done");
    } catch (error) {
      setCompactState("error");
      setCompactError(error instanceof Error ? error.message : String(error));
    }
  }

  const details = (
    <div className="cy-context-usage-popover__body">
      <header>
        <strong>上下文容量</strong>
        <span>{formatTokens(usage.totalTokens)} / {formatTokens(usage.contextWindowTokens)} tokens</span>
      </header>
      <div className={`cy-context-usage-popover__bar is-${tone}`} aria-hidden="true">
        <span style={{ width: `${visualRatio * 100}%` }} />
      </div>
      <p>{tone === "alert" ? "容量接近上限，建議開始新對話或整理較早內容。" : tone === "warm" ? "對話逐漸變長，昔漣會在需要時自動整理內容。" : "目前仍有充足空間，可以繼續聊♪"}</p>
      <ul>
        {categories.map((category) => (
          <li key={category.key}>
            <span>{CATEGORY_LABELS[category.key]}</span>
            <strong>{formatTokens(category.tokens)}</strong>
          </li>
        ))}
      </ul>
      {sessionId ? (
        <button
          type="button"
          className="cy-context-usage-popover__compact"
          disabled={compactState === "running"}
          onClick={() => void handleCompact()}
        >
          {compactState === "running" ? "正在整理…" : compactState === "done" ? "已完成整理" : "整理較早內容"}
        </button>
      ) : null}
      {compactState === "error" ? <p className="cy-context-usage-popover__error" role="alert">{compactError}</p> : null}
      <footer>{usage.messageCount} 則模型訊息 · {usage.phase === "terminal" ? "本輪完成" : "本輪送出前"}</footer>
    </div>
  );

  return (
    <Popover
      content={details}
      trigger="click"
      placement="topRight"
      open={open}
      onOpenChange={setOpen}
      rootClassName="cy-context-usage-popover"
    >
      <button type="button" className={`cy-context-usage-ring is-${tone}`} aria-label={title} title={title}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle className="cy-context-usage-ring__track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} />
          <circle
            className="cy-context-usage-ring__progress"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${visualRatio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
        <span>{percent}</span>
      </button>
    </Popover>
  );
}
