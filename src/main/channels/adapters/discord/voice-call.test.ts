import { describe, expect, it } from "vitest";
import { parseDiscordVoiceCommand, stereo48kToMono16k } from "./voice-call";

describe("Discord voice commands", () => {
  it.each(["加入通話", "進來通話！", "加入語音頻道", "陪我通話"])("parses join: %s", (text) => {
    expect(parseDiscordVoiceCommand(text)).toBe("join");
  });

  it.each(["離開通話", "掛斷", "退出語音", "結束通話。"])("parses leave: %s", (text) => {
    expect(parseDiscordVoiceCommand(text)).toBe("leave");
  });

  it("does not hijack normal conversation", () => {
    expect(parseDiscordVoiceCommand("你喜歡通話嗎")) .toBeNull();
    expect(parseDiscordVoiceCommand("加入遊戲")) .toBeNull();
  });
});

describe("Discord PCM conversion", () => {
  it("downsamples stereo 48kHz PCM to mono 16kHz", () => {
    const input = Buffer.alloc(12 * 4);
    for (let frame = 0; frame < 12; frame += 1) {
      input.writeInt16LE(3000 + frame, frame * 4);
      input.writeInt16LE(1000 + frame, frame * 4 + 2);
    }
    const output = stereo48kToMono16k(input);
    expect(output.length).toBe(4 * 2);
    expect([...Array(4)].map((_, i) => output.readInt16LE(i * 2))).toEqual([2000, 2003, 2006, 2009]);
  });

  it("ignores an incomplete trailing frame", () => {
    expect(stereo48kToMono16k(Buffer.alloc(11)).length).toBe(0);
  });
});
