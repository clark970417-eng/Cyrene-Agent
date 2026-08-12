import { EmbedBuilder, TextChannel, Client } from "discord.js";
import { channelManager } from "../channels/manager";
import { DiscordAdapter } from "../channels/adapters/discord";
import {
  loadAniListNotificationConfig,
  saveAniListNotificationConfig,
  AniListNotificationConfig,
} from "./anilist-notification-store.js";

const LOG = "[AniListNotification]";

interface AniListNotification {
  id: number;
  type: string;
  episode?: number;
  contexts?: string[];
  createdAt: number;
  media?: {
    id: number;
    title: {
      userPreferred?: string;
      english?: string;
      native?: string;
      romaji?: string;
    };
    coverImage?: { large?: string; extraLarge?: string };
    siteUrl?: string;
    bannerImage?: string;
    genres?: string[];
    episodes?: number;
  };
}

export class AniListNotificationService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isChecking = false;

  start(): void {
    this.stop();
    const config = loadAniListNotificationConfig();
    if (!config.enabled) {
      console.log(LOG, "AniList notification service is disabled.");
      return;
    }

    const intervalMs = Math.max(1, config.checkIntervalMinutes || 10) * 60 * 1000;
    console.log(LOG, `AniList notification service started (interval: ${config.checkIntervalMinutes} min).`);

    // Initial check after 15s
    setTimeout(() => void this.checkNotifications(), 15_000);
    this.timer = setInterval(() => void this.checkNotifications(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Main check — mirrors AniList's built-in notification bell */
  async checkNotifications(): Promise<{ checked: number; newNotified: number }> {
    if (this.isChecking) return { checked: 0, newNotified: 0 };
    this.isChecking = true;

    const config = loadAniListNotificationConfig();
    if (!config.enabled || !config.accessToken) {
      this.isChecking = false;
      return { checked: 0, newNotified: 0 };
    }

    let newNotifiedCount = 0;
    let checkedCount = 0;

    try {
      const notifications = await this.fetchAniListNotifications(config.accessToken);
      checkedCount = notifications.length;

      const notifiedSet = new Set<number>(config.notifiedScheduleIds || []);

      for (const notif of notifications) {
        if (notifiedSet.has(notif.id)) continue;
        if (!notif.media) { notifiedSet.add(notif.id); continue; }

        // Only handle airing type notifications
        if (notif.type !== "AIRING") {
          notifiedSet.add(notif.id);
          continue;
        }

        // Freshness check — skip notifications older than 48h to avoid spamming old ones on first run
        const ageMs = Date.now() - notif.createdAt * 1000;
        if (ageMs > 48 * 3600 * 1000) {
          console.log(LOG, `Skipping stale AniList notification for "${notif.media.title?.userPreferred}" (${Math.round(ageMs / 3600000)}h old)`);
          notifiedSet.add(notif.id);
          continue;
        }

        console.log(
          LOG,
          `New AniList notification [${notif.type}]: ${notif.media.title.userPreferred} EP ${notif.episode}`
        );

        const posted = await this.broadcastNotificationToDiscord(notif, config.targetCategory);
        if (posted) {
          newNotifiedCount++;
        }
        notifiedSet.add(notif.id);
      }

      // Keep latest 200 IDs
      config.notifiedScheduleIds = Array.from(notifiedSet).slice(-200);
      config.lastAiredTimestamp = Math.floor(Date.now() / 1000);
      saveAniListNotificationConfig(config);
    } catch (err) {
      console.warn(LOG, "Error checking AniList notifications:", err);
    } finally {
      this.isChecking = false;
    }

    return { checked: checkedCount, newNotified: newNotifiedCount };
  }

  /** Fetch AniList built-in notifications from the Notifications API */
  async fetchAniListNotifications(token: string): Promise<AniListNotification[]> {
    const query = `
      query {
        Page(perPage: 25) {
          notifications(resetNotificationCount: false) {
            ... on AiringNotification {
              id
              type
              episode
              contexts
              createdAt
              media {
                id
                title { userPreferred english native romaji }
                coverImage { large extraLarge }
                bannerImage
                siteUrl
                genres
                episodes
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token.trim()}`,
          "User-Agent": "CyreneBot/1.0",
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        const list = json?.data?.Page?.notifications;
        if (Array.isArray(list)) {
          // Filter to only include actual airing notifications (not null from other types)
          return list.filter((n: any) => n && n.id && n.type === "AIRING") as AniListNotification[];
        }
      } else {
        console.warn(LOG, `AniList API error: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn(LOG, "Failed to fetch AniList notifications:", err);
    }

    return [];
  }

  /** Verify user account with token */
  async verifyUserAccount(
    username?: string,
    token?: string
  ): Promise<{ ok: boolean; name?: string; avatarUrl?: string; count?: number; error?: string }> {
    const query = token
      ? `{ Viewer { name avatar { large } statistics { anime { count } } } }`
      : `query ($name: String) { User(name: $name) { name avatar { large } statistics { anime { count } } } }`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "CyreneBot/1.0",
    };
    if (token) headers["Authorization"] = `Bearer ${token.trim()}`;

    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables: !token && username ? { name: username.trim() } : {} }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        const user = token ? json?.data?.Viewer : json?.data?.User;
        if (user?.name) {
          return { ok: true, name: user.name, avatarUrl: user.avatar?.large, count: user.statistics?.anime?.count };
        }
      }
      return { ok: false, error: "帳號不存在或 Access Token 無效" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Broadcast a single AniList notification to Discord */
  async broadcastNotificationToDiscord(
    notif: AniListNotification,
    category: "anime" | "news" | "general" = "anime"
  ): Promise<boolean> {
    const discordAdapter = channelManager.getAdapter("discord") as DiscordAdapter | undefined;
    if (!discordAdapter) return false;
    const status = discordAdapter.getStatus();
    if (!status.enabled) return false;

    const client = (discordAdapter as any).client as Client | null;
    if (!client || !client.isReady()) return false;

    const media = notif.media!;
    const title =
      media.title.userPreferred ||
      media.title.english ||
      media.title.native ||
      media.title.romaji ||
      "Anime";
    const animeUrl = media.siteUrl || `https://anilist.co/anime/${media.id}`;
    const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large;
    const genresText = Array.isArray(media.genres) && media.genres.length ? media.genres.join(" • ") : "動畫";
    const totalEpText = media.episodes ? ` / 全 ${media.episodes} 集` : "";

    // Build the message text same style as AniList bell notification
    // e.g. "Episode 5 of Mushoku Tensei aired."
    const contextArr = notif.contexts || ["Episode ", ` of `, " aired."];
    const notifText =
      contextArr.length >= 3
        ? `${contextArr[0]}**${notif.episode}**${contextArr[1]}**${title}**${contextArr[2]}`
        : `第 **${notif.episode}** 集已播出！`;

    const embed = new EmbedBuilder()
      .setColor(0x3db4f2) // AniList Blue
      .setAuthor({
        name: "AniList • 新番通知",
        iconURL: "https://anilist.co/img/icons/android-chrome-512x512.png",
        url: animeUrl,
      })
      .setTitle(`📺 ${title}`)
      .setURL(animeUrl)
      .setDescription(`${notifText}\n\n📌 **標籤**：${genresText}${totalEpText ? `\n📋 **集數**：第 ${notif.episode} 集${totalEpText}` : ""}`)
      .setTimestamp(new Date(notif.createdAt * 1000))
      .setFooter({ text: "AniList Notification • 昔漣" });

    if (coverUrl) embed.setThumbnail(coverUrl);
    if (media.bannerImage) embed.setImage(media.bannerImage);

    // Find anime channel — prefer ANNOUNCEMENTS category
    let targetChannel: TextChannel | null = null;
    for (const guild of client.guilds.cache.values()) {
      const annCat = guild.channels.cache.find(
        (c) => c.type === 4 && c.name.toLowerCase().includes("announcements")
      );
      const ch = annCat
        ? guild.channels.cache.find(
            (c) =>
              c.isTextBased() &&
              (c as any).parentId === annCat.id &&
              (c.name.toLowerCase().includes("anime") || c.name.toLowerCase().includes(category))
          )
        : guild.channels.cache.find(
            (c) => c.isTextBased() && (c.name.toLowerCase().includes("anime") || c.name.toLowerCase().includes(category))
          );

      if (ch && ch.isTextBased()) {
        targetChannel = ch as TextChannel;
        break;
      }
    }

    if (!targetChannel) {
      const guild = client.guilds.cache.first();
      if (guild) targetChannel = (guild.systemChannel as TextChannel) || null;
    }

    if (!targetChannel) return false;

    try {
      await targetChannel.send({ embeds: [embed] });
      console.log(LOG, `Broadcasted: "${title}" EP ${notif.episode} → #${targetChannel.name}`);
      return true;
    } catch (err) {
      console.warn(LOG, "Failed to send AniList embed to Discord:", err);
      return false;
    }
  }
}

export const aniListNotificationService = new AniListNotificationService();
