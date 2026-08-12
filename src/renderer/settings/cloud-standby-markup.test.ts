import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");

describe("Google Cloud standby settings markup", () => {
  it("restores the legacy handoff dashboard and exposes editable Mac connection settings", () => {
    for (const id of [
      "channels-cloud-enabled",
      "channels-cloud-host",
      "channels-cloud-user",
      "channels-cloud-key-path",
      "channels-cloud-pick-key",
      "channels-cloud-save",
      "channels-cloud-local",
      "channels-cloud-remote",
      "channels-cloud-restart",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("本機優先保護");
    expect(html).toContain("60–75 秒內自動接手");
    expect(html).toContain("instance-20260728-054602");
    expect(html).toContain("Google Cloud Console ↗");
  });

  it("combines the legacy service identity with the unified light and dark theme structure", () => {
    for (const service of ["wechat", "feishu", "discord", "spotify", "bilibili", "google-cloud"]) {
      expect(html).toContain(`channels-card--${service}`);
    }
  });
});
