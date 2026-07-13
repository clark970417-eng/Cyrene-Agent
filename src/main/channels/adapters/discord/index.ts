import {
  AttachmentBuilder,
  ActivityType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  type Message,
  type SendableChannels,
} from "discord.js";
import type { ChannelAdapter } from "../base";
import type {
  ChannelCapability,
  ChannelStatus,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
  OutgoingPart,
} from "../../types";
import { loadChannelsSettings, saveChannelsSettings, type DiscordChannelConfig } from "../../settings-store";
import { DiscordVoiceCall, parseDiscordVoiceCommand } from "./voice-call";

const LOG = "[DiscordAdapter]";

export interface DiscordBotProfile {
  connected: boolean;
  id?: string;
  username?: string;
  tag?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  applicationId?: string;
  guildCount: number;
  guilds: Array<{ id: string; name: string }>;
  presenceStatus?: string;
  activityText?: string;
  voiceActive: boolean;
}

export interface DiscordBotProfileUpdate {
  username?: string;
  avatar?: Buffer;
  banner?: Buffer;
  status?: "online" | "idle" | "dnd" | "invisible";
  activityText?: string;
}

const DISCORD_CAPABILITY: ChannelCapability = {
  text: true,
  image: true,
  audio: true,
  file: true,
  video: true,
  markdown: true,
  card: true,
  sticker: true,
  maxTextLength: 2000,
};

function isAllowed(list: string[] | undefined, id: string | null): boolean {
  return !list?.length || (!!id && list.includes(id));
}

export function shouldHandleDiscordMessage(
  message: Pick<Message, "author" | "guildId" | "channelId" | "mentions">,
  config: DiscordChannelConfig,
  botUserId: string,
): boolean {
  if (message.author.bot) return false;
  if (!isAllowed(config.allowedUserIds, message.author.id)) return false;
  if (!isAllowed(config.allowedChannelIds, message.channelId)) return false;
  if (message.guildId && !isAllowed(config.allowedGuildIds, message.guildId)) return false;
  if (message.guildId && config.requireMention !== false && !message.mentions.users.has(botUserId)) return false;
  return true;
}

function normalizeDiscordMessage(message: Message, botUserId: string): IncomingMessage {
  const attachments: NonNullable<IncomingMessage["attachments"]> = [];
  const attachmentLines: string[] = [];
  for (const item of message.attachments.values()) {
    const mime = item.contentType ?? undefined;
    const kind = mime?.startsWith("image/") ? "image"
      : mime?.startsWith("audio/") ? "audio"
      : mime?.startsWith("video/") ? "video"
      : "file";
    attachments.push({ kind, url: item.url, mime, caption: item.name });
    attachmentLines.push(`[附件: ${item.name} ${item.url}]`);
  }
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  const content = message.content.replace(mentionPattern, "").trim();
  return {
    channel: "discord",
    senderId: message.author.id,
    senderName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
    chatId: message.channelId,
    threadId: message.channel.isThread() ? message.channelId : undefined,
    text: [content, ...attachmentLines].filter(Boolean).join("\n") || "[附件]",
    attachments: attachments.length ? attachments : undefined,
    at: message.createdAt,
    _raw: message,
  };
}

