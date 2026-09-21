import { describe, expect, it } from "vitest";
import { buildContextUsageSnapshot } from "./context-usage";

describe("buildContextUsageSnapshot", () => {
  it("separates conversation, system prompt and runtime records", () => {
    const snapshot = buildContextUsageSnapshot({
      phase: "preRequest",
      contextWindowTokens: 128_000,
      personaContent: "你是昔漣。",
      runtimeContext: "目前在桌面端",
      messages: [
        { role: "user", content: "你好" },
        { role: "assistant", content: "早安♪" },
        { role: "tool", toolCallId: "1", content: "完成" },
      ],
    });

    expect(snapshot.categories.find((item) => item.key === "systemPrompt")?.tokens).toBeGreaterThan(0);
    expect(snapshot.categories.find((item) => item.key === "conversation")?.tokens).toBeGreaterThan(0);
    expect(snapshot.categories.find((item) => item.key === "runtimeAndToolLogs")?.tokens).toBeGreaterThan(0);
    expect(snapshot.totalTokens).toBe(snapshot.categories.reduce((sum, item) => sum + item.tokens, 0));
  });

  it("keeps empty inputs finite and safe", () => {
    const snapshot = buildContextUsageSnapshot({
      phase: "terminal",
      contextWindowTokens: 32_000,
      personaContent: "",
      messages: [],
    });
    expect(snapshot.totalTokens).toBe(0);
    expect(snapshot.messageCount).toBe(0);
  });
});
