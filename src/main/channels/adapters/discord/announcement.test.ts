import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async () => ({ isFile: () => true, size: 1_024 })),
}));

import { parseAnnouncementColor, validateDiscordAnnouncement } from "./announcement";

describe("Discord announcement", () => {
  it("accepts text, image, video, or a mixture", async () => {
    const result = await validateDiscordAnnouncement({
      channelId: "123456789012345678",
      title: "新番通知",
      mediaPaths: ["/tmp/poster.png", "/tmp/trailer.mp4"],
      color: "#42b9ff",
    });
    expect(result.media.map((item) => item.kind)).toEqual(["image", "video"]);
    expect(result.color).toBe(0x42b9ff);
  });

  it("rejects empty announcements and unsafe links", async () => {
    await expect(validateDiscordAnnouncement({ channelId: "123456789012345678" })).rejects.toThrow("至少加入");
    await expect(validateDiscordAnnouncement({
      channelId: "123456789012345678",
      title: "x",
      link: "javascript:alert(1)",
    })).rejects.toThrow("http 或 https");
  });

  it("uses the Cyrene blue accent for invalid colors", () => {
    expect(parseAnnouncementColor("not-a-color")).toBe(0x66c8ff);
  });
});
