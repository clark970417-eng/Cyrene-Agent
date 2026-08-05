import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

export interface DiscordAchievementStats {
  firstMetTimestamp: number;
  messagesCount: number;
  musicTracksPlayed: number;
  checkinsCount: number;
  unlockedBadges: string[];
}

const DEFAULT_STATS: DiscordAchievementStats = {
  firstMetTimestamp: Date.now(),
  messagesCount: 1,
  musicTracksPlayed: 0,
  checkinsCount: 0,
  unlockedBadges: ["🌸 初次相遇"],
};

export function getAchievementsFilePath(): string {
  return path.join(app.getPath("userData"), "discord", "achievements.json");
}

export function loadAchievementStats(filePath = getAchievementsFilePath()): DiscordAchievementStats {
  try {
    if (!fs.existsSync(filePath)) return { ...DEFAULT_STATS, firstMetTimestamp: Date.now() };
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as Partial<DiscordAchievementStats>;
    return {
      firstMetTimestamp: typeof data.firstMetTimestamp === "number" ? data.firstMetTimestamp : Date.now(),
      messagesCount: typeof data.messagesCount === "number" ? data.messagesCount : 1,
      musicTracksPlayed: typeof data.musicTracksPlayed === "number" ? data.musicTracksPlayed : 0,
      checkinsCount: typeof data.checkinsCount === "number" ? data.checkinsCount : 0,
      unlockedBadges: Array.isArray(data.unlockedBadges) ? data.unlockedBadges : ["🌸 初次相遇"],
    };
  } catch {
    return { ...DEFAULT_STATS, firstMetTimestamp: Date.now() };
  }
}

export function saveAchievementStats(stats: DiscordAchievementStats, filePath = getAchievementsFilePath()): void {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), "utf8");
  } catch (err) {
    console.warn("[DiscordAchievements] 寫入統計失敗:", err);
  }
}

export function recordAchievementEvent(
  type: "message" | "music" | "checkin",
  filePath = getAchievementsFilePath(),
): DiscordAchievementStats {
  const stats = loadAchievementStats(filePath);
  if (type === "message") stats.messagesCount += 1;
  if (type === "music") stats.musicTracksPlayed += 1;
  if (type === "checkin") stats.checkinsCount += 1;

  // 檢查解鎖成就
  const badges = new Set(stats.unlockedBadges);
  badges.add("🌸 初次相遇");

  const daysTogether = Math.max(1, Math.floor((Date.now() - stats.firstMetTimestamp) / 86_400_000));
  if (daysTogether >= 7) badges.add("💖 相伴一週");
  if (daysTogether >= 30) badges.add("✨ 陪伴滿月");
  if (stats.messagesCount >= 50) badges.add("💬 健談夥伴");
  if (stats.messagesCount >= 200) badges.add("💌 知心好友");
  if (stats.musicTracksPlayed >= 10) badges.add("🎵 音樂隨行");
  if (stats.musicTracksPlayed >= 50) badges.add("🎧 駐場DJ");
  if (stats.checkinsCount >= 5) badges.add("☀️ 勤奮簽到");

  stats.unlockedBadges = [...badges];
  saveAchievementStats(stats, filePath);
  return stats;
}
