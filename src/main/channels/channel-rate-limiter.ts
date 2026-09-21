import type { ChannelId } from "./types";

export interface ChannelRateLimits {
  rateLimitPerUser: number;
  rateLimitPerChannel: number;
}

export function createChannelRateLimiter(
  limits: ChannelRateLimits,
  now: () => number = Date.now,
  windowMs = 60_000,
): { tryConsume(channel: ChannelId, senderId: string): boolean } {
  const buckets = new Map<string, number[]>();

  const fresh = (key: string, time: number): number[] => {
    const active = (buckets.get(key) ?? []).filter((timestamp) => time - timestamp < windowMs);
    if (active.length > 0) buckets.set(key, active);
    else buckets.delete(key);
    return active;
  };

  return {
    tryConsume(channel, senderId) {
      const time = now();
      const userKey = `user:${channel}:${senderId}`;
      const channelKey = `channel:${channel}`;
      const user = fresh(userKey, time);
      const shared = fresh(channelKey, time);
      if (user.length >= limits.rateLimitPerUser || shared.length >= limits.rateLimitPerChannel) {
        return false;
      }
      buckets.set(userKey, [...user, time]);
      buckets.set(channelKey, [...shared, time]);
      return true;
    },
  };
}
