import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { constants as fsConstants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";

const MAX_PLAYLIST_ITEMS = 100;
const YT_DLP_RELEASE_BASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const SUPPORTED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "bilibili.com",
  "www.bilibili.com",
  "m.bilibili.com",
  "b23.tv",
]);

export interface DiscordMusicTrack {
  id?: string;
  title: string;
  url: string;
  thumbnail?: string;
  playlistTitle?: string;
  duration?: number;
  index: number;
  total: number;
}

export type DiscordMusicProcess = ChildProcessByStdio<null, Readable, Readable>;

export type DiscordMusicCommand =
  | "previous"
  | "pause"
  | "resume"
  | "skip"
  | "stop"
  | "queue"
  | "repeat-track"
  | "repeat-queue"
  | "repeat-off"
  | "shuffle"
  | "ordered"
  | "clear"
  | "remove"
  | "volume";

export interface DiscordMusicRequest {
  url?: string;
  command?: DiscordMusicCommand;
  value?: number;
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  original_url?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string } | null>;
}

interface YtDlpResult extends YtDlpEntry {
  entries?: Array<YtDlpEntry | null>;
  playlist_count?: number;
}

interface BilibiliSeasonEpisode {
  title?: string;
  bvid?: string;
  arc?: { duration?: number; pic?: string };
}

interface BilibiliInitialState {
  videoData?: {
    ugc_season?: {
      title?: string;
      cover?: string;
      sections?: Array<{ episodes?: BilibiliSeasonEpisode[] }>;
    };
  };
}

let ytDlpBinaryPromise: Promise<string> | null = null;

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function findDiscordMusicUrl(text: string): string | undefined {
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gi)) {
    const candidate = match[0].replace(/[，。！？、；：)\]}>'\"]+$/g, "");
    try {
      const url = new URL(candidate);
      if (SUPPORTED_HOSTS.has(normalizeHost(url.hostname))) return url.toString();
    } catch {
      // Ignore malformed links and let the message continue through normal AI handling.
    }
  }
  return undefined;
}

export function parseDiscordMusicRequest(text: string): DiscordMusicRequest | null {
  const url = findDiscordMusicUrl(text);
  if (url) return { url };

  const normalized = text.trim().replace(/[！!。.，,？?]/g, "").replace(/\s+/g, "");
  if (/^(暫停|暫停音樂|暫停播放)$/.test(normalized)) return { command: "pause" };
  if (/^(繼續|繼續音樂|繼續播放|恢復播放)$/.test(normalized)) return { command: "resume" };
  if (/^(下一首|跳過|跳過這首|切歌)$/.test(normalized)) return { command: "skip" };
  if (/^(停止音樂|停止播放|關掉音樂|結束播放)$/.test(normalized)) return { command: "stop" };
  if (/^(播放清單|播放列表|目前歌單|目前佇列|歌單|佇列)$/.test(normalized)) return { command: "queue" };
  if (/^(單曲循環|單曲重複)$/.test(normalized)) return { command: "repeat-track" };
  if (/^(列表循環|清單循環|歌單循環)$/.test(normalized)) return { command: "repeat-queue" };
  if (/^(關閉循環|取消循環|不循環)$/.test(normalized)) return { command: "repeat-off" };
  if (/^(隨機播放|打亂播放)$/.test(normalized)) return { command: "shuffle" };
  if (/^(順序播放|取消隨機)$/.test(normalized)) return { command: "ordered" };
  if (/^(清空歌單|清空佇列|清除歌單)$/.test(normalized)) return { command: "clear" };
  const remove = normalized.match(/^(?:移除|刪除)(?:第)?(\d+)(?:首)?$/);
  if (remove) return { command: "remove", value: Number.parseInt(remove[1], 10) };
  const volume = normalized.match(/^音量(\d{1,3})$/);
  if (volume) return { command: "volume", value: Number.parseInt(volume[1], 10) };
  return null;
}

