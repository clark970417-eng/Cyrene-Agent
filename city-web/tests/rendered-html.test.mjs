import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build contains the living city experience", async () => {
  const [page, experience, layout, clientAssets] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CityExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readdir(new URL("../dist/client/assets/", import.meta.url)),
  ]);
  assert.match(page, /title: "永晝花庭"/);
  assert.match(page, /你離開時，時間仍在這裡流動/);
  assert.match(experience, /城市脈搏/);
  assert.match(experience, /整理花徑/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(`${page}${experience}${layout}`, /codex-preview|react-loading-skeleton|Starter Project/i);
  assert.ok(clientAssets.some((name) => name.startsWith("CityExperience-") && name.endsWith(".js")));
  await access(new URL("../dist/client/og.png", import.meta.url));
});

test("ships durable cloud state instead of browser-only persistence", async () => {
  const [hosting, route, migration, packageJson] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/city/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_free_namor.sql", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(route, /last_simulated_at/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS city_state/);
  assert.doesNotMatch(route, /localStorage|sessionStorage/);
  assert.match(migration, /CREATE TABLE `city_state`/);
  assert.match(packageJson, /"name": "eternal-day-garden"/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
