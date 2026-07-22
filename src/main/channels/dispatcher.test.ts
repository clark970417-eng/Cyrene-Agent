// dispatcher 核心單元測試：sessionId hash + 限速
import { describe, it, expect } from "vitest";
import { makeSessionId, lookupOriginalSender, normalizeChannelReplyText, shouldSynthesizeChannelTts } from "./dispatcher";

describe("channels/dispatcher", () => {
  it("makeSessionId: 同 channel + 同 sender → 同 sessionId", () => {
    const a = makeSessionId("feishu", "ou_abc123");
    const b = makeSessionId("feishu", "ou_abc123");
    expect(a).toBe(b);
  });

  it("makeSessionId: 跨 channel 不同 sessionId", () => {
    const f = makeSessionId("feishu", "user-x");
    const w = makeSessionId("wechat", "user-x");
    expect(f).not.toBe(w);
  });

  it("makeSessionId: 長度 16 字符 hash + 前綴", () => {
    const s = makeSessionId("feishu", "ou_abc");
    // 格式: channel:<channel>:<16 hex>
    expect(s).toMatch(/^channel:feishu:[0-9a-f]{16}$/);
  });

  it("makeSessionId: 不同 sender → 不同 sessionId", () => {
    const a = makeSessionId("feishu", "ou_aaa");
    const b = makeSessionId("feishu", "ou_bbb");
    expect(a).not.toBe(b);
  });

  it("lookupOriginalSender: 未知 sessionId 返回 null", () => {
    expect(lookupOriginalSender("channel:feishu:0000000000000000")).toBeNull();
  });

  it("Discord 文字聊天不合成 TTS，語音輪次才合成", () => {
    const base = {
      channel: "discord" as const,
      senderId: "user",
      chatId: "text-channel",
      text: "你好",
      at: new Date(),
    };
    expect(shouldSynthesizeChannelTts(base, true)).toBe(false);
    expect(shouldSynthesizeChannelTts({ ...base, _raw: { source: "discord-voice" } }, true)).toBe(true);
    expect(shouldSynthesizeChannelTts({ ...base, _raw: { source: "discord-voice" } }, false)).toBe(false);
  });

  it("其他渠道沿用全局 TTS 開關", () => {
    const msg = {
      channel: "wechat" as const,
      senderId: "user",
      chatId: "chat",
      text: "你好",
      at: new Date(),
    };
    expect(shouldSynthesizeChannelTts(msg, true)).toBe(true);
    expect(shouldSynthesizeChannelTts(msg, false)).toBe(false);
  });

  it("把所有外部渠道的簡體 AI 回覆轉成台灣繁體", () => {
    expect(normalizeChannelReplyText("我支持这个视频，也会继续播放列表。"))
      .toBe("我支援這個影片，也會繼續播放列表。");
  });
});
