import {
  AttachmentBuilder,
  ActivityType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type SendableChannels,
  type StringSelectMenuInteraction,
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
import { DiscordVoiceCall, parseDiscordVoiceCommand, type DiscordMusicState } from "./voice-call";
import { parseDiscordMusicRequest } from "./music-source";
import {
  buildDiscordMusicControls,
  buildDiscordVolumeControl,
  DISCORD_SLASH_COMMANDS,
  musicRequestFromButton,
} from "./slash-commands";

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

export interface DiscordMusicControlInput {
  command: "previous" | "pause" | "resume" | "skip" | "stop" | "repeat-track" | "repeat-queue" | "repeat-off" | "shuffle" | "ordered" | "clear" | "remove" | "volume";
  value?: number;
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

export function shouldHandleDiscordInteraction(
  interaction: { user: { id: string }; guildId: string | null; channelId: string | null },
  config: DiscordChannelConfig,
): boolean {
  if (!isAllowed(config.allowedUserIds, interaction.user.id)) return false;
  if (!isAllowed(config.allowedChannelIds, interaction.channelId)) return false;
  if (interaction.guildId && !isAllowed(config.allowedGuildIds, interaction.guildId)) return false;
  return true;
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
        const musicRequest = parseDiscordMusicRequest(content);
        if (musicRequest && await this.voiceCall?.handleMusicRequest(message, musicRequest)) return;
        const voiceCommand = parseDiscordVoiceCommand(content);
        if (voiceCommand && await this.voiceCall?.handleCommand(message, voiceCommand)) return;
        await message.channel.sendTyping().catch(() => undefined);
        await this.onMessage?.(normalizeDiscordMessage(message, botUserId));
      } catch (err) {
        console.error(LOG, "處理入站消息失敗:", err);
      }
    });
    client.on("interactionCreate", async (interaction) => {
      const actionable = interaction.isChatInputCommand() ? interaction
        : interaction.isButton() ? interaction
        : interaction.isStringSelectMenu() ? interaction
        : null;
      if (!actionable) return;
      try {
        if (actionable.isChatInputCommand()) await this.handleSlashCommand(actionable);
        else if (actionable.isButton()) await this.handleMusicButton(actionable);
        else await this.handleMusicVolumeSelect(actionable);
      } catch (err) {
        console.error(LOG, "處理 Discord / 指令失敗:", err);
        const content = `指令執行失敗：${err instanceof Error ? err.message : String(err)}`;
        if (actionable.deferred || actionable.replied) await actionable.editReply({ content }).catch(() => undefined);
        else await actionable.reply({ content, ephemeral: true }).catch(() => undefined);
      }
    });
    client.on("guildCreate", (guild) => {
      void guild.commands.set(DISCORD_SLASH_COMMANDS)
        .then(() => console.log(LOG, `已在 ${guild.name} 註冊 ${DISCORD_SLASH_COMMANDS.length} 個 / 指令`))
        .catch((err) => console.warn(LOG, `新伺服器 / 指令註冊失敗 [${guild.name}]:`, err));
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
      await this.registerSlashCommands(client);
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

  private async registerSlashCommands(client: Client): Promise<void> {
    const results = await Promise.allSettled([...client.guilds.cache.values()].map(async (guild) => {
      await guild.commands.set(DISCORD_SLASH_COMMANDS);
      console.log(LOG, `已在 ${guild.name} 註冊 ${DISCORD_SLASH_COMMANDS.length} 個 / 指令`);
    }));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) console.warn(LOG, `${failures.length} 個伺服器無法註冊 / 指令`);
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const config = loadChannelsSettings().discord;
    if (!shouldHandleDiscordInteraction(interaction, config)) {
      await interaction.reply({ content: "你不在 Cyrene 的 Discord 白名單中，或這個頻道／伺服器未被允許。", ephemeral: true });
      return;
    }
    if (interaction.commandName === "chat") {
      await this.handleSlashChat(interaction, interaction.options.getString("message", true));
      return;
    }
    if (interaction.commandName === "status") {
      const client = this.client;
      await interaction.reply({
        content: [
          `🟢 **${client?.user?.username ?? "Cyrene"} 已連線**`,
          `延遲：${Math.max(0, Math.round(client?.ws.ping ?? 0))} ms`,
          `所在伺服器：${client?.guilds.cache.size ?? 0}`,
          `語音狀態：${this.voiceCall?.getSessionSummary() ?? "未啟用"}`,
        ].join("\n"),
        ephemeral: true,
      });
      return;
    }
    if (interaction.commandName === "help") {
      await interaction.reply({
        content: [
          "**Cyrene Discord 指令**",
          "`/chat` AI 對話　`/join` 語音聊天　`/leave` 離開",
          "`/play` 播放 YouTube／Bilibili　`/previous`　`/pause`　`/resume`　`/skip`　`/stop`",
          "`/queue`　`/remove`　`/clear`　`/volume`　`/repeat`　`/mode`",
          "`/status` 查看連線、延遲及目前播放狀態",
        ].join("\n"),
        ephemeral: true,
      });
      return;
    }

    const musicSessionActive = this.voiceCall?.getMusicState().active ?? false;
    const musicCommands = new Set(["play", "previous", "pause", "resume", "skip", "stop", "queue", "clear", "remove", "volume", "repeat", "mode", "leave"]);
    if (musicSessionActive && musicCommands.has(interaction.commandName) && !this.voiceCall?.canControlMusic(interaction.user.id)) {
      await interaction.reply({ content: "這是其他人的播放工作階段，你不能控制她的音樂。", flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.commandName === "play") await interaction.deferReply();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await this.interactionAsMessage(interaction);
    if (interaction.commandName === "join") {
      await this.voiceCall?.handleCommand(message, "join");
      return;
    }
    if (interaction.commandName === "leave") {
      await this.voiceCall?.handleCommand(message, "leave");
      return;
    }

    const request = this.musicRequestFromInteraction(interaction);
    if (!request) {
      await interaction.editReply({ content: "找不到這個指令的功能。" });
      return;
    }
    if (request.command && request.command !== "queue") {
      const result = this.voiceCall
        ? await this.voiceCall.controlMusic(request.command, request.value)
        : { ok: false, message: "Discord 語音尚未啟用。" };
      if (result.ok) await interaction.deleteReply().catch(() => undefined);
      else await interaction.editReply({ content: result.message });
      return;
    }
    const handled = await this.voiceCall?.handleMusicRequest(message, request) ?? false;
    if (handled && interaction.commandName === "play" && this.voiceCall?.getMusicState().active) {
      await interaction.editReply({
        components: [buildDiscordMusicControls(this.voiceCall.getMusicState().paused), buildDiscordVolumeControl()],
      }).catch(() => undefined);
    }
    if (!handled) {
      await interaction.editReply({ content: "目前沒有正在播放的音樂，請先使用 `/play`。" });
    }
  }

  private async handleMusicButton(interaction: ButtonInteraction): Promise<void> {
    const request = musicRequestFromButton(interaction.customId, this.voiceCall?.getMusicState().paused ?? false);
    if (!request) return;
    const config = loadChannelsSettings().discord;
    const playlistOnly = request.command === "queue";
    const accessConfig = playlistOnly ? { ...config, allowedUserIds: undefined } : config;
    if (!shouldHandleDiscordInteraction(interaction, accessConfig)) {
      await interaction.reply({ content: "你沒有操作這個 Bot 的權限。", ephemeral: true });
      return;
    }
    if (!playlistOnly && !this.voiceCall?.canControlMusic(interaction.user.id)) {
      await interaction.reply({ content: "這是其他人的播放工作階段，你不能使用這些控制按鈕。", flags: MessageFlags.Ephemeral });
      return;
    }
    if (request.command !== "queue") {
      await interaction.deferUpdate();
      const result = this.voiceCall
        ? await this.voiceCall.controlMusic(request.command!, request.value)
        : { ok: false, message: "Discord 語音尚未啟用。" };
      if (result.ok && interaction.customId.endsWith("toggle") && this.voiceCall) {
        await interaction.editReply({
          components: [buildDiscordMusicControls(this.voiceCall.getMusicState().paused), buildDiscordVolumeControl()],
        });
      }
      if (!result.ok) await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await this.interactionAsMessage(interaction);
    const handled = await this.voiceCall?.handleMusicRequest(message, request) ?? false;
    if (!handled) {
      await interaction.editReply({ content: "目前沒有正在播放的音樂。" });
    }
  }

  private async handleMusicVolumeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (interaction.customId !== "cyrene:music:volume") return;
    if (!shouldHandleDiscordInteraction(interaction, loadChannelsSettings().discord)) {
      await interaction.reply({ content: "你沒有操作這個 Bot 的權限。", ephemeral: true });
      return;
    }
    if (!this.voiceCall?.canControlMusic(interaction.user.id)) {
      await interaction.reply({ content: "這是其他人的播放工作階段，你不能調整音量。", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    const value = Number.parseInt(interaction.values[0] ?? "100", 10);
    const result = this.voiceCall
      ? await this.voiceCall.controlMusic("volume", value)
      : { ok: false, message: "Discord 語音尚未啟用。" };
    if (!result.ok) await interaction.followUp({ content: result.message, flags: MessageFlags.Ephemeral });
  }

  private musicRequestFromInteraction(interaction: ChatInputCommandInteraction) {
    if (interaction.commandName === "play") {
      return parseDiscordMusicRequest(interaction.options.getString("url", true));
    }
    if (interaction.commandName === "pause") return { command: "pause" as const };
    if (interaction.commandName === "resume") return { command: "resume" as const };
    if (interaction.commandName === "previous") return { command: "previous" as const };
    if (interaction.commandName === "skip") return { command: "skip" as const };
    if (interaction.commandName === "stop") return { command: "stop" as const };
    if (interaction.commandName === "queue") return { command: "queue" as const };
    if (interaction.commandName === "clear") return { command: "clear" as const };
    if (interaction.commandName === "remove") {
      return { command: "remove" as const, value: interaction.options.getInteger("position", true) };
    }
    if (interaction.commandName === "volume") {
      return { command: "volume" as const, value: interaction.options.getInteger("percent", true) };
    }
    if (interaction.commandName === "repeat") {
      const mode = interaction.options.getString("mode", true);
      return { command: mode === "track" ? "repeat-track" as const : mode === "queue" ? "repeat-queue" as const : "repeat-off" as const };
    }
    if (interaction.commandName === "mode") {
      return { command: interaction.options.getString("type", true) === "shuffle" ? "shuffle" as const : "ordered" as const };
    }
    return null;
  }

  private async interactionAsMessage(
    interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  ): Promise<Message> {
    const member: GuildMember | null = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    return {
      channelId: interaction.channelId,
      author: interaction.user,
      member,
      reply: async (content: string) => {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({ content });
          return {
            edit: async (next: string) => {
              await interaction.editReply({ content: next });
              return await interaction.fetchReply();
            },
          } as unknown as Message;
        }
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content, ephemeral: true });
          return {
            edit: async (next: string) => {
              await interaction.editReply({ content: next });
              return await interaction.fetchReply();
            },
          } as unknown as Message;
        }
        return await interaction.followUp({ content, fetchReply: true, ephemeral: true });
      },
    } as unknown as Message;
  }

  private async handleSlashChat(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
    await interaction.deferReply();
    const member = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    const outgoing = await (this.voiceDispatch ?? this.onMessage)?.({
      channel: "discord",
      senderId: interaction.user.id,
      senderName: member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
      chatId: interaction.channelId,
      text,
      at: new Date(),
      _raw: { source: "discord-slash", interactionId: interaction.id, guildId: interaction.guildId },
    }) ?? null;
    const reply = outgoing?.parts
      .filter((part): part is Extract<typeof part, { kind: "text" }> => part.kind === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!reply) {
      await interaction.editReply("這次沒有取得回覆，請稍後再試一次。");
      return;
    }
    const chunks = splitText(reply);
    await interaction.editReply(chunks[0]);
    for (const chunk of chunks.slice(1)) await interaction.followUp(chunk);
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

  getMusicState(): DiscordMusicState {
    return this.voiceCall?.getMusicState() ?? {
      active: false,
      paused: false,
      current: null,
      queue: [],
      volume: 100,
      repeat: "off",
      shuffle: false,
      elapsed: 0,
    };
  }

  async controlMusic(input: DiscordMusicControlInput): Promise<{ ok: boolean; message: string; state: DiscordMusicState }> {
    const result = this.voiceCall
      ? await this.voiceCall.controlMusic(input.command, input.value)
      : { ok: false, message: "Discord 尚未連接。" };
    return { ...result, state: this.getMusicState() };
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