function requestedStartIndex(rawUrl: string): number {
  try {
    const url = new URL(rawUrl);
    const value = url.searchParams.get("index") ?? url.searchParams.get("p");
    const parsed = value ? Number.parseInt(value, 10) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : 0;
  } catch {
    return 0;
  }
}

function entryUrl(entry: YtDlpEntry, fallback: string): string {
  const candidate = entry.webpage_url ?? entry.original_url ?? entry.url;
  if (!candidate) return fallback;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^[\w-]{11}$/.test(candidate)) return `https://www.youtube.com/watch?v=${candidate}`;
  return fallback;
}

function entryThumbnail(entry: YtDlpEntry, fallback?: YtDlpEntry): string | undefined {
  const thumbnails = entry.thumbnails?.filter((item): item is { url?: string } => !!item)
    ?? fallback?.thumbnails?.filter((item): item is { url?: string } => !!item)
    ?? [];
  const candidate = entry.thumbnail ?? thumbnails.at(-1)?.url ?? fallback?.thumbnail;
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : undefined;
}

export function cleanDiscordMusicTrackTitle(title: string, playlistTitle?: string): string {
  const normalized = title.trim();
  const part = normalized.match(/\s+p\d{1,3}\s+(.+)$/i)?.[1]?.trim();
  if (part) return part;
  if (playlistTitle && normalized.startsWith(playlistTitle)) {
    const remainder = normalized.slice(playlistTitle.length).replace(/^\s*[-–—:：|]\s*/, "").trim();
    if (remainder) return remainder;
  }
  return normalized;
}

