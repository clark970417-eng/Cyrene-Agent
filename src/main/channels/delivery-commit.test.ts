import { describe, expect, it, vi } from "vitest";
import { commitDeliveredMessage, registerDeliveryCommit } from "./delivery-commit";
import type { OutgoingMessage } from "./types";

describe("channel delivery commit", () => {
  it("commits once after delivery succeeds", () => {
    const message: OutgoingMessage = { channel: "discord", targetId: "channel", parts: [] };
    const commit = vi.fn();
    registerDeliveryCommit(message, commit);

    expect(commit).not.toHaveBeenCalled();
    expect(commitDeliveredMessage(message)).toBe(true);
    expect(commitDeliveredMessage(message)).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
  });
});
