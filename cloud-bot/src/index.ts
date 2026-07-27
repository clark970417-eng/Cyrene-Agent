import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type InteractionEditReplyOptions,
  type Message,
} from "discord.js";
import { loadConfig } from "./config.js";
import { mentionsBot, normalizeInvocation, sessionIdFor, shouldHandleMessage, splitDiscordText } from "./core.js";
import { startHealthServer } from "./health.js";
import { generateReply } from "./llm.js";
import { MemoryStore } from "./memory.js";
import { loadSystemPrompt } from "./prompt.js";
import { FavoriteStore } from "./favorites.js";
import { EventClaimStore } from "./event-claims.js";
import { CloudMusicPlayer } from "./music-player.js";

const config = loadConfig();
const memory = new MemoryStore(config.dataDir, config.historyMessages);
const favorites = new FavoriteStore(`${config.dataDir}/music-favorites.json`);
const eventClaims = new EventClaimStore(config.dataDir);
const music = new CloudMusicPlayer(config.dataDir);
eventClaims.prune();
const systemPrompt = await loadSystemPrompt(config);
const startedAt = Date.now();
const queues = new Map<string, Promise<void>>();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

function enqueue(sessionId: string, task: () => Promise<void>): void {
  const previous = queues.get(sessionId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task).finally(() => {
    if (queues.get(sessionId) === current) queues.delete(sessionId);
  });
  queues.set(sessionId, current);
}

function formatFavorites(): string {
  const entries = favorites.list(25);
  return entries.length
    ? `**雲端收藏 · ${entries.length} 筆**\n${entries.map((entry, index) => `${String(index + 1).padStart(2, "0")}　[${escapeMarkdown(entry.title)}](${entry.url})`).join("\n")}`
    : "雲端收藏目前是空的。使用 `/like 網址` 儲存單曲或播放清單。";
}

async function replyToMessage(message: Message, text: string): Promise<void> {
  for (const chunk of splitDiscordText(text)) await message.reply({ content: chunk, allowedMentions: { repliedUser: false } });
}

async function runConversation(sessionId: string, input: string): Promise<string> {
  await memory.append(sessionId, "user", input);
  const reply = await generateReply(config, systemPrompt, memory.get(sessionId));
  await memory.append(sessionId, "assistant", reply);
  return reply;
}

