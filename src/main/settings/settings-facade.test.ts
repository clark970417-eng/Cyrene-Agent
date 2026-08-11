import { describe, expect, it } from "vitest";

import { normalizeGeneralSettings } from "./settings-facade";

describe("general settings compatibility", () => {
  it("keeps custom settings written by older builds", () => {
    const normalized = normalizeGeneralSettings({
      dailyRitualEnabled: true,
      openerPolicy: "balanced",
      customFutureSetting: { enabled: true },
    } as never) as unknown as Record<string, unknown>;

    expect(normalized.dailyRitualEnabled).toBe(true);
    expect(normalized.openerPolicy).toBe("balanced");
    expect(normalized.customFutureSetting).toEqual({ enabled: true });
  });

  it("always uses Taiwan Traditional Chinese for the desktop UI", () => {
    const normalized = normalizeGeneralSettings({ language: "zh-CN" } as never);
    expect(normalized.language).toBe("zh-TW");
  });
});