function splitText(text: string, limit = 2000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export class DiscordAdapter implements ChannelAdapter {
  readonly id = "discord" as const;
  readonly displayName = "Discord";
  readonly capability = DISCORD_CAPABILITY;
  onMessage: MessageHandler | null = null;

  private client: Client | null = null;
  private voiceCall: DiscordVoiceCall | null = null;
  private status: ChannelStatus = { enabled: false, phase: "offline", message: "未啟用" };

  constructor(private readonly voiceDispatch?: MessageHandler) {}

  async start(): Promise<void> {
    const config = loadChannelsSettings().discord;
    if (!config.enabled) {
      this.status = { enabled: false, phase: "offline", message: "未啟用" };
      return;
    }
    if (!config.botToken) {
      this.status = { enabled: true, phase: "config_missing", message: "Bot Token 缺失" };
      return;
    }

    await this.stopClient();
    this.status = { enabled: true, phase: "starting", message: "正在連接 Gateway" };
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Channel],
    });
    this.client = client;
    this.voiceCall = new DiscordVoiceCall(
      client,
      () => loadChannelsSettings().discord,
      async (msg) => await (this.voiceDispatch ?? this.onMessage)?.(msg) ?? null,
    );

    client.on("messageCreate", async (message) => {
      const botUserId = client.user?.id;
      if (!botUserId || !shouldHandleDiscordMessage(message, loadChannelsSettings().discord, botUserId)) return;
      try {
        const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
        const content = message.content.replace(mentionPattern, "").trim();
        const voiceCommand = parseDiscordVoiceCommand(content);
        if (voiceCommand && await this.voiceCall?.handleCommand(message, voiceCommand)) return;
        await message.channel.sendTyping().catch(() => undefined);
        await this.onMessage?.(normalizeDiscordMessage(message, botUserId));
      } catch (err) {
        console.error(LOG, "處理入站消息失敗:", err);
      }
    });
    client.on("error", (err) => {
      console.error(LOG, "client error:", err.message);
      this.status = { enabled: true, phase: "error", message: err.message };
    });
    client.on("shardReconnecting", () => {
      this.status = { enabled: true, phase: "starting", message: "Gateway 重新連接中" };
    });
    client.on("shardResume", () => {
      this.status = { enabled: true, phase: "running", message: `已連接：${client.user?.tag ?? "Discord Bot"}` };
    });

    try {
      await client.login(config.botToken);
      client.user?.setPresence({
        status: config.presenceStatus ?? "online",
        activities: config.activityText?.trim()
          ? [{ name: config.activityText.trim(), type: ActivityType.Playing }]
          : [],
      });
      this.status = { enabled: true, phase: "running", message: `已連接：${client.user?.tag ?? "Discord Bot"}` };
      console.log(LOG, `Gateway 已連接 (${client.user?.tag ?? "unknown"})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = { enabled: true, phase: "error", message };
      await this.stopClient();
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.stopClient();
    this.status = { enabled: false, phase: "offline", message: "已停止" };
  }

  private async stopClient(): Promise<void> {
    await this.voiceCall?.leave();
    this.voiceCall = null;
    if (!this.client) return;
    this.client.removeAllListeners();
    this.client.destroy();
    this.client = null;
  }

  getStatus(): ChannelStatus {
    const config = loadChannelsSettings().discord;
    if (!config.enabled) return { enabled: false, phase: "offline", message: "未啟用" };
    if (!config.botToken) return { enabled: true, phase: "config_missing", message: "Bot Token 缺失" };
    if (this.client?.isReady() && this.status.phase !== "running") {
      this.status = { enabled: true, phase: "running", message: `已連接：${this.client.user?.tag ?? "Discord Bot"}` };
    }
    return this.status;
  }

  async rebuild(): Promise<void> {
    await this.stopClient();
    await this.start();
  }

  getProfile(): DiscordBotProfile {
    const client = this.client;
    const user = client?.user;
    const connected = !!client?.isReady() && !!user;
    return {
      connected,
      id: user?.id,
      username: user?.username,
      tag: user?.tag,
      avatarUrl: user?.displayAvatarURL({ extension: "png", size: 256 }),
      bannerUrl: user?.bannerURL({ extension: "png", size: 1024 }) ?? undefined,
      applicationId: client?.application?.id ?? user?.id,
      guildCount: client?.guilds.cache.size ?? 0,
      guilds: client ? [...client.guilds.cache.values()]
        .map((guild) => ({ id: guild.id, name: guild.name }))
        .sort((a, b) => a.name.localeCompare(b.name)) : [],
      presenceStatus: user?.presence?.status,
      activityText: user?.presence?.activities[0]?.name ?? "",
      voiceActive: this.voiceCall?.isActive() ?? false,
    };
  }

  async updateProfile(update: DiscordBotProfileUpdate): Promise<DiscordBotProfile> {
    const client = this.client;
    const user = client?.user;
    if (!client?.isReady() || !user) throw new Error("Discord Gateway 尚未連接");

    const username = update.username?.trim();
    if (username && username !== user.username) {
      if (username.length < 2 || username.length > 32) throw new Error("Bot 名稱需為 2–32 個字元");
      await user.setUsername(username);
    }
    if (update.avatar) await user.setAvatar(update.avatar);
    if (update.banner) await user.setBanner(update.banner);

    const status = update.status ?? (user.presence?.status === "offline" ? "online" : user.presence?.status) ?? "online";
    const activityText = update.activityText?.trim() ?? "";
    client.user.setPresence({
      status,
      activities: activityText ? [{ name: activityText, type: ActivityType.Playing }] : [],
    });
    saveChannelsSettings({
      discord: {
        enabled: loadChannelsSettings().discord.enabled,
        presenceStatus: status,
        activityText,
      },
    });
    return this.getProfile();
  }

  async send(message: OutgoingMessage): Promise<{ ok: boolean; error?: string }> {
    if (!this.client?.isReady()) return { ok: false, error: "Discord Gateway 未連接" };
    try {
      const channel = await this.client.channels.fetch(message.targetId);
      if (!channel?.isSendable()) return { ok: false, error: "目標頻道不存在或不可發送" };
      for (const part of message.parts) await this.sendPart(channel, part);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendPart(channel: SendableChannels, part: OutgoingPart): Promise<void> {
    if (part.kind === "text") {
      for (const chunk of splitText(part.text)) await channel.send({ content: chunk });
      return;
    }
    if (part.kind === "card") {
      const embed = new EmbedBuilder().setTitle(part.title).setDescription(part.markdown?.slice(0, 4096) || null);
      if (part.fields?.length) embed.addFields(part.fields.slice(0, 25).map((f) => ({ name: f.key, value: f.value.slice(0, 1024), inline: true })));
      await channel.send({ embeds: [embed] });
      return;
    }
    const source = part.kind === "image" ? (part.filePath ?? part.url)
      : part.kind === "sticker" ? part.imagePath
      : part.filePath;
    if (!source) throw new Error(`${part.kind} 沒有可發送的檔案`);
    const attachment = new AttachmentBuilder(source);
    const caption = part.kind === "image" ? part.caption : undefined;
    await channel.send({ content: caption, files: [attachment] });
  }
}
