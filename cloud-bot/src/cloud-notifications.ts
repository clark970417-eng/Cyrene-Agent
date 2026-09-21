import * as fs from "node:fs";
import * as path from "node:path";
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type GuildBasedChannel,
  type TextChannel,
} from "discord.js";

export type XAccount = {
  id: string;
  username: string;
  displayName?: string;
  category: "news" | "anime" | "game" | "leak" | "general";
  targetChannelId?: string;
  enabled: boolean;
  includeRetweets?: boolean;
  lastTweetId?: string;
  lastPubDate?: string;
};

export type XConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  includeRetweets?: boolean;
  announcementCategoryName?: string;
  accounts: XAccount[];
};

export type Tweet = {
  id: string;
  url: string;
  text: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  mediaUrls: string[];
  pubDate: string;
  isRetweet?: boolean;
  retweetedBy?: string;
};

type AniListConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  username?: string;
  filterMode: "watchlist_only" | "all_airing";
  lastAiredTimestamp?: number;
  notifiedScheduleIds?: number[];
  targetCategory: "anime" | "news" | "general";
};

type AiringSchedule = {
  id: number;
  episode: number;
  airingAt: number;
  media: {
    id: number;
    title: { userPreferred?: string; english?: string; native?: string; romaji?: string };
    coverImage?: { large?: string; extraLarge?: string };
    bannerImage?: string;
    siteUrl?: string;
    genres?: string[];
    episodes?: number;
  };
};

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, file);
}

export function parseFxTwitterTimeline(data: unknown, requestedUsername: string): Tweet[] {
  const results = Array.isArray((data as { results?: unknown[] })?.results) ? (data as { results: unknown[] }).results : [];
  const tweets: Tweet[] = [];
  for (const raw of results) {
    const status = raw as Record<string, any>;
    if (status?.type !== "status" || !status.id) continue;
    const author = status.author && typeof status.author === "object" ? status.author : {};
    const repostedBy = status.reposted_by && typeof status.reposted_by === "object" ? status.reposted_by : null;
    const media = Array.isArray(status.media?.all) ? status.media.all : Array.isArray(status.media?.photos) ? status.media.photos : [];
    const username = typeof author.screen_name === "string" && author.screen_name ? author.screen_name : requestedUsername;
    tweets.push({
      id: String(status.id),
      url: typeof status.url === "string" && status.url ? status.url : `https://x.com/${username}/status/${status.id}`,
      text: typeof status.text === "string" && status.text ? status.text : "New post on X",
      authorName: typeof author.name === "string" && author.name ? author.name : username,
      authorUsername: username,
      authorAvatar: typeof author.avatar_url === "string" ? author.avatar_url : undefined,
      mediaUrls: [...new Set<string>(media.map((item: any) => item?.type === "video" ? item?.thumbnail_url : (item?.url || item?.thumbnail_url)).filter(Boolean))],
      pubDate: typeof status.created_at === "string" ? status.created_at : new Date(Number(status.created_timestamp ?? Date.now() / 1000) * 1000).toISOString(),
      isRetweet: Boolean(repostedBy),
      retweetedBy: typeof repostedBy?.screen_name === "string" ? repostedBy.screen_name : undefined,
    });
  }
  return tweets.sort((a, b) => {
    try { return BigInt(a.id) === BigInt(b.id) ? 0 : BigInt(a.id) > BigInt(b.id) ? -1 : 1; }
    catch { return b.id.localeCompare(a.id); }
  });
}

function normalizeChannelName(name: string): string {
  return name.replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "").replace(/[|\-_.,!?]/g, " ").toLowerCase().trim();
}

function canSend(client: Client, channel: GuildBasedChannel): boolean {
  if (!channel.isTextBased() || channel.isDMBased() || (typeof channel.isSendable === "function" && !channel.isSendable())) return false;
  const member = channel.guild.members.me;
  const permissions = member ? channel.permissionsFor(member) : client.user ? channel.permissionsFor(client.user) : null;
  return Boolean(permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]));
}

