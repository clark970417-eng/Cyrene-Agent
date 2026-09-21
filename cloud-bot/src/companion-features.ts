import * as fs from "node:fs";
import * as path from "node:path";
import { EmbedBuilder } from "discord.js";

export type CompanionStats = {
  firstMetTimestamp: number;
  messagesCount: number;
  musicTracksPlayed: number;
  checkinsCount: number;
  unlockedBadges: string[];
  emojiUsage: Record<string, number>;
  whispers: Array<{ content: string; createdAt: string }>;
};

const EMPTY = (): CompanionStats => ({
  firstMetTimestamp: Date.now(),
  messagesCount: 1,
  musicTracksPlayed: 0,
  checkinsCount: 0,
  unlockedBadges: ["🌸 初次相遇"],
  emojiUsage: {},
  whispers: [],
});

export class CompanionFeatureStore {
  constructor(private readonly filePath: string) {}

  load(): CompanionStats {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<CompanionStats>;
      return {
        ...EMPTY(),
        ...value,
        unlockedBadges: Array.isArray(value.unlockedBadges) ? value.unlockedBadges : ["🌸 初次相遇"],
        emojiUsage: value.emojiUsage && typeof value.emojiUsage === "object" ? value.emojiUsage : {},
        whispers: Array.isArray(value.whispers) ? value.whispers.slice(-200) : [],
      };
    } catch {
      return EMPTY();
    }
  }

  record(type: "message" | "music"): CompanionStats {
    const stats = this.load();
    if (type === "message") stats.messagesCount += 1;
    if (type === "music") stats.musicTracksPlayed += 1;
    this.unlock(stats);
    this.save(stats);
    return stats;
  }

  recordEmoji(emojiName: string): void {
    const stats = this.load();
    stats.emojiUsage[emojiName] = (stats.emojiUsage[emojiName] ?? 0) + 1;
    this.save(stats);
  }

  syncCheckins(total: number): void {
    const stats = this.load();
    stats.checkinsCount = Math.max(stats.checkinsCount, Math.max(0, Math.floor(total)));
    this.unlock(stats);
    this.save(stats);
  }

  whisper(content: string): void {
    const stats = this.load();
    stats.whispers.push({ content: content.trim().slice(0, 2_000), createdAt: new Date().toISOString() });
    stats.whispers = stats.whispers.slice(-200);
    this.save(stats);
  }

  private unlock(stats: CompanionStats): void {
    const badges = new Set(stats.unlockedBadges);
    badges.add("🌸 初次相遇");
    const days = Math.max(1, Math.floor((Date.now() - stats.firstMetTimestamp) / 86_400_000));
    if (days >= 7) badges.add("💖 相伴一週");
    if (days >= 30) badges.add("✨ 陪伴滿月");
    if (stats.messagesCount >= 50) badges.add("💬 健談夥伴");
    if (stats.messagesCount >= 200) badges.add("💌 知心好友");
    if (stats.musicTracksPlayed >= 10) badges.add("🎵 音樂隨行");
    if (stats.musicTracksPlayed >= 50) badges.add("🎧 駐場DJ");
    if (stats.checkinsCount >= 5) badges.add("☀️ 勤奮簽到");
    stats.unlockedBadges = [...badges];
  }

  private save(stats: CompanionStats): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(stats, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }
}

export function buildAchievementsEmbed(userName: string, stats: CompanionStats): EmbedBuilder {
  const days = Math.max(1, Math.floor((Date.now() - stats.firstMetTimestamp) / 86_400_000));
  return new EmbedBuilder()
    .setColor(0xd95fa8)
    .setAuthor({ name: "昔漣 · 夥伴相處成就展覽館 🏆" })
    .setTitle(`${userName} 與 昔漣 的陪伴點滴`)
    .setDescription([
      "「每一天有夥伴在身邊，都是值得珍藏的美好時光～♪」", "",
      `📅 **相伴時光**：第 **${days}** 天`,
      `💬 **對話點滴**：累計交流 **${stats.messagesCount}** 次`,
      `🎵 **音樂時光**：共度播放 **${stats.musicTracksPlayed}** 首歌曲`, "",
      "🏅 **已解鎖成就**", ...stats.unlockedBadges.map((badge) => `• ${badge}`),
    ].join("\n"))
    .setFooter({ text: "永遠陪伴在夥伴身邊 🌸" });
}

export function buildTarotEmbed(userName: string, random = Math.random): EmbedBuilder {
  const cards = [
    ["🌟 星辰 (The Star)", "光明、希望與靈感之牌。今天適合勇敢嘗試新事物，幸運隨之而來！"],
    ["☀️ 太陽 (The Sun)", "活力、成功與溫暖之牌。今天充滿正能量，任何煩惱都會煙消雲散～"],
    ["💖 戀人 (The Lovers)", "和諧、選擇與美好的連結。今天身邊充滿溫暖的善意與貼心陪伴。"],
    ["🌿 節制 (Temperance)", "平靜、平衡與內在充實。保持輕鬆放鬆的節奏，一切都會剛剛好。"],
  ] as const;
  const card = cards[Math.floor(random() * cards.length)] ?? cards[0];
  return new EmbedBuilder().setColor(0x9d6be8).setAuthor({ name: "昔漣 · 每日靈感塔羅 🔮" })
    .setTitle(`為 ${userName} 抽出的幸運塔羅牌`)
    .setDescription(`🃏 **${card[0]}**\n\n${card[1]}\n\n「無論牌面如何，昔漣都會一直陪伴在夥伴身邊為你加持喔～✨」`)
    .setFooter({ text: "昔漣塔羅靈感 · 祝你有美好的一天" });
}

export function buildChessEmbed(userName: string): EmbedBuilder {
  const board = ["```", "8 ♜ ♞ ♝ ♛ ♚ ♝ ♞ ♜", "7 ♟ ♟ ♟ ♟ . ♟ ♟ ♟", "6 . . . . . . . .", "5 . . . . ♟ . . .", "4 . . . . ♙ . . .", "3 . . . . . . . .", "2 ♙ ♙ ♙ ♙ . ♙ ♙ ♙", "1 ♖ ♘ ♗ ♕ ♔ ♗ ♘ ♖", "  a b c d e f g h", "```"].join("\n");
  return new EmbedBuilder().setColor(0x4b7bec).setAuthor({ name: "昔漣 · 西洋棋對弈對戰 ♟️" })
    .setTitle(`${userName} 🆚 昔漣`)
    .setDescription(`「昔漣已經應戰囉！看招～✨」\n\n**當前棋盤狀態**\n${board}\n\n📜 **走棋歷史**：\`1. e4 e5\`\n👉 **輪到你了**：請輸入下一步（如 \`e4\`、\`Nf3\` 或 \`d4\`）。`)
    .setFooter({ text: "昔漣棋藝靈感 · 智力與陪伴同在 ♟️" });
}
