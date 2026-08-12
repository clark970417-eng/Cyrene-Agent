import * as path from "node:path";
import * as fs from "node:fs";
import { app } from "electron";
import { protectSecrets, revealSecrets } from "../security/secret-vault";

export interface AniListNotificationConfig {
  enabled: boolean;
  checkIntervalMinutes: number; // default 10
  username?: string; // AniList username (e.g. "clark")
  accessToken?: string; // Optional AniList Personal Token / OAuth Access Token
  filterMode: "watchlist_only" | "all_airing"; // default "watchlist_only"
  lastAiredTimestamp?: number; // unix timestamp in seconds
  notifiedScheduleIds?: number[];
  targetCategory: "anime" | "news" | "general";
}

const DEFAULT_CONFIG: AniListNotificationConfig = {
  enabled: true,
  checkIntervalMinutes: 10,
  filterMode: "watchlist_only",
  targetCategory: "anime",
  notifiedScheduleIds: [],
};

function getConfigPath(): string {
  const userDataPath = app ? app.getPath("userData") : path.join(process.env.HOME || "", ".config", "live2d-cyrene");
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, "anilist-notifications.json");
}

export function loadAniListNotificationConfig(): AniListNotificationConfig {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = revealSecrets(JSON.parse(raw));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveAniListNotificationConfig(config: AniListNotificationConfig): void {
  const filePath = getConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(protectSecrets(config), null, 2), "utf-8");
  } catch (err) {
    console.warn("[AniListStore] Failed to save config:", err);
  }
}