async function findChannel(client: Client, category: string, targetId?: string, announcementCategory = "announcements"): Promise<TextChannel | null> {
  if (targetId) {
    const channel = await client.channels.fetch(targetId).catch(() => null);
    if (channel && !channel.isDMBased() && canSend(client, channel as GuildBasedChannel)) return channel as TextChannel;
  }
  for (const guild of client.guilds.cache.values()) {
    const parent = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && normalizeChannelName(channel.name).includes(announcementCategory.toLowerCase()));
    const candidates = [...guild.channels.cache.values()].filter((channel) => canSend(client, channel));
    const preferred = candidates.find((channel) => channel.parentId === parent?.id && normalizeChannelName(channel.name).includes(category));
    const fallback = candidates.find((channel) => normalizeChannelName(channel.name).includes(category));
    if (preferred || fallback) return (preferred ?? fallback) as TextChannel;
  }
  return null;
}

async function recentMessagesContain(channel: TextChannel, marker: string): Promise<boolean> {
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  return Boolean(messages?.some((message) => message.content.includes(marker) || message.embeds.some((embed) => embed.url === marker || embed.description?.includes(marker))));
}

export class CloudNotificationService {
  private timers: NodeJS.Timeout[] = [];
  private checkingX = false;
  private checkingAniList = false;
  private readonly xFile: string;
  private readonly aniListFile: string;

  constructor(private readonly client: Client, dataDir: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.xFile = path.join(dataDir, "x-notifications.json");
    this.aniListFile = path.join(dataDir, "anilist-notifications.json");
  }

  start(): void {
    this.stop();
    const x = readJson<XConfig>(this.xFile);
    if (x?.enabled) {
      const timer = setInterval(() => void this.checkX(), Math.max(1, x.checkIntervalMinutes) * 60_000);
      timer.unref(); this.timers.push(timer);
      setTimeout(() => void this.checkX(), 10_000).unref();
    }
    const ani = readJson<AniListConfig>(this.aniListFile);
    if (ani?.enabled && ani.username) {
      const timer = setInterval(() => void this.checkAniList(), Math.max(1, ani.checkIntervalMinutes) * 60_000);
      timer.unref(); this.timers.push(timer);
      setTimeout(() => void this.checkAniList(), 15_000).unref();
    }
  }

  stop(): void { for (const timer of this.timers) clearInterval(timer); this.timers = []; }

