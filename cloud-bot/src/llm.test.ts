import assert from "node:assert/strict";
import test from "node:test";
import { buildRequestMessages } from "./llm.js";
import type { ChatEntry } from "./core.js";

function entry(role: ChatEntry["role"], content: string, at: number): ChatEntry {
  return { sessionId: "session", role, content, at };
}

test("文字對話維持純字串訊息", () => {
  const messages = buildRequestMessages("system", [entry("user", "你好", 1)]);
  assert.deepEqual(messages, [
    { role: "system", content: "system" },
    { role: "user", content: "你好" },
  ]);
});

test("圖片只附到最後一則 user message，並使用 OpenRouter image_url 格式", () => {
  const messages = buildRequestMessages("system", [
    entry("user", "上一題", 1),
    entry("assistant", "上一答", 2),
    entry("user", "這張圖有什麼？", 3),
  ], [
    { url: "https://cdn.discordapp.com/a.png", mime: "image/png", name: "a.png" },
    { url: "https://cdn.discordapp.com/b.webp", mime: "image/webp", name: "b.webp" },
  ]);

  assert.equal(messages[1].content, "上一題");
  assert.deepEqual(messages[3].content, [
    { type: "text", text: "這張圖有什麼？" },
    { type: "image_url", image_url: { url: "https://cdn.discordapp.com/a.png" } },
    { type: "image_url", image_url: { url: "https://cdn.discordapp.com/b.webp" } },
  ]);
});
