import { describe, expect, it } from "vitest";
import { enhanceMiniMaxText, prepareMiniMaxSpeechText } from "./minimax-vocal-enhancer";

describe("enhanceMiniMaxText", () => {
  it("預設啟用，並可明確停用", () => {
    expect(enhanceMiniMaxText("哈哈哈，今天真開心")).toBe("哈哈哈(laughs)，今天真開心");
    expect(enhanceMiniMaxText("哈哈哈，今天真開心", { enabled: false })).toBe("哈哈哈，今天真開心");
  });

  it("加入笑聲、遲疑、驚訝與嘆息標記", () => {
    expect(enhanceMiniMaxText("嘿嘿，被你發現了")).toBe("嘿嘿(chuckle)，被你發現了");
    expect(enhanceMiniMaxText("嗯，讓我想想")).toBe("(emm)嗯，讓我想想(breath)");
    expect(enhanceMiniMaxText("啊，真的嗎？")).toBe("(gasps)啊，真的嗎？");
    expect(enhanceMiniMaxText("唉，真是沒辦法呢")).toBe("(sighs)唉，真是沒辦法呢");
  });

  it("不把一般句尾語助詞誤判成驚訝", () => {
    expect(enhanceMiniMaxText("好啊，我陪你去。")).toBe("好啊，我陪你去。");
    expect(enhanceMiniMaxText("當然可以啊！")).toBe("當然可以啊！");
  });

  it("支援繁簡程式碼引導語與句末停頓", () => {
    expect(enhanceMiniMaxText("程式碼如下：")).toBe("程式碼如下：(breath)");
    expect(enhanceMiniMaxText("代碼如下：")).toBe("代碼如下：(breath)");
    expect(enhanceMiniMaxText("或許是這樣吧……")).toBe("或許是這樣吧……(sighs)");
  });

  it("每段最多兩個標記，且重複處理保持冪等", () => {
    const enhanced = enhanceMiniMaxText("哈哈哈，嗯，唉，讓我想想");
    expect((enhanced.match(/\([a-z-]+\)/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(enhanceMiniMaxText(enhanced)).toBe(enhanced);
  });

  it("把既有的所有 MiniMax 官方標記計入上限", () => {
    const text = "(clear-throat)嗯，哈哈哈";
    const enhanced = enhanceMiniMaxText(text);
    expect((enhanced.match(/\([a-z-]+\)/g) ?? []).length).toBe(2);
    expect(enhanced).toBe("(clear-throat)嗯，哈哈哈(laughs)");
    expect(enhanced).not.toContain("(clear-throat)(emm)");
  });

  it("只為 speech-2.8 相容模型增強", () => {
    expect(prepareMiniMaxSpeechText("哈哈哈", "speech-2.8-hd")).toBe("哈哈哈(laughs)");
    expect(prepareMiniMaxSpeechText("哈哈哈", "speech-2.8-turbo")).toBe("哈哈哈(laughs)");
    expect(prepareMiniMaxSpeechText("哈哈哈", "speech-2.6-hd")).toBe("哈哈哈");
    expect(prepareMiniMaxSpeechText("哈哈哈", "custom-model")).toBe("哈哈哈");
  });

  it("沒有明確觸發語境時不改寫原文", () => {
    const text = "今天的天氣很好，我們一起去散步吧。";
    expect(enhanceMiniMaxText(text)).toBe(text);
  });

  it("在混合語氣與既有標記語料中維持上限、冪等與停用語意", () => {
    const corpus = [
      "哈哈哈，嗯……啊，真的嗎？唉，讓我想想",
      "(laughs)嘿嘿，程式碼如下：",
      "(coughs)(breath)嗯，哈哈哈",
      "好啊，可以啊，當然沒問題啊！",
      "唔～我想想……",
      "emmmm...代碼如下：",
      "呵呵呵，或許就是這樣吧...",
      "普通文字 without any trigger",
    ];

    for (const text of corpus) {
      const enhanced = enhanceMiniMaxText(text);
      expect((enhanced.match(/\([a-z-]+\)/g) ?? []).length).toBeLessThanOrEqual(2);
      expect(enhanceMiniMaxText(enhanced)).toBe(enhanced);
      expect(enhanceMiniMaxText(text, { enabled: false })).toBe(text);
      expect(prepareMiniMaxSpeechText(text, "unsupported-model")).toBe(text);
    }
  });
});
