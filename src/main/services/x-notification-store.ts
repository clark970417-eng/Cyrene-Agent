import * as path from "node:path";
import * as fs from "node:fs";
import { app } from "electron";

export interface TrackedXAccount {
  id: string;
  username: string; // e.g. "Wuthering_Waves"
  displayName?: string;
  category: "news" | "anime" | "game" | "leak" | "general";
  targetChannelId?: string; // Specific Discord Channel ID if assigned
  enabled: boolean;
  includeRetweets?: boolean; // default true
  lastTweetId?: string;
  lastPubDate?: string;
}

export interface XNotificationConfig {
  enabled: boolean;
  checkIntervalMinutes: number; // default 5
  includeRetweets?: boolean; // default true
  rssProxyUrl?: string; // optional custom RSSHub / Nitter base URL
  announcementCategoryName?: string; // Discord category to restrict posting to (e.g. "announcements")
  accounts: TrackedXAccount[];
}

const DEFAULT_CONFIG: XNotificationConfig = {
  enabled: true,
  checkIntervalMinutes: 5,
  includeRetweets: true,
  announcementCategoryName: "announcements",
  accounts: [
    {
      id: "wuwa-official",
      username: "Wuthering_Waves",
      displayName: "鳴潮 Wuthering Waves 官方",
      category: "game",
      enabled: true,
    },
    {
      id: "hsr-official",
      username: "HonkaiStarRail",
      displayName: "崩壞：星穹鐵道 官方",
      category: "game",
      enabled: true,
    },
    {
      id: "anime-news",
      username: "AnimeNewsNet",
      displayName: "Anime News Network",
      category: "anime",
      enabled: true,
    },
  ],
};

function getConfigPath(): string {
  const userDataPath = app ? app.getPath("userData") : path.join(process.env.HOME || "", ".config", "live2d-cyrene");
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, "x-notifications.json");
}

export function loadXNotificationConfig(): XNotificationConfig {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    saveXNotificationConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<XNotificationConfig>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
      checkIntervalMinutes: Math.max(1, typeof parsed.checkIntervalMinutes === "number" ? parsed.checkIntervalMinutes : 5),
      rssProxyUrl: typeof parsed.rssProxyUrl === "string" ? parsed.rssProxyUrl : undefined,
      announcementCategoryName: typeof parsed.announcementCategoryName === "string" ? parsed.announcementCategoryName : "announcements",
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : DEFAULT_CONFIG.accounts,
    };
  } catch (err) {
    console.error("[XNotificationStore] Failed to parse config, using defaults:", err);
    return DEFAULT_CONFIG;
  }
}

export function saveXNotificationConfig(config: XNotificationConfig): void {
  const filePath = getConfigPath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[XNotificationStore] Failed to save config:", err);
  }
}