export function cleanDiscordMusicPlaylistTitle(title: string): string {
  return title
    .trim()
    .replace(/^【(?:音[乐樂]集|歌曲集|合集)】\s*/i, "")
    .replace(/\s*【[^】]*(?:Hi-?Res|完整版|中日(?:歌[词詞]|字幕)|無損|无损)[^】]*】\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanBilibiliEpisodeTitle(title: string): string {
  return title.trim().replace(/^[“”"「『]+|[“”"」』]+$/g, "").trim();
}

export function parseBilibiliSeasonHtml(html: string, sourceUrl: string): DiscordMusicTrack[] {
  const marker = "window.__INITIAL_STATE__=";
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(";(function()", jsonStart);
  if (jsonEnd < 0) return [];
  let state: BilibiliInitialState;
  try {
    state = JSON.parse(html.slice(jsonStart, jsonEnd)) as BilibiliInitialState;
  } catch {
    return [];
  }
  const season = state.videoData?.ugc_season;
  const episodes = season?.sections?.flatMap((section) => section.episodes ?? [])
    .filter((episode): episode is BilibiliSeasonEpisode & { bvid: string } => !!episode.bvid)
    .slice(0, MAX_PLAYLIST_ITEMS) ?? [];
  if (episodes.length < 2) return [];
  const currentBvid = new URL(sourceUrl).pathname.match(/\/video\/(BV[\w]+)/i)?.[1]?.toLowerCase();
  const currentIndex = Math.max(0, episodes.findIndex((episode) => episode.bvid.toLowerCase() === currentBvid));
  const playlistTitle = cleanDiscordMusicPlaylistTitle(season?.title?.trim() || "Bilibili 合集");
  return episodes.slice(currentIndex).map((episode, offset) => ({
    id: episode.bvid,
    title: cleanBilibiliEpisodeTitle(episode.title || `第 ${currentIndex + offset + 1} 集`),
    url: `https://www.bilibili.com/video/${episode.bvid}/`,
    thumbnail: episode.arc?.pic?.replace(/^http:\/\//i, "https://") ?? season?.cover,
    playlistTitle,
    duration: episode.arc?.duration,
    index: currentIndex + offset + 1,
    total: episodes.length,
  }));
}

async function resolveBilibiliSeason(url: string): Promise<DiscordMusicTrack[]> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 CyreneDiscordBot/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];
  return parseBilibiliSeasonHtml(await response.text(), response.url);
}

export function normalizeYtDlpResult(result: YtDlpResult, sourceUrl: string): DiscordMusicTrack[] {
  const rawEntries = result.entries?.filter((entry): entry is YtDlpEntry => !!entry) ?? [result];
  const start = Math.min(requestedStartIndex(sourceUrl), Math.max(0, rawEntries.length - 1));
  const entries = rawEntries.slice(start, start + MAX_PLAYLIST_ITEMS);
  const total = entries.length;
  const rawPlaylistTitle = result.title?.trim();
  const playlistTitle = rawPlaylistTitle ? cleanDiscordMusicPlaylistTitle(rawPlaylistTitle) : undefined;
  return entries.map((entry, offset) => {
    const index = start + offset + 1;
    const fallbackTitle = rawEntries.length > 1 ? `第 ${index} 首` : playlistTitle ?? "音樂";
    const rawTitle = entry.title?.trim() || fallbackTitle;
    return {
      id: entry.id,
      title: cleanDiscordMusicTrackTitle(rawTitle, rawPlaylistTitle),
      url: entryUrl(entry, sourceUrl),
      thumbnail: entryThumbnail(entry, result),
      playlistTitle: rawEntries.length > 1 ? playlistTitle : undefined,
      duration: typeof entry.duration === "number" ? entry.duration : undefined,
      index,
      total: result.playlist_count ?? rawEntries.length,
    };
  });
}

export async function resolveDiscordMusicTracks(url: string): Promise<DiscordMusicTrack[]> {
  const sourceHost = new URL(url).hostname;
  const isBilibili = /(^|\.)bilibili\.com$|^b23\.tv$/i.test(sourceHost);
  if (isBilibili) {
    const season = await resolveBilibiliSeason(url).catch(() => []);
    if (season.length > 1) return season;
  }
  const binary = await ensureYtDlpBinary();
  const commonArgs = [
    "--dump-single-json",
    "--no-warnings",
    "--no-progress",
    "--playlist-end",
    String(MAX_PLAYLIST_ITEMS),
    "--skip-download",
    "--yes-playlist",
  ];
  let result = await runYtDlpJson(binary, [
    ...commonArgs,
    "--flat-playlist",
    url,
  ]);
  const entries = result.entries?.filter((entry): entry is YtDlpEntry => !!entry) ?? [];
  if (isBilibili && entries.length > 1 && entries.length <= 30 && entries.some((entry) => !entry.title)) {
    result = await runYtDlpJson(binary, [...commonArgs, url]);
  } else if (isBilibili && !entryThumbnail(entries[0] ?? result, result)) {
    const details = await runYtDlpJson(binary, [
      ...commonArgs,
      "--playlist-end",
      "1",
      url,
    ]);
    const detailedEntry = details.entries?.find((entry): entry is YtDlpEntry => !!entry) ?? details;
    const thumbnail = entryThumbnail(detailedEntry, details);
    if (entries.length > 1) result.thumbnail = thumbnail;
    else result = details;
  }
  return normalizeYtDlpResult(result, url);
}

function ytDlpAsset(): { asset: string; binary: string; archive: boolean } {
  if (process.platform === "darwin") return { asset: "yt-dlp_macos.zip", binary: "yt-dlp_macos", archive: true };
  if (process.platform === "win32") {
    const binary = process.arch === "arm64" ? "yt-dlp_arm64.exe" : "yt-dlp.exe";
    return { asset: binary, binary, archive: false };
  }
  if (process.platform === "linux") {
    const binary = process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
    return { asset: binary, binary, archive: false };
  }
  throw new Error(`目前不支援 ${process.platform}/${process.arch} 的音樂播放工具`);
}

function ytDlpCacheDirectory(): string {
  try {
    const electron = require("electron") as { app?: { getPath(name: "userData"): string } };
    const userData = electron.app?.getPath("userData");
    if (userData) return path.join(userData, "tools");
  } catch {
    // Unit tests and non-Electron utilities use a project-local cache.
  }
  return path.join(process.cwd(), ".cyrene-cache", "tools");
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`下載失敗（HTTP ${response.status}）`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadVerifiedYtDlp(asset: string): Promise<Buffer> {
  const [binary, checksums] = await Promise.all([
    fetchBuffer(`${YT_DLP_RELEASE_BASE}/${asset}`),
    fetchBuffer(`${YT_DLP_RELEASE_BASE}/SHA2-256SUMS`),
  ]);
  const checksumLine = checksums.toString("utf8").split(/\r?\n/)
    .find((line) => line.trim().endsWith(asset));
  const expected = checksumLine?.trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash("sha256").update(binary).digest("hex");
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || expected !== actual) {
    throw new Error("yt-dlp 官方檔案驗證失敗，已取消安裝");
  }
  return binary;
}

async function runTool(command: string, args: string[], timeout: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => process.kill("SIGKILL"), timeout);
    process.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    process.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    process.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} 結束代碼 ${code}`));
    });
  });
}

async function installYtDlp(cacheDirectory: string, definition: ReturnType<typeof ytDlpAsset>): Promise<string> {
  await fs.mkdir(cacheDirectory, { recursive: true });
  const contents = await downloadVerifiedYtDlp(definition.asset);
  if (!definition.archive) {
    const binaryPath = path.join(cacheDirectory, definition.binary);
    const temporary = `${binaryPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, contents, { mode: 0o755 });
    await fs.chmod(temporary, 0o755);
    await fs.rename(temporary, binaryPath);
    return binaryPath;
  }

  const targetDirectory = path.join(cacheDirectory, "yt-dlp_macos-unpacked");
  const temporaryDirectory = `${targetDirectory}.${process.pid}.tmp`;
  const archivePath = path.join(cacheDirectory, `.${definition.asset}.${process.pid}.tmp`);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
  await fs.writeFile(archivePath, contents);
  try {
    await fs.mkdir(temporaryDirectory, { recursive: true });
    await runTool("/usr/bin/ditto", ["-x", "-k", archivePath, temporaryDirectory], 120_000);
    const temporaryBinary = path.join(temporaryDirectory, definition.binary);
    await fs.chmod(temporaryBinary, 0o755);
    await fs.rm(targetDirectory, { recursive: true, force: true });
    await fs.rename(temporaryDirectory, targetDirectory);
    return path.join(targetDirectory, definition.binary);
  } finally {
    await fs.rm(archivePath, { force: true }).catch(() => undefined);
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function ensureYtDlpBinary(): Promise<string> {
  if (ytDlpBinaryPromise) return await ytDlpBinaryPromise;
  ytDlpBinaryPromise = (async () => {
    const definition = ytDlpAsset();
    const cacheDirectory = ytDlpCacheDirectory();
    const binaryPath = definition.archive
      ? path.join(cacheDirectory, "yt-dlp_macos-unpacked", definition.binary)
      : path.join(cacheDirectory, definition.binary);
    try {
      await fs.access(binaryPath, fsConstants.X_OK);
      return binaryPath;
    } catch {
      return await installYtDlp(cacheDirectory, definition);
    }
  })();
  try {
    return await ytDlpBinaryPromise;
  } catch (err) {
    ytDlpBinaryPromise = null;
    throw err;
  }
}

async function runYtDlpJson(binary: string, args: string[]): Promise<YtDlpResult> {
  return await new Promise<YtDlpResult>((resolve, reject) => {
    const process = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => process.kill("SIGKILL"), 45_000);
    process.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    process.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    process.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    process.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `yt-dlp 結束代碼 ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as YtDlpResult);
      } catch {
        reject(new Error("無法解析播放清單資料"));
      }
    });
  });
}

export async function spawnDiscordMusicStream(track: DiscordMusicTrack): Promise<DiscordMusicProcess> {
  const binary = await ensureYtDlpBinary();
  return spawn(binary, [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--format",
    "bestaudio/best",
    "--output",
    "-",
    track.url,
  ], { stdio: ["ignore", "pipe", "pipe"] });
}

export function formatMusicDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}
