import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import {
  HsrCloudDailyService,
  isHsrDailyCommand,
  millisecondsUntilNextScheduledCheck,
  validateHsrDailyConfig,
  zonedDateParts,
} from "./hsr-daily.js";

const config = {
  enabled: true,
  uid: "800000001",
  cookie: "ltoken_v2=test-token; ltuid_v2=100000001;",
  hour: 8,
  timeZone: "Asia/Taipei",
};

test("辨識 !daily 並正確計算台北日期與排程時間", () => {
  assert.equal(isHsrDailyCommand("!daily"), true);
  assert.equal(isHsrDailyCommand("!每日簽到"), true);
  assert.equal(isHsrDailyCommand("/daily"), false);
  assert.deepEqual(zonedDateParts(Date.parse("2026-08-28T00:00:00Z"), "Asia/Taipei"), { date: "2026-08-28", hour: 8 });
  assert.equal(validateHsrDailyConfig(config), null);
});

test("每六小時檢查會對齊台北時間 08:00", () => {
  assert.equal(
    millisecondsUntilNextScheduledCheck(Date.parse("2026-08-28T23:04:25+08:00"), "Asia/Taipei", 8),
    2 * 60 * 60 * 1_000 + 55 * 60 * 1_000 + 35 * 1_000,
  );
  assert.equal(
    millisecondsUntilNextScheduledCheck(Date.parse("2026-08-29T07:30:00+08:00"), "Asia/Taipei", 8),
    30 * 60 * 1_000,
  );
});

test("雲端成功簽到後同日不會重複請求", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-hsr-cloud-"));
  let claims = 0;
  const service = new HsrCloudDailyService(config, path.join(dir, "state.json"), () => ({
    info: async () => ({ total_sign_day: 6, is_sign: false }),
    rewards: async () => ({ awards: Array.from({ length: 31 }, (_, index) => ({ name: `獎勵 ${index + 1}`, cnt: 1 })) }),
    claim: async () => { claims += 1; return { code: 0, info: { total_sign_day: 7 } }; },
  }));
  try {
    const now = Date.parse("2026-08-28T08:15:00+08:00");
    const first = await service.run({ now });
    const repeated = await service.run({ now: now + 60_000 });
    assert.equal(first.status, "success");
    assert.match(first.message, /獎勵 7/);
    assert.equal(repeated.status, "not_due");
    assert.equal(claims, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Cookie 過期時回傳安全的繁中通知且不洩漏 Cookie", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-hsr-cloud-"));
  const service = new HsrCloudDailyService(config, path.join(dir, "state.json"), () => ({
    info: async () => { throw new Error("Cookie expired 10001"); },
    rewards: async () => ({ awards: [] }),
    claim: async () => ({ code: 0, info: { total_sign_day: 1 } }),
  }));
  try {
    const result = await service.run({ force: true });
    assert.equal(result.status, "failed");
    assert.match(result.message, /登入資料已過期/);
    assert.doesNotMatch(result.message, /secret/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
