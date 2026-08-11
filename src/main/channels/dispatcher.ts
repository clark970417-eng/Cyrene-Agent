// channels/dispatcher —— 入站消息處理核心。
//
// 設計原則：
//   - 不知道任何具體平臺。platform 信息只用於查找 adapter / 落日誌 / 寫 sessionId。
//   - 完全無副作用：UI 廣播、記憶寫入、sticker 推斷都在外部注入的回調裡完成。
//   - Phase 0 只搭骨架 + sessionId hash + 限速 + capability 降級工具函數。
//     Phase 1 填入完整的 agent 調用（handleIncoming → CyreneAgent）。
//
// sessionId 生成規則：
//   `channel:<channel>:<sha256(channel:senderId).slice(0,16)>`
//   加 channel 前綴防止跨平臺 ID 衝突；hash 截斷 16 字符節約空間且日誌脫敏。
//
// capability 降級：
//   把 OutgoingMessage 按目標渠道的 cap 翻譯 —— image→text 描述 / card→markdown / sticker 跳過。
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type {
  ChannelCapability,
  ChannelId,
  IncomingMessage,
  OutgoingMessage,
  OutgoingPart,
} from "./types";
import { channelManager, type ChannelManager } from "./manager";
import { getDefaultChannelsSettings, loadChannelsSettings, type ChannelsSettings } from "./settings-store";
import { appendLog, reloadLogFromDisk } from "./message-log";
import { appendHistory as appendChannelHistory } from "./history-log";
import { resolveLocalStickerPath } from "../sticker-protocol";
import { getStickersDir, loadUserStickerManifest } from "../sticker-storage";
import { BUILT_IN_STICKER_FILES } from "../sticker-descriptions";
import { BUILT_IN_STICKER_IDS } from "../../shared/sticker-types";
import { splitTextBySentenceBreaks } from "../../shared/message-segmentation";
import {
  normalizeMobileMessageSegmentationMode,
  type MobileMessageSegmentationMode,
} from "../../shared/preferences";
import { rememberProactiveChannelRecipient } from "./proactive-delivery";
import { toTraditionalTaiwan } from "../utils/opencc";

/** Phase A：用于拼接历史对话的轻量 ChatMessage 形状（与 orchestrator ChatMessage 兼容）。 */
interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
}

type TtsAudioFormat = "mp3" | "wav" | "pcm";

interface DispatcherTtsContext {
  channel: ChannelId;
}

interface DispatcherTtsResult {
  audio: Buffer;
  format: TtsAudioFormat;
  mime: string;
  extension: ".mp3" | ".wav" | ".pcm";
}

const LOG = "[ChannelDispatcher]";

/** sessionId 缓存（用于查重 / 调试 / 上限管理） */
const sessionIndex = new Map<string, { channel: ChannelId; senderId: string; lastAt: number }>();

/** 限速：单用户每分钟最多 N 条 */
class RateLimiter {
  private buckets = new Map<string, number[]>(); // key = channel:senderId → timestamp[]
  constructor(private settings: ChannelsSettings) {}

  /** 检查并记录一次命中。返回 true = 通过；false = 超限。 */
  hit(channel: ChannelId, senderId: string): boolean {
    const key = `${channel}:${senderId}`;
    const now = Date.now();
    const arr = this.buckets.get(key) ?? [];
    // 砍掉 60s 之外的
    const fresh = arr.filter((t) => now - t < 60_000);
    if (fresh.length >= this.settings.rateLimitPerUser) {
      this.buckets.set(key, fresh);
      return false;
    }
    fresh.push(now);
    this.buckets.set(key, fresh);

    // 渠道級全侷限速
    const chKey = `__channel__:${channel}`;
    const chArr = this.buckets.get(chKey) ?? [];
    const chFresh = chArr.filter((t) => now - t < 60_000);
    if (chFresh.length >= this.settings.rateLimitPerChannel) {
      this.buckets.set(chKey, chFresh);
      return false;
    }
    chFresh.push(now);
    this.buckets.set(chKey, chFresh);

    return true;
  }

