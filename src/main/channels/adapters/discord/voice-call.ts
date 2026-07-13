import { Readable } from "node:stream";
import { promises as fs } from "node:fs";
import {
  AudioPlayerStatus,
  EndBehaviorType,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import { PermissionFlagsBits, type Client, type Message } from "discord.js";
import prism from "prism-media";
import type { DiscordChannelConfig } from "../../settings-store";
import type { IncomingMessage, OutgoingMessage } from "../../types";

const LOG = "[DiscordVoice]";
const MAX_UTTERANCE_BYTES = 48_000 * 2 * 2 * 30;

export interface DiscordVoiceServices {
  transcribe: (pcm16Mono16k: Buffer) => Promise<string>;
  synthesize: (text: string) => Promise<{ audio: Buffer; format: "wav" | "mp3" } | null>;
}

let services: DiscordVoiceServices | null = null;

export function setDiscordVoiceServices(next: DiscordVoiceServices): void {
  services = next;
}

export function getDiscordVoiceServices(): DiscordVoiceServices | null {
  return services;
}

export type DiscordVoiceCommand = "join" | "leave" | null;

export function parseDiscordVoiceCommand(text: string): DiscordVoiceCommand {
  const normalized = text.trim().replace(/[！!。.，,？?]/g, "");
  if (/^(加入|進入|進來|來)(語音|通話|聊天|dc通話)$/.test(normalized)
    || /^(加入語音頻道|進來陪我通話|陪我通話)$/.test(normalized)) return "join";
  if (/^(離開|退出|結束|停止)(語音|通話|聊天|dc通話)$/.test(normalized)
    || /^(掛斷|離開語音頻道|結束通話)$/.test(normalized)) return "leave";
  return null;
}

/** Discord 解碼後為 48kHz/16-bit/stereo；Whisper/阿里雲使用 16kHz/mono。 */
export function stereo48kToMono16k(input: Buffer): Buffer {
  const frames = Math.floor(input.length / 4);
  const outputFrames = Math.floor(frames / 3);
  const output = Buffer.allocUnsafe(outputFrames * 2);
  let out = 0;
  for (let frame = 0; frame + 2 < frames; frame += 3) {
    const offset = frame * 4;
    const left = input.readInt16LE(offset);
    const right = input.readInt16LE(offset + 2);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((left + right) / 2))), out);
    out += 2;
  }
  return output.subarray(0, out);
}

export class DiscordVoiceCall {
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private guildId: string | null = null;
  private textChannelId: string | null = null;
  private activeUserId: string | null = null;
  private activeUserName: string | undefined;
  private processing = false;
  private speaking = false;
  private capturing = new Set<string>();

  constructor(
    private readonly client: Client,
    private readonly getConfig: () => DiscordChannelConfig,
    private readonly dispatch: (msg: IncomingMessage) => Promise<OutgoingMessage | null>,
  ) {}

  isActive(): boolean {
    return this.connection !== null && this.guildId !== null;
  }

