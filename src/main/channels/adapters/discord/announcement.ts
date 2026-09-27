import * as path from "node:path";
import { stat } from "node:fs/promises";

export const DISCORD_ANNOUNCEMENT_FILE_LIMIT = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

export interface DiscordAnnouncementInput {
  mode?: "message" | "announcement";
  channelId: string;
  title?: string;
  content?: string;
  author?: string;
  footer?: string;
  link?: string;
  color?: string;
  mediaPaths?: string[];
  mentionUserIds?: string[];
}

export interface ValidatedDiscordAnnouncement {
  mode: "message" | "announcement";
  channelId: string;
  mentionUserIds: string[];
  title: string;
  content: string;
  author: string;
  footer: string;
  link?: string;
  color: number;
  media: Array<{ path: string; name: string; kind: "image" | "video"; size: number }>;
}

function trim(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseAnnouncementColor(value: unknown): number {
  const normalized = trim(value, 16).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : 0x66c8ff;
}

export async function validateDiscordAnnouncement(raw: DiscordAnnouncementInput): Promise<ValidatedDiscordAnnouncement> {
  const mode = raw.mode === "message" || raw.mode === "announcement" ? raw.mode : "announcement";
  const channelId = trim(raw.channelId, 24);
  if (!/^\d{15,22}$/.test(channelId)) throw new Error("請輸入有效的 Discord Channel ID");

  const mentionUserIds = [...new Set(Array.isArray(raw.mentionUserIds) ? raw.mentionUserIds : [])];
  if (mentionUserIds.length > 20) throw new Error("每則訊息最多標記 20 位成員");
  if (mentionUserIds.some((id) => typeof id !== "string" || !/^\d{15,22}$/.test(id))) {
    throw new Error("標記對象必須是有效的 Discord 使用者 ID");
  }

  const title = trim(raw.title, 256);
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const contentLimit = mode === "message" ? 2_000 : 4_096;
  if (content.length > contentLimit) {
    throw new Error(mode === "message" ? "一般訊息最多 2,000 字元" : "公告內容最多 4,096 字元");
  }
  const author = trim(raw.author, 256);
  const footer = trim(raw.footer, 2_048);
  const linkRaw = mode === "announcement" ? trim(raw.link, 2_048) : "";
  let link: string | undefined;
  if (linkRaw) {
    try {
      const parsed = new URL(linkRaw);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
      link = parsed.toString();
    } catch {
      throw new Error("公告連結必須是有效的 http 或 https 網址");
    }
  }

  const uniquePaths = [...new Set((raw.mediaPaths ?? []).filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
  if (uniquePaths.length > 10) throw new Error("Discord 每則訊息最多可附加 10 個檔案");
  const mentionTextLength = mentionUserIds.reduce((total, id) => total + id.length + 3, 0)
    + Math.max(0, mentionUserIds.length - 1);
  const messageLength = content.length + mentionTextLength + (content && mentionUserIds.length ? 1 : 0);
  if (mode === "message" && messageLength > 2_000) {
    throw new Error("訊息與標記對象合計超過 Discord 的 2,000 字元上限");
  }
  if (mode === "message" && !content && uniquePaths.length === 0) {
    throw new Error("請輸入訊息，或至少加入一張圖片／影片");
  }
  if (mode === "announcement" && !title && !content && uniquePaths.length === 0) {
    throw new Error("請至少加入標題、內容、圖片或影片其中一項");
  }

  const media: ValidatedDiscordAnnouncement["media"] = [];
  for (const [index, filePath] of uniquePaths.entries()) {
    const ext = path.extname(filePath).toLowerCase();
    const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : null;
    if (!kind) throw new Error(`不支援的媒體格式：${path.basename(filePath)}`);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new Error(`找不到媒體檔案：${path.basename(filePath)}`);
    if (info.size > DISCORD_ANNOUNCEMENT_FILE_LIMIT) {
      throw new Error(`${path.basename(filePath)} 超過每個檔案 10 MB 上限`);
    }
    // attachment:// URLs are stricter than normal Discord filenames. A local
    // screenshot name can contain spaces or non-ASCII characters and make
    // EmbedBuilder throw a generic "Received one or more errors" validation
    // failure before the request is sent.
    media.push({
      path: filePath,
      name: `announcement-${index + 1}${ext}`,
      kind,
      size: info.size,
    });
  }

  return {
    mode,
    channelId,
    mentionUserIds,
    title,
    content,
    author,
    footer,
    link,
    color: parseAnnouncementColor(raw.color),
    media,
  };
}
