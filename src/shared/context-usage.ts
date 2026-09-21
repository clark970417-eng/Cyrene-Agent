export type ContextUsageCategoryKey =
  | "systemPrompt"
  | "tools"
  | "skills"
  | "runtimeAndToolLogs"
  | "conversation"
  | "other";

export interface ContextUsageCategory {
  key: ContextUsageCategoryKey;
  tokens: number;
}

export interface ContextUsageSnapshot {
  phase: "preRequest" | "terminal";
  runId?: string;
  contextWindowTokens: number;
  totalTokens: number;
  categories: ContextUsageCategory[];
  messageCount: number;
  updatedAt: number;
}

const CATEGORY_KEYS = new Set<ContextUsageCategoryKey>([
  "systemPrompt",
  "tools",
  "skills",
  "runtimeAndToolLogs",
  "conversation",
  "other",
]);

export function isContextUsageSnapshot(value: unknown): value is ContextUsageSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ContextUsageSnapshot>;
  return (snapshot.phase === "preRequest" || snapshot.phase === "terminal")
    && typeof snapshot.contextWindowTokens === "number"
    && Number.isFinite(snapshot.contextWindowTokens)
    && snapshot.contextWindowTokens > 0
    && typeof snapshot.totalTokens === "number"
    && Number.isFinite(snapshot.totalTokens)
    && typeof snapshot.messageCount === "number"
    && Number.isFinite(snapshot.messageCount)
    && typeof snapshot.updatedAt === "number"
    && Number.isFinite(snapshot.updatedAt)
    && Array.isArray(snapshot.categories)
    && snapshot.categories.every((category) => (
      Boolean(category)
      && CATEGORY_KEYS.has(category.key)
      && typeof category.tokens === "number"
      && Number.isFinite(category.tokens)
      && category.tokens >= 0
    ));
}