  async handleCommand(message: Message, command: DiscordVoiceCommand): Promise<boolean> {
    if (!command) return false;
    if (command === "leave") {
      await this.leave();
      await message.reply("好，我先離開語音頻道了。");
      return true;
    }
    if (this.getConfig().voiceEnabled === false) {
      await message.reply("Discord 語音通話目前未啟用，請先到 Cyrene 的 Discord 設定開啟。");
      return true;
    }
    if (!getDiscordVoiceServices()) {
      await message.reply("語音服務尚未就緒，請重新啟動 Cyrene 後再試一次。");
      return true;
    }
    const channel = message.member?.voice.channel;
    if (!channel) {
      await message.reply("你要先加入一個語音頻道，我才能進去陪你通話。");
      return true;
    }
    const botMember = channel.guild.members.me;
    const permissions = botMember ? channel.permissionsFor(botMember) : null;
    if (!channel.joinable || !permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      await message.reply("我沒有加入或說話權限，請替 Bot 開啟「連接」與「說話」。");
      return true;
    }

    await this.leave();
    this.guildId = channel.guild.id;
    this.textChannelId = message.channelId;
    this.activeUserId = message.author.id;
    this.activeUserName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    this.connection.subscribe(this.player);
    this.bindConnection();
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
      await message.reply("我進來了。你直接說話就好，我會在你停下來後回答。要結束時標註我說「離開通話」。");
    } catch (err) {
      console.error(LOG, "加入語音失敗:", err);
      await this.leave();
      await message.reply("我沒能連上語音頻道，請檢查 Bot 的連接／說話權限後再試。");
    }
    return true;
  }

  async leave(): Promise<void> {
    this.processing = false;
    this.speaking = false;
    this.capturing.clear();
    this.player?.stop(true);
    this.connection?.destroy();
    this.player = null;
    this.connection = null;
    this.guildId = null;
    this.textChannelId = null;
    this.activeUserId = null;
    this.activeUserName = undefined;
  }

  private bindConnection(): void {
    const connection = this.connection;
    const player = this.player;
    if (!connection || !player) return;
    connection.on("error", (err) => console.error(LOG, "voice connection error:", err));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        await this.leave();
      }
    });
    player.on("error", (err) => {
      this.speaking = false;
      console.error(LOG, "audio player error:", err);
    });
    player.on(AudioPlayerStatus.Idle, () => {
      this.speaking = false;
    });
    connection.receiver.speaking.on("start", (userId) => {
      if (userId !== this.activeUserId || this.processing || this.speaking || this.capturing.has(userId)) return;
      this.captureUtterance(userId);
    });
  }

  private captureUtterance(userId: string): void {
    const connection = this.connection;
    if (!connection) return;
    this.capturing.add(userId);
    const opus = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 900 },
    });
    const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
    const chunks: Buffer[] = [];
    let size = 0;
    opus.pipe(decoder);
    decoder.on("data", (chunk: Buffer) => {
      if (size >= MAX_UTTERANCE_BYTES) return;
      const remaining = MAX_UTTERANCE_BYTES - size;
      const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(Buffer.from(piece));
      size += piece.length;
    });
    decoder.on("error", (err) => console.error(LOG, "Opus 解碼失敗:", err));
    decoder.once("end", () => {
      this.capturing.delete(userId);
      if (size < 48_000 * 4 / 4) return; // 少於約 250ms，多半是雜音。
      const pcm = stereo48kToMono16k(Buffer.concat(chunks, size));
      void this.processUtterance(pcm);
    });
  }

  private async processUtterance(pcm: Buffer): Promise<void> {
    const currentServices = getDiscordVoiceServices();
    const textChannelId = this.textChannelId;
    const userId = this.activeUserId;
    if (!currentServices || !textChannelId || !userId || this.processing) return;
    this.processing = true;
    try {
      const transcript = (await currentServices.transcribe(pcm)).trim();
      if (!transcript) return;
      const outgoing = await this.dispatch({
        channel: "discord",
        senderId: userId,
        senderName: this.activeUserName,
        chatId: textChannelId,
        text: transcript,
        at: new Date(),
        _raw: { source: "discord-voice", guildId: this.guildId },
      });
      const reply = outgoing?.parts
        .filter((part): part is Extract<typeof part, { kind: "text" }> => part.kind === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!reply || !this.connection || !this.player) return;
      const audioPart = outgoing?.parts.find(
        (part): part is Extract<typeof part, { kind: "audio" }> => part.kind === "audio",
      );
      const speech = audioPart
        ? {
            audio: await fs.readFile(audioPart.filePath),
            format: audioPart.mime === "audio/wav" ? "wav" as const : "mp3" as const,
          }
        : await currentServices.synthesize(reply);
      if (!speech?.audio.length || !this.connection || !this.player) return;
      this.speaking = true;
      this.player.play(createAudioResource(Readable.from(speech.audio), { inputType: StreamType.Arbitrary }));
    } catch (err) {
      console.error(LOG, "語音輪次失敗:", err);
      const channel = await this.client.channels.fetch(textChannelId).catch(() => null);
      if (channel?.isSendable()) {
        await channel.send(`語音通話暫時失敗：${err instanceof Error ? err.message : String(err)}`).catch(() => undefined);
      }
    } finally {
      this.processing = false;
    }
  }
}
