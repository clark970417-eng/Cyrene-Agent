import { describe, expect, it } from "vitest";
import { createChannelRateLimiter } from "./channel-rate-limiter";

describe("channel rate limiter", () => {
  it("enforces user and shared channel quotas", () => {
    const limiter = createChannelRateLimiter({ rateLimitPerUser: 2, rateLimitPerChannel: 3 }, () => 100);
    expect(limiter.tryConsume("discord", "a")).toBe(true);
    expect(limiter.tryConsume("discord", "a")).toBe(true);
    expect(limiter.tryConsume("discord", "a")).toBe(false);
    expect(limiter.tryConsume("discord", "b")).toBe(true);
    expect(limiter.tryConsume("discord", "c")).toBe(false);
  });

  it("does not spend a user's quota when the channel quota rejects the request", () => {
    let time = 0;
    const limiter = createChannelRateLimiter(
      { rateLimitPerUser: 1, rateLimitPerChannel: 1 },
      () => time,
      100,
    );
    expect(limiter.tryConsume("discord", "a")).toBe(true);
    expect(limiter.tryConsume("discord", "b")).toBe(false);
    time = 101;
    expect(limiter.tryConsume("discord", "b")).toBe(true);
  });
});
