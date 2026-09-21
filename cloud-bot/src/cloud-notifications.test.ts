import assert from "node:assert/strict";
import test from "node:test";
import { parseFxTwitterTimeline } from "./cloud-notifications.js";

test("parseFxTwitterTimeline sorts newest and preserves media", () => {
  const tweets = parseFxTwitterTimeline({ results: [
    { type: "status", id: "10", text: "old", author: { screen_name: "cyrene" }, media: { all: [] }, created_at: "2026-01-01" },
    { type: "status", id: "11", text: "new", author: { screen_name: "cyrene", name: "Cyrene" }, media: { all: [{ url: "https://image.test/a.png" }] }, created_at: "2026-01-02" },
  ] }, "cyrene");
  assert.equal(tweets[0]?.id, "11");
  assert.deepEqual(tweets[0]?.mediaUrls, ["https://image.test/a.png"]);
});
