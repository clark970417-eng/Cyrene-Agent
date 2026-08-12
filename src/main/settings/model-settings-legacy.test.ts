import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));

import { normalizeModelSettings } from "./model-settings";

describe("舊版模型設定相容", () => {
  it("完整保留視覺與螢幕陪伴偏好", () => {
    const normalized = normalizeModelSettings({
      provider: "自訂端點（雲端）",
      baseUrl: "https://example.test/v1",
      model: "vision-model",
      apiKey: "key",
      vision: {
        enabled: false,
        autoAnalyze: false,
        maxImages: 4,
        maxImageMb: 10,
        syncWithMain: false,
        baseUrl: "https://vision.test/v1",
        apiKey: "vision-key",
        model: "vision-model",
        screenCompanionEnabled: true,
        observeIntervalSeconds: 600,
        talkativeness: "chatty",
        minTalkIntervalSeconds: 300,
        proactiveTarget: "discord",
        discordSubTarget: "channel",
        discordChannelId: "123456789012345678",
      },
    });

    expect(normalized.vision).toEqual(expect.objectContaining({
      enabled: false,
      autoAnalyze: false,
      maxImages: 4,
      maxImageMb: 10,
      screenCompanionEnabled: true,
      observeIntervalSeconds: 600,
      talkativeness: "chatty",
      minTalkIntervalSeconds: 300,
      proactiveTarget: "discord",
      discordSubTarget: "channel",
      discordChannelId: "123456789012345678",
    }));
  });

  it("不裁掉尚未由新版認識的自訂欄位", () => {
    const normalized = normalizeModelSettings({ legacyExperimentalSetting: "keep" } as never) as unknown as Record<string, unknown>;
    expect(normalized.legacyExperimentalSetting).toBe("keep");
  });
});
