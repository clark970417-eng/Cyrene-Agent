import { describe, expect, it, vi } from "vitest";

import { MacScreenshotClient } from "./macos-screenshot-client";

describe("MacScreenshotClient", () => {
  it("uses the native interactive picker and returns a file for chat insertion", async () => {
    const capture = vi.fn(async () => {});
    const client = new MacScreenshotClient({
      screenshotDirectory: "/tmp/cyrene-shots",
      capture,
      ensureDirectory: async () => {},
      probeImage: () => ({ empty: false, width: 1440, height: 900 }),
      createRequestId: () => "shot-1",
    });

    await expect(client.start("clipboard-and-file", "chat-button")).resolves.toMatchObject({
      filePath: "/tmp/cyrene-shots/shot-1.png",
      width: 1440,
      height: 900,
    });
    expect(capture).toHaveBeenCalledWith(["-i", "-o", "/tmp/cyrene-shots/shot-1.png"]);
  });

  it("copies hotkey captures directly to the macOS clipboard", async () => {
    const capture = vi.fn(async () => {});
    const client = new MacScreenshotClient({
      screenshotDirectory: "/tmp/cyrene-shots",
      capture,
      ensureDirectory: async () => {},
      probeImage: () => ({ empty: true, width: 0, height: 0 }),
      createRequestId: () => "shot-2",
    });

    await expect(client.start("clipboard-only", "hotkey")).resolves.toMatchObject({
      filePath: null,
      clipboardWritten: true,
    });
    expect(capture).toHaveBeenCalledWith(["-i", "-c"]);
  });
});