  /** 測試用：重置所有桶 */
  reset(): void {
    this.buckets.clear();
  }
}

/** 計算一個穩定、匿名的 sessionId。 */
export function makeSessionId(channel: ChannelId, senderId: string): string {
  const hash = createHash("sha256")
    .update(`${channel}:${senderId}`)
    .digest("hex")
    .slice(0, 16);
  return `channel:${channel}:${hash}`;
}

/** 记录 sessionId → 原始 senderId（用于调试 / 反查；不影响正常运行） */
function recordSession(channel: ChannelId, senderId: string, sessionId: string): void {
  sessionIndex.set(sessionId, { channel, senderId, lastAt: Date.now() });
  // 上限管理：超过 5000 个 sessionId 就丢弃最老的（LRU 近似）
  if (sessionIndex.size > 5000) {
    const oldest = [...sessionIndex.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt)[0];
    if (oldest) sessionIndex.delete(oldest[0]);
  }
}

/** 把原始 senderId 反查回 sessionId。调试用，不依赖也能跑。 */
export function lookupOriginalSender(sessionId: string): { channel: ChannelId; senderId: string } | null {
  const entry = sessionIndex.get(sessionId);
  return entry ? { channel: entry.channel, senderId: entry.senderId } : null;
}

/**
 * 把 sticker id 解析成本地绝对路径（用于 OutgoingPart sticker.imagePath）。
 *
 * - 内置 sticker（BUILT_IN_STICKER_IDS）：从 app.getAppPath() 下找 public/stickers/<file>
 *   - dev 模式：<appPath>/src/renderer/public/stickers
 *   - built 模式：<appPath>/dist/renderer/stickers
 *   两个路径都尝试，第一个命中即返回。
 * - 用户 sticker：从 userData/stickers/<file>（通过 manifest 拿到 file 字段）。
 * - 解析失败（文件不存在、路径穿越、未知 id）→ 返回 null，调用方跳过此 part。
 */