  async checkX(): Promise<void> {
    if (this.checkingX) return;
    this.checkingX = true;
    try {
      const config = readJson<XConfig>(this.xFile);
      if (!config?.enabled) return;
      for (const account of config.accounts) {
        if (!account.enabled || !account.username) continue;
        try {
          const response = await this.fetchImpl(`https://api.fxtwitter.com/2/profile/${encodeURIComponent(account.username.replace(/^@/, ""))}/statuses`, {
            headers: { accept: "application/json", "user-agent": "Cyrene-Agent/1.0" }, signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) throw new Error(`FxTwitter HTTP ${response.status}`);
          const all = parseFxTwitterTimeline(await response.json(), account.username);
          const tweets = (account.includeRetweets ?? config.includeRetweets ?? true) ? all : all.filter((tweet) => !tweet.isRetweet);
          const latest = tweets[0];
          if (!latest || latest.id === account.lastTweetId) continue;
          const age = Date.now() - new Date(latest.pubDate).getTime();
          if (age <= 48 * 3_600_000) {
            const channel = await findChannel(this.client, account.category, account.targetChannelId, config.announcementCategoryName);
            if (channel && !await recentMessagesContain(channel, latest.url)) {
              const title = latest.isRetweet ? `🔁 @${latest.retweetedBy ?? account.username} 轉發了 ${latest.authorName}` : `${account.displayName ?? latest.authorName} (@${latest.authorUsername})`;
              const embed = new EmbedBuilder().setColor(latest.isRetweet ? 0x17bf63 : 0x1da1f2).setAuthor({ name: title, url: latest.url, iconURL: latest.authorAvatar }).setDescription(latest.text.slice(0, 4_000)).setURL(latest.url).setTimestamp(new Date(latest.pubDate)).setFooter({ text: "X Notification • 昔漣" });
              if (latest.mediaUrls[0]) embed.setImage(latest.mediaUrls[0]);
              await channel.send({ content: `📢 **@${latest.authorUsername}** 發布了新的 X 動態：\n${latest.url}`, embeds: [embed] });
            }
          }
          account.lastTweetId = latest.id;
          account.lastPubDate = latest.pubDate;
          writeJson(this.xFile, config);
        } catch (error) { console.warn(`[X Notification] @${account.username} 檢查失敗`, error); }
      }
    } finally { this.checkingX = false; }
  }

  async checkAniList(): Promise<void> {
    if (this.checkingAniList) return;
    this.checkingAniList = true;
    try {
      const config = readJson<AniListConfig>(this.aniListFile);
      if (!config?.enabled || !config.username) return;
      const now = Math.floor(Date.now() / 1_000);
      const from = Math.max(config.lastAiredTimestamp ?? now, now - 48 * 3_600);
      const mediaIds = config.filterMode === "watchlist_only" ? await this.fetchWatchlistIds(config.username) : [];
      const schedules = await this.fetchAiringSchedules(from, now, mediaIds);
      const notified = new Set(config.notifiedScheduleIds ?? []);
      for (const schedule of schedules) {
        if (notified.has(schedule.id)) continue;
        const posted = await this.postAniList(schedule, config.targetCategory);
        if (posted) notified.add(schedule.id);
      }
      config.notifiedScheduleIds = [...notified].slice(-200);
      config.lastAiredTimestamp = now;
      writeJson(this.aniListFile, config);
    } catch (error) { console.warn("[AniList Notification] 檢查失敗", error); }
    finally { this.checkingAniList = false; }
  }

  private async graphQl(query: string, variables: Record<string, unknown>): Promise<any> {
    const response = await this.fetchImpl("https://graphql.anilist.co", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "CyreneBot/1.0" },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json() as { data?: any; errors?: Array<{ message?: string }> };
    if (!response.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `AniList HTTP ${response.status}`);
    return body.data;
  }

  private async fetchWatchlistIds(username: string): Promise<number[]> {
    const data = await this.graphQl(`query($name:String!){MediaListCollection(userName:$name,type:ANIME,status_in:[CURRENT,REPEATING]){lists{entries{mediaId}}}}`, { name: username });
    return (data?.MediaListCollection?.lists ?? []).flatMap((list: any) => list.entries ?? []).map((entry: any) => entry.mediaId).filter(Number.isInteger);
  }

  private async fetchAiringSchedules(from: number, now: number, mediaIds: number[]): Promise<AiringSchedule[]> {
    const mediaFilter = mediaIds.length ? ",mediaId_in:$ids" : "";
    const query = `query($from:Int!,$to:Int!,$ids:[Int]){Page(page:1,perPage:50){airingSchedules(airingAt_greater:$from,airingAt_lesser:$to${mediaFilter},sort:TIME){id episode airingAt media{id title{userPreferred english native romaji}coverImage{large extraLarge}bannerImage siteUrl genres episodes}}}}`;
    const data = await this.graphQl(query, { from, to: now + 1, ...(mediaIds.length ? { ids: mediaIds } : {}) });
    return Array.isArray(data?.Page?.airingSchedules) ? data.Page.airingSchedules : [];
  }

  private async postAniList(schedule: AiringSchedule, category: string): Promise<boolean> {
    const channel = await findChannel(this.client, category);
    if (!channel) return false;
    const media = schedule.media;
    const title = media.title.userPreferred ?? media.title.english ?? media.title.native ?? media.title.romaji ?? "Anime";
    const url = media.siteUrl ?? `https://anilist.co/anime/${media.id}`;
    const marker = `${url}#episode-${schedule.episode}`;
    if (await recentMessagesContain(channel, marker)) return true;
    const total = media.episodes ? ` / 全 ${media.episodes} 集` : "";
    const embed = new EmbedBuilder().setColor(0x3db4f2).setAuthor({ name: "AniList • 新番通知", iconURL: "https://anilist.co/img/icons/android-chrome-512x512.png", url })
      .setTitle(`📺 ${title}`).setURL(url).setDescription(`第 **${schedule.episode}** 集已播出！\n\n📌 **標籤**：${media.genres?.join(" • ") || "動畫"}\n📋 **集數**：第 ${schedule.episode} 集${total}\n[查看本集](${marker})`)
      .setTimestamp(new Date(schedule.airingAt * 1_000)).setFooter({ text: "AniList Notification • 昔漣" });
    if (media.coverImage?.extraLarge ?? media.coverImage?.large) embed.setThumbnail(media.coverImage?.extraLarge ?? media.coverImage?.large ?? null);
    if (media.bannerImage) embed.setImage(media.bannerImage);
    await channel.send({ embeds: [embed] });
    return true;
  }
}
