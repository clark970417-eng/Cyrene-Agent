import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_BRAIN,
  buildGeminiBrainSeed,
  composeGeminiInitialPrompt,
  getGeminiBrainPromptVersion,
  normalizeGeminiBrain,
} from "./gemini-brain";

describe("Gemini brain seed", () => {
  it("builds one concise seed without duplicating the current prompt", () => {
    const prompt = "夥伴: 今天想一起整理房間";
    const result = composeGeminiInitialPrompt(prompt, DEFAULT_GEMINI_BRAIN);
    expect(result).toContain("CYRENE BRAIN SEED");
    expect(result.match(/今天想一起整理房間/g)).toHaveLength(1);
    expect(result.length).toBeLessThan(2_000);
  });

  it("changes the prompt version when the saved brain changes", () => {
    const first = getGeminiBrainPromptVersion(DEFAULT_GEMINI_BRAIN);
    const second = getGeminiBrainPromptVersion({ ...DEFAULT_GEMINI_BRAIN, personality: "更俏皮" });
    expect(first).not.toBe(second);
  });

  it("can be disabled and bounds editable fields", () => {
    const settings = normalizeGeminiBrain({ enabled: false, identity: "x".repeat(4_000) });
    expect(buildGeminiBrainSeed(settings)).toBe("");
    expect(settings.identity).toHaveLength(2_000);
  });
});