export function resolveStickerImagePath(stickerId: string): string | null {
  if (!stickerId) return null;

  // 内置 sticker：直接用 BUILT_IN_STICKER_FILES 映射到 public 目录
  if ((BUILT_IN_STICKER_IDS as readonly string[]).includes(stickerId)) {
    const file = BUILT_IN_STICKER_FILES[stickerId];
    if (!file) return null;
    const appPath = app.getAppPath();
    // 优先 built 路径（生产），其次 dev 路径（开发模式）
    const candidates = [
      path.join(appPath, "dist", "renderer", "stickers", file),
      path.join(appPath, "src", "renderer", "public", "stickers", file),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  // 用户 sticker：从 manifest 拿 file 字段，再走 sticker-protocol 的安全解析
  // （resolveLocalStickerPath 已做路径穿越防护）
  const manifest = loadUserStickerManifest();
  const meta = manifest[stickerId];
  if (!meta) return null;
  return resolveLocalStickerPath(getStickersDir(), meta.file);
}

/** Dispatcher 配置（依赖注入）。 */
export interface DispatcherDeps {
  manager: ChannelManager;
  /** 渲染端 chatWindow 用于镜像显示（可选） */
  getChatWindow?: () => { webContents: { isDestroyed(): boolean; send: (channel: string, ...args: unknown[]) => void }; isDestroyed(): boolean } | null;
  /** Phase 1+：完整 agent 调用。Phase 0 留空，返回纯 echo。
   *  返回 text（必填）+ sticker（可选 sticker id，由 dispatcher 解析成本地路径后纳入 OutgoingMessage.parts）。
   *  sticker 解析失败的会静默跳过（不会把坏数据塞进 parts）。 */
  buildAndRunAgent?: (msg: IncomingMessage, sessionId: string, priorMessages?: ChatMessage[]) => Promise<{ text: string; sticker: string | null }>;
  /** Phase A：读这个 sessionId 最近 N 条对话历史（按时间顺序）。不提供时不拼历史，行为同 Phase 0。 */
  loadRecentChannelHistory?: (sessionId: string, limit: number) => Promise<ChatMessage[]>;
  /** Phase 3：可选 — 把文本合成成音频。失败返回 null，dispatcher 会跳过 audio。 */
  synthesizeTts?: (text: string, context: DispatcherTtsContext) => Promise<Buffer | DispatcherTtsResult | null>;
  /** Phase 3：可选 — 桌面端镜像广播：bot 入站/出站消息通知给 chatWindow。 */
  broadcastChat?: (event: {
    type: "bot:incoming" | "bot:outgoing";
    channel: string;
    senderId: string;
    senderName?: string;
    chatId: string;
    text: string;
    at: number;
  }) => void;
  /** 读取通用设置中与渠道发送有关的偏好。 */
  loadGeneralSettings?: () => { mobileMessageSegmentation?: MobileMessageSegmentationMode };
}

export function buildTextOutgoingParts(
  replyText: string,
  mobileMessageSegmentation: MobileMessageSegmentationMode,
): OutgoingPart[] {
  const mode = normalizeMobileMessageSegmentationMode(mobileMessageSegmentation);
  const texts = mode === "on" ? splitTextBySentenceBreaks(replyText) : [replyText];
  return texts.map((text) => ({ kind: "text", text }));
}

export function shouldAppendChannelTtsAudio(
  channel: ChannelId,
  ttsEnabled: boolean,
  hasSynthesizeTts: boolean,
  adapterSupportsAudio: boolean | undefined,
): boolean {
  if (channel === "wechat") return false;
  return ttsEnabled && hasSynthesizeTts && adapterSupportsAudio === true;
}

export function extractDiscordVoiceRequestTopic(text: string): string | null {
  const cleaned = text.replace(/<@!?\d+>/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/能傳一段(?:(.+?)的)?語音(?:嗎)?[？?]?\s*$/u);
  if (!match) return null;
  return match[1]?.trim() || "自由發揮一段自然、親切的內容";
}

export function isDiscordTextVoiceRequest(msg: IncomingMessage): boolean {
  return msg.channel === "discord" && extractDiscordVoiceRequestTopic(msg.text) !== null;
}

export function prepareDiscordVoiceAgentMessage(msg: IncomingMessage): IncomingMessage {
  if (msg.channel !== "discord") return msg;
  const topic = extractDiscordVoiceRequestTopic(msg.text);
  if (topic === null) return msg;
  return { ...msg, text: [
    `請直接寫出一段關於「${topic}」、適合用昔漣口吻朗讀的自然口語內容。`,
    "本次回答會由 Discord 語音附件功能自動合成並成功發送。",
    "只輸出要被朗讀的內容，不要解釋傳送方式，也不要討論是否能傳語音。",
  ].join("\n") };
}

export function shouldSynthesizeChannelTts(msg: IncomingMessage, ttsEnabled: boolean): boolean {
  if (!ttsEnabled) return false;
  if (msg.channel !== "discord") return true;
  if (isDiscordTextVoiceRequest(msg)) return true;
  const raw = msg._raw;
  return !!raw && typeof raw === "object" && (raw as { source?: unknown }).source === "discord-voice";
}

export function normalizeChannelReplyText(text: string): string {
  return toTraditionalTaiwan(text);
}

export class ChannelDispatcher {
  private settings: ChannelsSettings;
  private limiter: RateLimiter;
  deps: DispatcherDeps;

  constructor(deps: DispatcherDeps) {
    this.deps = deps;
    // 這個 singleton 可能早於 app.whenReady() 建立，此時不可讀 safeStorage。
    // initChannels() 會在 Electron ready 後呼叫 reloadSettings()。
    this.settings = getDefaultChannelsSettings();
    this.limiter = new RateLimiter(this.settings);
    reloadLogFromDisk();
  }

  /** 重新加載 settings（UI 改了限速配置時調） */
  reloadSettings(): void {
    this.settings = loadChannelsSettings();
    this.limiter = new RateLimiter(this.settings);
  }

  /**
   * 處理一條入站消息。這是 manager 注入到 adapter.onMessage 的回調。
   *
   * Phase 0 行為：限速 → 計算 sessionId → 調 buildAndRunAgent（如果有）→ 構造 OutgoingMessage。
   * 如果沒注入 buildAndRunAgent，返回 echo 作為佔位（僅 Phase 0 用於聯調）。
   */
  async handleIncoming(msg: IncomingMessage): Promise<OutgoingMessage | null> {
    if (!this.limiter.hit(msg.channel, msg.senderId)) {
      console.warn(LOG, `限速: ${msg.channel}:${msg.senderId}`);
      return null;
    }

    const sessionId = makeSessionId(msg.channel, msg.senderId);
    recordSession(msg.channel, msg.senderId, sessionId);
    rememberProactiveChannelRecipient(msg, sessionId);

    // Phase 3：入站消息广播到桌面端 chatWindow（让用户看到 bot 在和谁聊天）
    if (this.settings.mirrorToDesktop) {
      try {
        this.deps.broadcastChat?.({
          type: "bot:incoming",
          channel: msg.channel,
          senderId: msg.senderId,
          senderName: msg.senderName,
          chatId: msg.chatId,
          text: msg.text,
          at: msg.at.getTime(),
        });
      } catch (err) {
        console.warn(LOG, "broadcastChat (incoming) 失敗:", err);
      }
    }

    // Phase 3.4：入站消息寫日誌
    try {
      appendLog({
        dir: "incoming",
        channel: msg.channel,
        senderId: msg.senderId,
        senderName: msg.senderName,
        chatId: msg.chatId,
        text: msg.text,
        hasAttachments: (msg.attachments?.length ?? 0) > 0,
      });
    } catch (err) {
      console.warn(LOG, "appendLog (incoming) 失败:", err);
    }

    // Phase A2：入站消息落对话历史（下一步 LLM 取的滑窗数据源）
    try {
      appendChannelHistory(sessionId, "user", msg.text);
    } catch (err) {
      console.warn(LOG, "appendHistory (incoming) 失败:", err);
    }

    // Phase 1 实装的 agent 调用；Phase 0 没有 → echo
    let replyText: string;
    let sticker: string | null = null;
    if (this.deps.buildAndRunAgent) {
      // Phase A：拼接最近 16 条历史 (同桌面端 buildModelMessages 行为).
      // 加载失败/未注入 → 不拼历史 (兼容旧实现).
      let priorMessages: ChatMessage[] | undefined;
      if (this.deps.loadRecentChannelHistory) {
        try {
          priorMessages = await this.deps.loadRecentChannelHistory(sessionId, 16);
        } catch (err) {
          console.warn(LOG, "loadRecentChannelHistory 失败 (继续不带历史):", err);
          priorMessages = undefined;
        }
      }
      try {
        const result = await this.deps.buildAndRunAgent(prepareDiscordVoiceAgentMessage(msg), sessionId, priorMessages);
        replyText = normalizeChannelReplyText(result.text);
        sticker = result.sticker;
      } catch (err) {
        console.error(LOG, "agent 调用失败:", err instanceof Error ? err.message : err);
        return null;
      }
    } else {
      replyText = `[echo][${msg.channel}][${msg.senderId}] ${msg.text}`;
      console.log(LOG, "Phase 0 echo (无 buildAndRunAgent):", replyText);
    }

    // 构造 OutgoingMessage parts
    const mobileMessageSegmentation = normalizeMobileMessageSegmentationMode(
      this.deps.loadGeneralSettings?.().mobileMessageSegmentation,
    );
    const parts: OutgoingPart[] = buildTextOutgoingParts(replyText, mobileMessageSegmentation);

    // Phase 3：TTS 音频自动追加（如果启用且适配器支持 audio）
    console.log(LOG, `TTS 决策: ttsEnabled=${this.settings.ttsEnabled} hasFn=${!!this.deps.synthesizeTts}`);
    const adapterCap = this.deps.manager.getAdapter(msg.channel)?.capability;
    console.log(LOG, `TTS 决策: adapterCap.audio=${adapterCap?.audio}`);
    const discordVoiceRequest = isDiscordTextVoiceRequest(msg);
    if (shouldAppendChannelTtsAudio(msg.channel, shouldSynthesizeChannelTts(msg, this.settings.ttsEnabled), !!this.deps.synthesizeTts, adapterCap?.audio)) {
      if (this.deps.synthesizeTts) {
        try {
          const audioResult = normalizeTtsResult(await this.deps.synthesizeTts(replyText, { channel: msg.channel }));
          console.log(LOG, `TTS 决策: 合成结果 length=${audioResult?.audio.length ?? "null"} format=${audioResult?.format ?? "null"}`);
          if (audioResult && audioResult.audio.length > 0) {
            // 写到 userData/channels/audio/<messageId>.<ext> 缓存
            const audioDir = path.join(app.getPath("userData"), "channels", "audio");
            fs.mkdirSync(audioDir, { recursive: true });
            const audioPath = path.join(audioDir, `${msg.channel}-${Date.now()}${audioResult.extension}`);
            fs.writeFileSync(audioPath, audioResult.audio);
            console.log(LOG, `TTS verify: written path=${audioPath} ext=${audioResult.extension} mime=${audioResult.mime}`);
            parts.push({ kind: "audio", filePath: audioPath, mime: audioResult.mime });
            if (discordVoiceRequest) parts.splice(0, parts.length - 1);
            console.log(LOG, `TTS 合成完成: ${audioResult.audio.length} bytes → ${audioPath}`);
          }
        } catch (err) {
          console.warn(LOG, "TTS 合成失败（跳过音频）:", err instanceof Error ? err.message : err);
        }
      }
    }

    // Phase 4：sticker 决定纳入 OutgoingMessage.parts（统一消息模型）。
    // 由 onAgentRunFinished 计算（同一个 embedding 匹配结果，避免重复计算），
    // dispatcher 只负责解析本地路径 + 按 cap 降级。
    // 桌面聊天窗的 sticker 由 onAgentRunFinished 内部 IPC 广播承担，此处不重复。
    if (sticker && this.settings.stickerEnabled) {
      const stickerPath = resolveStickerImagePath(sticker);
      if (stickerPath) {
        parts.push({ kind: "sticker", stickerId: sticker, imagePath: stickerPath });
        console.log(LOG, `sticker 决定: id=${sticker} → ${stickerPath}`);
      } else {
        console.warn(LOG, `sticker 解析失败（跳过）: id=${sticker}`);
      }
    }

    // Phase 3：出站消息广播到桌面端
    if (this.settings.mirrorToDesktop) {
      try {
        this.deps.broadcastChat?.({
          type: "bot:outgoing",
          channel: msg.channel,
          senderId: msg.senderId,
          senderName: msg.senderName,
          chatId: msg.chatId,
          text: replyText,
          at: Date.now(),
        });
      } catch (err) {
        console.warn(LOG, "broadcastChat (outgoing) 失敗:", err);
    }
    }

    // Phase 3.4：出站消息寫日誌（僅文本 part，附件路徑不寫進 JSONL）
    try {
      appendLog({
        dir: "outgoing",
        channel: msg.channel,
        senderId: msg.senderId,
        senderName: msg.senderName,
        chatId: msg.chatId,
        text: replyText,
        hasAttachments: parts.some((p) => p.kind !== "text"),
      });
    } catch (err) {
      console.warn(LOG, "appendLog (outgoing) 失敗:", err);
    }

    // Phase A2：出站消息落對話歷史（assistant 角色）
    try {
      appendChannelHistory(sessionId, "assistant", replyText);
    } catch (err) {
      console.warn(LOG, "appendHistory (outgoing) 失敗:", err);
    }

    // 構造 OutgoingMessage，capability 降級
    const outgoing: OutgoingMessage = {
      channel: msg.channel,
      targetId: msg.chatId,
      threadId: msg.threadId,
      parts,
    };
    return this.downgradeToCapability(outgoing, this.deps.manager.getAdapter(msg.channel)?.capability);
  }

  /** 按目標渠道 cap 做降級。返回新對象不修改原對象。 */
  downgradeToCapability(msg: OutgoingMessage, cap: ChannelCapability | undefined): OutgoingMessage {
    if (!cap) return msg;
    const parts: OutgoingPart[] = [];
    for (const p of msg.parts) {
      if (p.kind === "text") {
        if (cap.maxTextLength > 0 && p.text.length > cap.maxTextLength) {
          parts.push({
            kind: "text",
            text: p.text.slice(0, Math.max(0, cap.maxTextLength - 20)) + "\n…(過長已截斷)",
          });
        } else {
          parts.push(p);
        }
      } else if (p.kind === "image" && !cap.image) {
        parts.push({ kind: "text", text: `[圖片] ${p.caption ?? p.url ?? p.filePath ?? ""}` });
      } else if (p.kind === "audio" && !cap.audio) {
        parts.push({ kind: "text", text: `[語音消息 ${p.mime}，見桌面端]` });
      } else if (p.kind === "file" && !cap.file) {
        parts.push({ kind: "text", text: `[文件] ${p.name ?? p.filePath}` });
      } else if (p.kind === "video" && !cap.video) {
        parts.push({ kind: "text", text: `[视频] ${p.name ?? p.filePath}` });
      } else if (p.kind === "card" && !cap.card) {
        const lines: string[] = [p.title];
        if (p.markdown) lines.push(p.markdown);
        if (p.fields && p.fields.length > 0) {
          lines.push(...p.fields.map((f) => `${f.key}: ${f.value}`));
        }
        parts.push({ kind: "text", text: lines.join(cap.markdown ? "\n" : "\n") });
      } else if (p.kind === "sticker" && !cap.sticker) {
        // skip
      } else {
        parts.push(p);
      }
    }
    return { ...msg, parts };
  }
}

function normalizeTtsResult(result: Buffer | DispatcherTtsResult | null): DispatcherTtsResult | null {
  if (!result) return null;
  if (Buffer.isBuffer(result)) {
    return {
      audio: result,
      format: "mp3",
      mime: "audio/mpeg",
      extension: ".mp3",
    };
  }
  return result;
}

/** 进程级单例 —— Phase 1 注入 buildAndRunAgent 后才会真正干活。 */
export const channelDispatcher = new ChannelDispatcher({
  manager: channelManager,
});

/** 给 index.ts 调：注入 buildAndRunAgent（让 dispatcher 真正跑 agent）
 *  返回 text + sticker：text 直接做 reply；sticker 由 dispatcher 解析成本地路径后纳入 OutgoingMessage.parts。 */
export function setDispatcherBuildAndRunAgent(
  fn: (msg: IncomingMessage, sessionId: string, priorMessages?: ChatMessage[]) => Promise<{ text: string; sticker: string | null }>,
): void {
  channelDispatcher.deps.buildAndRunAgent = fn;
}

/** Phase 3.1：注入 TTS 合成（返回音频或 null） */
export function setDispatcherSynthesizeTts(
  fn: (text: string, context: DispatcherTtsContext) => Promise<Buffer | DispatcherTtsResult | null>,
): void {
  channelDispatcher.deps.synthesizeTts = fn;
}

/** Phase A：注入最近对话历史读取（index.ts 注入一个用 history-log 实现的闭包） */
export function setDispatcherLoadRecentHistory(
  fn: (sessionId: string, limit: number) => Promise<{ role: "user" | "assistant"; content?: string }[]>,
): void {
  channelDispatcher.deps.loadRecentChannelHistory = fn;
}

/** Phase 3.2：注入桌面端镜像广播（chatWindow 推送 bot 入站/出站消息） */
export function setDispatcherBroadcastChat(
  fn: (event: {
    type: "bot:incoming" | "bot:outgoing";
    channel: string;
    senderId: string;
    senderName?: string;
    chatId: string;
    text: string;
    at: number;
  }) => void,
): void {
  channelDispatcher.deps.broadcastChat = fn;
}

/** 注入通用设置读取器（渠道发送时实时读取偏好）。 */
export function setDispatcherLoadGeneralSettings(
  fn: () => { mobileMessageSegmentation?: MobileMessageSegmentationMode },
): void {
  channelDispatcher.deps.loadGeneralSettings = fn;
}
