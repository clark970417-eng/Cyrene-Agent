import { describe, expect, it, vi } from "vitest";
import { registerDeliveryCommit } from "./delivery-commit";
import { ChannelManager } from "./manager";
import type { ChannelAdapter } from "./adapters/base";
import type { IncomingMessage, OutgoingMessage } from "./types";

function incoming(): IncomingMessage {
  return {
    channel: "discord",
    senderId: "user",
    chatId: "chat",
    text: "hello",
    at: new Date(),
  };
}

function adapter(ok: boolean): ChannelAdapter {
  return {
    id: "discord",
    displayName: "Discord",
    capability: {
      text: true, image: true, audio: true, file: true, video: true,
      markdown: true, card: true, sticker: true, maxTextLength: 2000,
    },
    start: async () => {},
    stop: async () => {},
    onMessage: null,
    send: vi.fn(async () => ok ? { ok: true } : { ok: false, error: "offline" }),
    getStatus: () => ({ enabled: true, phase: "running" }),
  };
}

describe("channel manager delivery state", () => {
  it.each([true, false])("commits assistant history only when send success is %s", async (ok) => {
    const manager = new ChannelManager();
    const channel = adapter(ok);
    const outgoing: OutgoingMessage = { channel: "discord", targetId: "chat", parts: [] };
    const commit = vi.fn();
    registerDeliveryCommit(outgoing, commit);
    manager.register(channel);
    manager.setDispatcher(async () => outgoing);

    await channel.onMessage?.(incoming());
    expect(commit).toHaveBeenCalledTimes(ok ? 1 : 0);
  });

  it("preserves the voice dispatch-only history behavior", async () => {
    const manager = new ChannelManager();
    const outgoing: OutgoingMessage = { channel: "discord", targetId: "chat", parts: [] };
    const commit = vi.fn();
    registerDeliveryCommit(outgoing, commit);
    manager.setDispatcher(async () => outgoing);

    await manager.dispatchOnly(incoming());
    expect(commit).toHaveBeenCalledOnce();
  });
});
