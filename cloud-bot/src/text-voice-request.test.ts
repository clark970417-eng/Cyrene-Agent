import assert from "node:assert/strict";
import test from "node:test";
import { extractDiscordExactVoiceText, extractDiscordVoiceRequestTopic } from "./text-voice-request.js";

test("辨識截圖中的說笑話語音請求", () => {
  assert.equal(extractDiscordVoiceRequestTopic("你能說句笑話嗎"), "笑話");
});
test("辨識能力詢問與一般語音請求", () => {
  assert.ok(extractDiscordVoiceRequestTopic("你能傳語音嗎"));
  assert.equal(extractDiscordVoiceRequestTopic("幫我傳一段晚安的語音"), "晚安");
  assert.equal(extractDiscordVoiceRequestTopic("請看看這張圖片"), null);
});

test("指定台詞會去除 emoji 但保留情緒標點", () => {
  assert.equal(extractDiscordExactVoiceText("能只說一句晚安🥰嗎"), "晚安～");
});
