import { describe, expect, it } from "vitest";
import {
  DISCORD_OWNER_ID,
  GEMINI_PROVIDER_NAME,
  getGeminiOwnerFallback,
  isDiscordNonOwnerQuotaFailure,
  isOpenRouterFreeQuotaError,
  type DiscordPrimaryModelSettings,
} from "./model-fallback";

const settings: DiscordPrimaryModelSettings = {
  provider: "Custom",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "openrouter/free",
  apiKey: "openrouter-key",
  perProvider: {
    [GEMINI_PROVIDER_NAME]: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3.5-flash",
      apiKey: "gemini-key",
      explicitTransport: "openai",
    },
  },
};

describe("Discord Gemini quota fallback", () => {
  const quotaError = new Error("模型請求失敗：HTTP 429 — free-models-per-day remaining: 0");

  it("recognizes only OpenRouter free quota exhaustion", () => {
    expect(isOpenRouterFreeQuotaError(quotaError, settings)).toBe(true);
    expect(isOpenRouterFreeQuotaError(new Error("HTTP 500"), settings)).toBe(false);
    expect(isOpenRouterFreeQuotaError(quotaError, { ...settings, model: "paid/model" })).toBe(false);
  });

  it("returns the configured Gemini profile only for the owner", () => {
    expect(getGeminiOwnerFallback(settings, DISCORD_OWNER_ID, quotaError)).toMatchObject({
      provider: GEMINI_PROVIDER_NAME,
      model: "gemini-3.5-flash",
      apiKey: "gemini-key",
    });
    expect(getGeminiOwnerFallback(settings, "friend", quotaError)).toBeNull();
  });

  it("marks a non-owner quota failure without granting Gemini access", () => {
    expect(isDiscordNonOwnerQuotaFailure(settings, "friend", quotaError)).toBe(true);
    expect(isDiscordNonOwnerQuotaFailure(settings, DISCORD_OWNER_ID, quotaError)).toBe(false);
  });

  it("does not fall back when Gemini is not configured", () => {
    expect(getGeminiOwnerFallback({ ...settings, perProvider: {} }, DISCORD_OWNER_ID, quotaError)).toBeNull();
  });
});