async function fastInteractionReply(interaction: ChatInputCommandInteraction, content: string, ephemeral = true): Promise<void> {
  const response = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: 4, data: { content, ...(ephemeral ? { flags: 64 } : {}) } }),
    signal: AbortSignal.timeout(2_500),
  });
  if (!response.ok) throw new Error(`Discord interaction callback HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

type InteractionEditPayload = InteractionEditReplyOptions;

async function editInteractionReply(interaction: ChatInputCommandInteraction, payload: string | InteractionEditPayload): Promise<void> {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(typeof payload === "string" ? { content: payload } : payload),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Discord interaction edit HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "未知";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function musicPanelPayload(channelName: string): InteractionEditPayload {
  const snapshot = music.snapshot();
  const current = snapshot.current;
  if (!current) return { content: "播放器目前沒有歌曲。", embeds: [], components: [] };
  const statusLabel = snapshot.status === "paused" ? "⏸️ 已暫停" : "▶️ 播放中";
  const embed = new EmbedBuilder()
    .setColor(0xd986b2)
    .setAuthor({ name: "CYRENE CLOUD PLAYER · NOW PLAYING" })
    .setTitle(current.title)
    .setURL(current.url)
    .setDescription(`**${statusLabel}**\n在 **${channelName}** 陪你聽歌`)
    .addFields(
      { name: "長度", value: formatDuration(current.duration), inline: true },
      { name: "接下來", value: snapshot.queueLength ? `${snapshot.queueLength} 首` : "播放完畢後離開", inline: true },
      { name: "來源", value: new URL(current.url).hostname, inline: true },
    )
    .setFooter({ text: "永晝花庭 · 雲端播放控制" });
  if (current.thumbnail) embed.setThumbnail(current.thumbnail);
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cloudmusic:toggle").setLabel(snapshot.status === "paused" ? "繼續" : "暫停").setEmoji(snapshot.status === "paused" ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("cloudmusic:next").setLabel("下一首").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("cloudmusic:leave").setLabel("離開").setEmoji("👋").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("cloudmusic:refresh").setLabel("重新整理").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("cloudmusic:like").setLabel("收藏").setEmoji("💗").setStyle(ButtonStyle.Success),
  );
  return { content: "", embeds: [embed.toJSON()], components: [controls.toJSON()] };
}

client.on("messageCreate", (message) => {
  if (message.author.bot || !client.user) return;
  const mentioned = message.mentions.users.has(client.user.id) || mentionsBot(message.content, client.user.id);
  const input = normalizeInvocation(message.content, client.user.id);
  const command = input.trim().toLowerCase().replace(/^[!/]/, "");
  const knownCommand = command === "status" || command === "favorites" || command === "forget";
  const explicitTextCommand = /^!(status|favorites|forget)$/i.test(message.content.trim());
  console.log(`[Discord] 收到訊息：guild=${message.guildId ?? "dm"} channel=${message.channelId} mentioned=${mentioned} command=${knownCommand ? command : "chat"}`);
  const canHandle = shouldHandleMessage({
    userId: message.author.id,
    guildId: message.guildId,
    channelId: message.channelId,
    isDm: !message.guildId,
    mentioned: mentioned || explicitTextCommand,
  }, config);
  if (!canHandle) {
    console.log("[Discord] 已忽略訊息：未通過提及或白名單設定");
    return;
  }
  const sessionId = sessionIdFor(message.author.id, message.channelId);
  enqueue(sessionId, async () => {
    try {
      if (command === "status") {
        await replyToMessage(message, `雲端連線正常，已守望 ${Math.floor((Date.now() - startedAt) / 60_000)} 分鐘。`);
        return;
      }
      if (command === "favorites") {
        const channel = message.member?.voice.channel;
        if (!channel) {
          await replyToMessage(message, `請先加入語音頻道，再使用 \`!favorites\`。\n\n${formatFavorites()}`);
          return;
        }
        const entries = favorites.list(500).reverse();
        const first = await music.playFavorites(channel, entries);
        await replyToMessage(message, `▶️ 已加入 **${channel.name}**，從「${first.title}」開始播放 ${entries.length} 筆雲端收藏。`);
        return;
      }
      if (command === "forget") {
        await memory.forget(sessionId);
        await replyToMessage(message, "這個頻道的雲端短期對話已清空。");
        return;
      }
      await message.channel.sendTyping().catch(() => undefined);
      await replyToMessage(message, await runConversation(sessionId, input));
    } catch (error) {
      console.error("[Discord] 回覆失敗", error);
    }
  });
});

