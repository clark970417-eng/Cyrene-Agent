import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/chat-types";
import { buildCompactedMessages } from "./chats-ipc";

function messages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    role: index % 2 === 0 ? "user" : "model",
    content: `message-${index}`,
    at: index,
  }));
}

describe("buildCompactedMessages", () => {
  it("preserves history outside the model window and the six latest messages", () => {
    const result = buildCompactedMessages(messages(20), "摘要", 1000);
    expect(result.slice(0, 4).map((message) => message.content)).toEqual([
      "message-0", "message-1", "message-2", "message-3",
    ]);
    expect(result[4].content).toContain("摘要");
    expect(result.slice(-6).map((message) => message.content)).toEqual([
      "message-14", "message-15", "message-16", "message-17", "message-18", "message-19",
    ]);
    expect(result[4].contextUsage?.messageCount).toBe(7);
  });
});
