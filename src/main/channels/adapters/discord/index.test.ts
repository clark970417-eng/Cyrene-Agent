import { describe, expect, it } from "vitest";
import { shouldHandleDiscordInteraction, shouldHandleDiscordMessage } from "./index";
import type { DiscordChannelConfig } from "../../settings-store";

function fakeMessage(options: {
  userId?: string;
  bot?: boolean;
  guildId?: string | null;
  channelId?: string;
  mentioned?: boolean;
}) {
  return {
    author: { id: options.userId ?? "user-1", bot: options.bot ?? false },
    guildId: options.guildId ?? null,
    channelId: options.channelId ?? "channel-1",
    mentions: { users: { has: (id: string) => options.mentioned === true && id === "bot-1" } },
  } as Parameters<typeof shouldHandleDiscordMessage>[0];
}

const defaults: DiscordChannelConfig = { enabled: true, requireMention: true };

describe("DiscordAdapter message security", () => {
  it("accepts direct messages without requiring a mention", () => {
    expect(shouldHandleDiscordMessage(fakeMessage({ guildId: null }), defaults, "bot-1")).toBe(true);
  });

  it("requires a direct bot mention in guild channels by default", () => {
    expect(shouldHandleDiscordMessage(fakeMessage({ guildId: "guild-1" }), defaults, "bot-1")).toBe(false);
    expect(shouldHandleDiscordMessage(fakeMessage({ guildId: "guild-1", mentioned: true }), defaults, "bot-1")).toBe(true);
  });

  it("ignores bots and enforces all configured allowlists", () => {
    const config: DiscordChannelConfig = {
      enabled: true,
      requireMention: false,
      allowedGuildIds: ["guild-ok"],
      allowedChannelIds: ["channel-ok"],
      allowedUserIds: ["user-ok"],
    };
    expect(shouldHandleDiscordMessage(fakeMessage({ bot: true }), config, "bot-1")).toBe(false);
    expect(shouldHandleDiscordMessage(fakeMessage({ guildId: "guild-no", channelId: "channel-ok", userId: "user-ok" }), config, "bot-1")).toBe(false);
    expect(shouldHandleDiscordMessage(fakeMessage({ guildId: "guild-ok", channelId: "channel-ok", userId: "user-ok" }), config, "bot-1")).toBe(true);
  });
});

describe("DiscordAdapter slash command security", () => {
  it("applies user, channel and guild allowlists without requiring a mention", () => {
    const config: DiscordChannelConfig = {
      enabled: true,
      requireMention: true,
      allowedGuildIds: ["guild-ok"],
      allowedChannelIds: ["channel-ok"],
      allowedUserIds: ["user-ok"],
    };
    expect(shouldHandleDiscordInteraction({
      user: { id: "user-ok" }, guildId: "guild-ok", channelId: "channel-ok",
    }, config)).toBe(true);
    expect(shouldHandleDiscordInteraction({
      user: { id: "user-no" }, guildId: "guild-ok", channelId: "channel-ok",
    }, config)).toBe(false);
  });
});