async function handleSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  console.log(`[Discord] 收到 Slash 指令：/${interaction.commandName}`);
  if (!shouldHandleMessage({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    isDm: !interaction.guildId,
    mentioned: true,
  }, config)) {
    await fastInteractionReply(interaction, "這個入口目前沒有開放。");
    return;
  }
  const sessionId = sessionIdFor(interaction.user.id, interaction.channelId);
  if (interaction.commandName === "forget") {
    await memory.forget(sessionId);
    await fastInteractionReply(interaction, "這個頻道的雲端短期對話已清空。");
    return;
  }
  if (interaction.commandName === "status") {
    await fastInteractionReply(interaction, `雲端連線正常，已守望 ${Math.floor((Date.now() - startedAt) / 60_000)} 分鐘。`);
    return;
  }
  if (interaction.commandName === "favorites") {
    const member = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    const channel = member?.voice.channel;
    if (!channel) {
      await fastInteractionReply(interaction, `請先加入語音頻道，再使用 \`/favorites\`。\n\n${formatFavorites()}`);
      return;
    }
    const entries = favorites.list(500).reverse();
    if (!entries.length) {
      await fastInteractionReply(interaction, formatFavorites());
      return;
    }
    await fastInteractionReply(interaction, "🎧 正在加入語音頻道並準備雲端收藏；第一次播放需要下載音訊工具，請稍候。", false);
    try {
      const first = await music.playFavorites(channel, entries);
      console.log(`[CloudMusic] 收藏播放面板：${first.title}`);
      await editInteractionReply(interaction, musicPanelPayload(channel.name));
    } catch (error) {
      console.error("[CloudMusic] 無法播放收藏", error);
      await editInteractionReply(interaction, `播放失敗：${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  if (interaction.commandName === "play") {
    const member = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    const channel = member?.voice.channel;
    if (!channel) {
      await fastInteractionReply(interaction, "請先加入語音頻道，再使用 `/play 網址`。");
      return;
    }
    const url = interaction.options.getString("url", true).trim();
    await fastInteractionReply(interaction, "🎧 正在加入語音頻道並準備播放網址，請稍候。", false);
    try {
      await music.playUrl(channel, url);
      await editInteractionReply(interaction, musicPanelPayload(channel.name));
    } catch (error) {
      console.error("[CloudMusic] 無法播放網址", error);
      await editInteractionReply(interaction, `播放失敗：${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  if (interaction.commandName === "like") {
    const url = interaction.options.getString("url")?.trim();
    if (!url) {
      await fastInteractionReply(interaction, "雲端沒有目前播放中的歌曲，請使用 `/like 網址` 儲存單曲或播放清單。");
      return;
    }
    const saved = await favorites.save(url);
    await fastInteractionReply(interaction, saved.added ? `已存入雲端收藏：${saved.entry.title}` : `這個連結已經收藏過了：${saved.entry.title}`);
    return;
  }
  if (interaction.commandName === "save") {
    await fastInteractionReply(interaction, "雲端沒有目前播放中的歌曲，請改用 `/like 網址` 儲存。");
    return;
  }
  if (interaction.commandName !== "chat") {
    await fastInteractionReply(interaction, "這個指令需要昔漣桌面程式保持開啟。雲端版目前可使用 `/chat`、`/play`、`/favorites`、`/like`、`/forget`、`/status`。");
    return;
  }
  const input = interaction.options.getString("message", true);
  await interaction.deferReply();
  try {
    const chunks = splitDiscordText(await runConversation(sessionId, input));
    await interaction.editReply(chunks[0]);
    for (const chunk of chunks.slice(1)) await interaction.followUp(chunk);
  } catch (error) {
    console.error("[Discord] 指令回覆失敗", error);
    await interaction.editReply("雲層暫時擋住了訊息，請稍後再試一次。");
  }
}

async function handleMusicButton(interaction: ButtonInteraction): Promise<void> {
  if (!shouldHandleMessage({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    isDm: !interaction.guildId,
    mentioned: true,
  }, config)) {
    await interaction.reply({ content: "這個播放控制目前沒有開放。", ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  const action = interaction.customId.slice("cloudmusic:".length);
  if (action === "leave") {
    music.stop();
    await interaction.editReply({ content: "👋 已停止播放並離開語音頻道。", embeds: [], components: [] });
    return;
  }
  if (action === "toggle") music.pauseOrResume();
  if (action === "next") {
    const before = music.snapshot();
    if (!music.skip()) {
      await interaction.editReply({ content: "播放器目前沒有歌曲。", embeds: [], components: [] });
      return;
    }
    if (!before.queueLength) {
      await interaction.editReply({ content: "⏭️ 播放佇列已結束，已離開語音頻道。", embeds: [], components: [] });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (action === "like") {
    const current = music.snapshot().current;
    if (!current) {
      await interaction.editReply({ content: "播放器目前沒有歌曲。", embeds: [], components: [] });
      return;
    }
    await favorites.save(current.url, current.title);
  }
  const member = interaction.guild
    ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
    : null;
  const channelName = member?.voice.channel?.name ?? "語音頻道";
  await interaction.editReply(musicPanelPayload(channelName));
}

client.on("interactionCreate", (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!eventClaims.claim(interaction.id)) {
      console.log(`[Discord] 已忽略重複 interaction：${interaction.id}`);
      return;
    }
    void handleSlash(interaction).catch(async (error) => {
      console.error("[Discord] 指令處理失敗", error);
      const content = "雲層暫時擋住了指令，請稍後再試一次。";
      if (interaction.deferred || interaction.replied) await interaction.editReply(content).catch(() => undefined);
      else await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
    });
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("cloudmusic:")) {
    if (!eventClaims.claim(interaction.id)) {
      console.log(`[Discord] 已忽略重複播放控制：${interaction.id}`);
      return;
    }
    void handleMusicButton(interaction).catch(async (error) => {
      console.error("[CloudMusic] 播放控制失敗", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "播放控制失敗，請重新執行 `/play`。", embeds: [], components: [] }).catch(() => undefined);
      } else {
        await interaction.reply({ content: "播放控制失敗，請重新執行 `/play`。", ephemeral: true }).catch(() => undefined);
      }
    });
  }
});

client.once("ready", async (readyClient) => {
  readyClient.user.setPresence({ status: "online", activities: [{ name: config.activity, type: ActivityType.Playing }] });
  console.log(`[Cyrene Cloud] Discord 已連線：${readyClient.user.tag}`);
  const commands = [
    new SlashCommandBuilder().setName("chat").setDescription("和雲端昔漣說話").addStringOption((option) => option.setName("message").setDescription("想說的話").setRequired(true)),
    new SlashCommandBuilder().setName("forget").setDescription("清除目前頻道的雲端短期對話"),
    new SlashCommandBuilder().setName("status").setDescription("查看雲端連線狀態"),
    new SlashCommandBuilder().setName("favorites").setDescription("加入你的語音頻道並播放雲端收藏"),
    new SlashCommandBuilder().setName("play").setDescription("加入你的語音頻道並直接播放網址")
      .addStringOption((option) => option.setName("url").setDescription("YouTube、Bilibili 或其他支援的音樂網址").setRequired(true)),
    new SlashCommandBuilder().setName("like").setDescription("儲存單曲或播放清單網址")
      .addStringOption((option) => option.setName("url").setDescription("單曲或播放清單網址").setRequired(false)),
    new SlashCommandBuilder().setName("save").setDescription("說明如何將目前內容保存至雲端"),
  ].map((command) => command.toJSON());
  try {
    const rest = new REST({ version: "10" }).setToken(config.discordToken);
    const existing = await rest.get(Routes.applicationCommands(readyClient.user.id)) as Array<{ id: string; name: string; type: number }>;
    for (const command of commands) {
      const current = existing.find((item) => item.type === 1 && item.name === command.name);
      if (current) {
        await rest.patch(Routes.applicationCommand(readyClient.user.id, current.id), { body: command });
      } else {
        await rest.post(Routes.applicationCommands(readyClient.user.id), { body: command });
      }
    }
    console.log(`[Cyrene Cloud] 已同步 ${commands.length} 個 / 指令，並保留 Discord Activity Entry Point`);
  } catch (error) {
    console.warn("[Cyrene Cloud] / 指令註冊失敗，文字提及仍可使用", error);
  }
});

function escapeMarkdown(value: string): string {
  return value.replace(/[\\[\]()*_~`>]/g, "\\$&");
}

await Promise.all([memory.init(), favorites.init()]);
const healthServer = startHealthServer(config.port, () => ({
  discord: client.isReady() ? "connected" : "connecting",
  uptimeSeconds: Math.floor((Date.now() - startedAt) / 1_000),
}));

async function shutdown(signal: string) {
  console.log(`[Cyrene Cloud] 收到 ${signal}，安全停止`);
  healthServer.close();
  music.stop();
  client.destroy();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

console.log("[Cyrene Cloud] 正在連線 Discord…");
await client.login(config.discordToken);
