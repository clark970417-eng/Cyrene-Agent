import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { DiscordMusicRequest } from "./music-source";

export const DISCORD_MUSIC_BUTTON_PREFIX = "cyrene:music:";

export function buildDiscordMusicControls(paused = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}previous`).setLabel("Previous").setEmoji("⏮️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}toggle`).setLabel(paused ? "Play" : "Pause").setEmoji(paused ? "▶️" : "⏸️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}skip`).setLabel("Next").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}stop`).setLabel("Leave").setEmoji("👋").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}queue`).setLabel("Queue").setEmoji("📃").setStyle(ButtonStyle.Secondary),
  );
}

export function buildDiscordVolumeControl(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${DISCORD_MUSIC_BUTTON_PREFIX}volume`)
      .setPlaceholder("🔊 Select volume")
      .addOptions(
        { label: "Mute", description: "0%", value: "0", emoji: "🔇" },
        { label: "Quiet", description: "25%", value: "25", emoji: "🔈" },
        { label: "Soft", description: "50%", value: "50", emoji: "🔉" },
        { label: "Medium", description: "75%", value: "75", emoji: "🔉" },
        { label: "Normal", description: "100%", value: "100", emoji: "🔊", default: true },
        { label: "Loud", description: "125%", value: "125", emoji: "🔊" },
        { label: "Maximum", description: "150%", value: "150", emoji: "🔊" },
      ),
  );
}

export function musicRequestFromButton(customId: string, paused = false): DiscordMusicRequest | null {
  if (!customId.startsWith(DISCORD_MUSIC_BUTTON_PREFIX)) return null;
  const action = customId.slice(DISCORD_MUSIC_BUTTON_PREFIX.length);
  if (action === "toggle") return { command: paused ? "resume" : "pause" };
  if (["previous", "skip", "queue", "stop"].includes(action)) {
    return { command: action as "previous" | "skip" | "queue" | "stop" };
  }
  return null;
}

const commands = [
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("直接和 Cyrene 聊天，不需要標註她")
    .addStringOption((option) => option.setName("message").setDescription("想對她說的話").setRequired(true)),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("播放 YouTube 或 Bilibili 連結／播放清單")
    .addStringOption((option) => option.setName("url").setDescription("YouTube 或 Bilibili 網址").setRequired(true)),
  new SlashCommandBuilder().setName("pause").setDescription("暫停目前播放的音樂"),
  new SlashCommandBuilder().setName("resume").setDescription("繼續播放已暫停的音樂"),
  new SlashCommandBuilder().setName("previous").setDescription("回到上一首歌曲"),
  new SlashCommandBuilder().setName("skip").setDescription("跳過目前歌曲"),
  new SlashCommandBuilder().setName("stop").setDescription("停止音樂並離開語音頻道"),
  new SlashCommandBuilder().setName("queue").setDescription("查看目前歌曲與接下來的播放佇列"),
  new SlashCommandBuilder().setName("clear").setDescription("清空接下來的歌曲，但保留目前歌曲"),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("從播放佇列移除指定歌曲")
    .addIntegerOption((option) => option.setName("position").setDescription("歌單中顯示的序號").setMinValue(1).setRequired(true)),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("調整音樂音量（0–150%）")
    .addIntegerOption((option) => option.setName("percent").setDescription("0 是靜音，100 是原始音量").setMinValue(0).setMaxValue(150).setRequired(true)),
  new SlashCommandBuilder()
    .setName("repeat")
    .setDescription("設定音樂循環模式")
    .addStringOption((option) => option.setName("mode").setDescription("選擇循環方式").setRequired(true)
      .addChoices(
        { name: "關閉循環", value: "off" },
        { name: "單曲循環", value: "track" },
        { name: "列表循環", value: "queue" },
      )),
  new SlashCommandBuilder()
    .setName("mode")
    .setDescription("切換順序或隨機播放")
    .addStringOption((option) => option.setName("type").setDescription("選擇播放順序").setRequired(true)
      .addChoices(
        { name: "順序播放", value: "ordered" },
        { name: "隨機播放", value: "shuffle" },
      )),
  new SlashCommandBuilder().setName("join").setDescription("讓 Cyrene 加入你的語音頻道進行 AI 通話"),
  new SlashCommandBuilder().setName("leave").setDescription("讓 Cyrene 離開目前的語音頻道"),
  new SlashCommandBuilder().setName("status").setDescription("查看 Bot、延遲、伺服器與語音狀態"),
  new SlashCommandBuilder().setName("help").setDescription("顯示 Cyrene 的 Discord 功能與指令"),
];

export const DISCORD_SLASH_COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = commands
  .map((command) => command.toJSON());

export const DISCORD_SLASH_COMMAND_NAMES = DISCORD_SLASH_COMMANDS.map((command) => command.name);
