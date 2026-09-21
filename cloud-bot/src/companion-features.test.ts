import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CompanionFeatureStore, buildTarotEmbed } from "./companion-features.js";

test("companion feature state persists whispers and counters", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cyrene-features-")), "features.json");
  const store = new CompanionFeatureStore(file);
  store.record("message");
  store.recordEmoji("cyrene_hello");
  store.syncCheckins(3);
  store.whisper("只告訴昔漣");
  const loaded = store.load();
  assert.equal(loaded.messagesCount, 2);
  assert.equal(loaded.emojiUsage.cyrene_hello, 1);
  assert.equal(loaded.checkinsCount, 3);
  assert.equal(loaded.whispers[0]?.content, "只告訴昔漣");
  assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")));
});

test("tarot embed is deterministic with injected random", () => {
  assert.match(buildTarotEmbed("Y", () => 0).toJSON().title ?? "", /Y/);
});
