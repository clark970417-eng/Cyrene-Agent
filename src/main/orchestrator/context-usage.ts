import type { ContextUsageCategory, ContextUsageCategoryKey, ContextUsageSnapshot } from "../../shared/context-usage";
import { estimateTokens } from "./context-manager";
import type { ChatMessage } from "./vendors/types";

function contentText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (content === undefined) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function buildContextUsageSnapshot(input: {
  phase: "preRequest" | "terminal";
  runId?: string;
  contextWindowTokens: number;
  personaContent: string;
  toolLayerContent?: string;
  skillLayerContent?: string;
  runtimeContext?: string;
  messages: ChatMessage[];
}): ContextUsageSnapshot {
  const buckets: Record<ContextUsageCategoryKey, number> = {
    systemPrompt: estimateTokens(input.personaContent),
    tools: 0,
    skills: estimateTokens(input.skillLayerContent ?? ""),
    runtimeAndToolLogs: estimateTokens(input.runtimeContext ?? ""),
    conversation: 0,
    other: 0,
  };
  buckets.tools = Math.max(0, estimateTokens(input.toolLayerContent ?? "") - buckets.skills);

  for (const message of input.messages) {
    const tokens = estimateTokens(contentText(message.content)) + 4;
    if (message.role === "tool" || message.visibility === "internal") {
      buckets.runtimeAndToolLogs += tokens;
    } else if (message.role === "user" || message.role === "assistant" || message.role === "system") {
      buckets.conversation += tokens;
    } else {
      buckets.other += tokens;
    }
  }

  const keys: ContextUsageCategoryKey[] = [
    "systemPrompt",
    "tools",
    "skills",
    "runtimeAndToolLogs",
    "conversation",
    "other",
  ];
  const categories: ContextUsageCategory[] = keys.map((key) => ({ key, tokens: buckets[key] }));
  return {
    phase: input.phase,
    ...(input.runId ? { runId: input.runId } : {}),
    contextWindowTokens: input.contextWindowTokens,
    totalTokens: categories.reduce((total, category) => total + category.tokens, 0),
    categories,
    messageCount: input.messages.length,
    updatedAt: Date.now(),
  };
}
