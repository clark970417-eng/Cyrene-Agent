import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { DiscordMusicTrack } from "./music-source";

const MAX_FAVORITE_ITEMS = 500;

export interface DiscordMusicFavoriteEntry {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  playlistTitle?: string;
  duration?: number;
  savedAt: string;
}

let favoritesWriteQueue: Promise<void> = Promise.resolve();

export function getDiscordMusicFavoritesPath(): string {
  return path.join(app.getPath("userData"), "discord", "music-favorites.json");
}

async function readFavorites(filePath: string): Promise<DiscordMusicFavoriteEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DiscordMusicFavoriteEntry => {
      const item = entry as Partial<DiscordMusicFavoriteEntry>;
      return typeof item.id === "string" && typeof item.title === "string"
        && typeof item.url === "string" && typeof item.savedAt === "string";
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[DiscordMusicFavorites] 讀取失敗:", error);
    }
    return [];
  }
}

export async function loadDiscordMusicFavorites(
  limit = 100,
  filePath = getDiscordMusicFavoritesPath(),
): Promise<DiscordMusicFavoriteEntry[]> {
  const favorites = await readFavorites(filePath);
  return favorites.slice(-Math.max(1, limit)).reverse();
}

export async function saveDiscordMusicFavorite(
  track: DiscordMusicTrack,
  filePath = getDiscordMusicFavoritesPath(),
): Promise<{ added: boolean; entry: DiscordMusicFavoriteEntry }> {
  let result!: { added: boolean; entry: DiscordMusicFavoriteEntry };
  const operation = favoritesWriteQueue.catch(() => undefined).then(async () => {
    const favorites = await readFavorites(filePath);
    const existing = favorites.find((entry) => entry.url === track.url);
    if (existing) {
      result = { added: false, entry: existing };
      return;
    }
    const entry: DiscordMusicFavoriteEntry = {
      id: randomUUID(),
      title: track.title,
      url: track.url,
      thumbnail: track.thumbnail,
      playlistTitle: track.playlistTitle,
      duration: track.duration,
      savedAt: new Date().toISOString(),
    };
    favorites.push(entry);
    const bounded = favorites.slice(-MAX_FAVORITE_ITEMS);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(bounded, null, 2), "utf8");
    await fs.rename(temporary, filePath);
    result = { added: true, entry };
  });
  favoritesWriteQueue = operation.catch((error) => {
    console.error("[DiscordMusicFavorites] 寫入失敗:", error);
  });
  await operation;
  return result;
}
