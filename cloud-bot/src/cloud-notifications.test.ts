import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateLegacyNotificationFiles, parseFxTwitterTimeline } from "./cloud-notifications.js";

test("parseFxTwitterTimeline sorts newest and preserves media", () => {
  const tweets = parseFxTwitterTimeline({ results: [
    { type: "status", id: "10", text: "old", author: { screen_name: "cyrene" }, media: { all: [] }, created_at: "2026-01-01" },
    { type: "status", id: "11", text: "new", author: { screen_name: "cyrene", name: "Cyrene" }, media: { all: [{ url: "https://image.test/a.png" }] }, created_at: "2026-01-02" },
  ] }, "cyrene");
  assert.equal(tweets[0]?.id, "11");
  assert.deepEqual(tweets[0]?.mediaUrls, ["https://image.test/a.png"]);
});

test("migrateLegacyNotificationFiles moves only missing notification settings", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-cloud-notifications-"));
  const dataDir = path.join(root, "live");
  const legacyDir = path.join(root, "legacy");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, "x-notifications.json"), JSON.stringify({ enabled: true }));
  assert.deepEqual(migrateLegacyNotificationFiles(dataDir, legacyDir), ["x-notifications.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "x-notifications.json"), "utf8")), { enabled: true });
  assert.deepEqual(migrateLegacyNotificationFiles(dataDir, legacyDir), []);
  fs.rmSync(root, { recursive: true, force: true });
});
