import { describe, expect, it } from "vitest";
import { DEFAULT_TONE_RULES } from "./tone-injector";

describe("default tone rules", () => {
  it("keeps the fallback aligned with Traditional Chinese and natural sticker timing", () => {
    expect(DEFAULT_TONE_RULES).toContain("臺灣繁體中文");
    expect(DEFAULT_TONE_RULES).toContain("傳出貼圖後仍把真正想說的話說完");
    expect(DEFAULT_TONE_RULES).toContain("近期用過的貼圖不要立刻重複");
    expect(DEFAULT_TONE_RULES).not.toContain("結尾常用反問");
  });
});
