import * as fs from "node:fs";
import * as path from "node:path";
import { HonkaiStarRail, LanguageEnum } from "@yeci226/hoyoapi";

export type HsrCloudDailyConfig = {
  enabled: boolean;
  uid?: string;
  cookie?: string;
  hour: number;
  timeZone: string;
};

type DailyInfo = { total_sign_day: number; sign_cnt_missed?: number; is_sign?: boolean };
type DailyReward = { name?: string; cnt?: number; icon?: string };
type DailyClaim = { code: number; status?: string; info: DailyInfo };

export type HsrDailyApi = {
  info(): Promise<DailyInfo>;
  rewards(): Promise<{ awards: DailyReward[] }>;
  claim(): Promise<DailyClaim>;
};

export type HsrDailyResult = {
  ok: boolean;
  status: "success" | "already_signed" | "not_due" | "busy" | "disabled" | "failed";
  message: string;
  completedDate?: string;
};

type HsrDailyState = {
  lastCompletedDate?: string;
  lastAttemptAt?: number;
  lastFailureNoticeDate?: string;
  lastStatus?: HsrDailyResult["status"];
};

const RETRY_INTERVAL_MS = 45 * 60 * 1_000;
const SCHEDULE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

export function millisecondsUntilNextScheduledCheck(
  now: number,
  timeZone: string,
  anchorHour: number,
): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hourOffset = (Number(values.hour) - anchorHour + 24) % 6;
  const elapsed = ((hourOffset * 60 + Number(values.minute)) * 60 + Number(values.second)) * 1_000
    + new Date(now).getMilliseconds();
  return SCHEDULE_CHECK_INTERVAL_MS - elapsed;
}

export function zonedDateParts(now: number, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

export function isHsrDailyCommand(text: string): boolean {
  return /^!(?:daily|每日簽到)(?:\s|$)/iu.test(text.trim());
}

export function validateHsrDailyConfig(config: HsrCloudDailyConfig): string | null {
  if (!config.enabled) return null;
  if (!/^\d{9}$/.test(config.uid ?? "")) return "HSR_DAILY_UID 必須是 9 位數 UID";
  if (!config.cookie || !/(?:^|;\s*)ltoken_v2=/.test(config.cookie) || !/(?:^|;\s*)ltuid_v2=/.test(config.cookie)) {
    return "HSR_DAILY_COOKIE 缺少 ltoken_v2 或 ltuid_v2";
  }
  try { zonedDateParts(Date.now(), config.timeZone); } catch { return `無效時區：${config.timeZone}`; }
  return null;
}

function defaultApiFactory(config: HsrCloudDailyConfig): HsrDailyApi {
  const hsr = new HonkaiStarRail({
    uid: Number(config.uid),
    cookie: config.cookie!,
    lang: LanguageEnum.TRADIIONAL_CHINESE,
  });
  return hsr.daily as HsrDailyApi;
}

export class HsrCloudDailyService {
  private busy = false;

  constructor(
    private readonly config: HsrCloudDailyConfig,
    private readonly statePath: string,
    private readonly apiFactory: (config: HsrCloudDailyConfig) => HsrDailyApi = defaultApiFactory,
  ) {}

  private loadState(): HsrDailyState {
    try { return JSON.parse(fs.readFileSync(this.statePath, "utf8")) as HsrDailyState; } catch { return {}; }
  }

  private saveState(state: HsrDailyState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  millisecondsUntilNextCheck(now = Date.now()): number {
    return millisecondsUntilNextScheduledCheck(now, this.config.timeZone, this.config.hour);
  }

  async run(options: { force?: boolean; now?: number } = {}): Promise<HsrDailyResult> {
    const configError = validateHsrDailyConfig(this.config);
    if (!this.config.enabled) return { ok: false, status: "disabled", message: "雲端崩鐵自動簽到尚未開啟。" };
    if (configError) return { ok: false, status: "failed", message: `雲端崩鐵設定不完整：${configError}` };
    if (this.busy) return { ok: false, status: "busy", message: "崩鐵簽到正在處理中。" };

    const now = options.now ?? Date.now();
    const current = zonedDateParts(now, this.config.timeZone);
    const state = this.loadState();
    if (!options.force) {
      if (current.hour < this.config.hour || state.lastCompletedDate === current.date) {
        return { ok: true, status: "not_due", message: "目前不需要重複簽到。", completedDate: state.lastCompletedDate };
      }
      if (state.lastAttemptAt && now - state.lastAttemptAt < RETRY_INTERVAL_MS) {
        return { ok: true, status: "not_due", message: "稍早已嘗試簽到，等待下一輪重試。" };
      }
    }

    this.busy = true;
    state.lastAttemptAt = now;
    try {
      const api = this.apiFactory(this.config);
      const [before, rewards] = await Promise.all([api.info(), api.rewards()]);
      const claim = await api.claim();
      const alreadySigned = claim.code === -5003 || before.is_sign === true;
      if (claim.code !== 0 && !alreadySigned) throw new Error(claim.status || `HoYoLAB retcode ${claim.code}`);

      const totalDays = alreadySigned ? claim.info.total_sign_day : Math.max(claim.info.total_sign_day, before.total_sign_day + 1);
      const rewardIndex = alreadySigned ? Math.max(0, totalDays - 1) : Math.max(0, before.total_sign_day);
      const reward = rewards.awards[rewardIndex] ?? rewards.awards[0];
      const rewardText = reward?.name ? `，今日獎勵：${reward.name} × ${reward.cnt ?? 1}` : "";
      const status = alreadySigned ? "already_signed" : "success";
      const message = alreadySigned
        ? `✅ 崩鐵今日已經簽到過了（本月第 ${totalDays} 天）${rewardText}`
        : `✅ 崩鐵雲端簽到成功（本月第 ${totalDays} 天）${rewardText}`;
      this.saveState({ ...state, lastCompletedDate: current.date, lastStatus: status });
      return { ok: true, status, message, completedDate: current.date };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const cookieExpired = /(?:cookie|token|login|登入|登錄|登录|10001)/iu.test(raw);
      const message = cookieExpired
        ? "❌ 崩鐵雲端簽到失敗：HoYoLAB 登入資料已過期，請在 Mac 重新綁定後同步到雲端。"
        : `❌ 崩鐵雲端簽到暫時失敗：${raw.slice(0, 180)}`;
      const alreadyNotified = state.lastFailureNoticeDate === current.date;
      this.saveState({ ...state, lastStatus: "failed", lastFailureNoticeDate: current.date });
      return {
        ok: false,
        status: options.force || !alreadyNotified ? "failed" : "not_due",
        message,
      };
    } finally {
      this.busy = false;
    }
  }
}

export function startHsrDailyScheduler(
  service: HsrCloudDailyService,
  onResult: (result: HsrDailyResult) => Promise<void>,
): { stop(): void; checkNow(): Promise<HsrDailyResult> } {
  const checkNow = async () => {
    const result = await service.run();
    if (["success", "already_signed", "failed"].includes(result.status)) await onResult(result);
    return result;
  };
  void checkNow();
  let interval: NodeJS.Timeout | undefined;
  const timeout = setTimeout(() => {
    void checkNow();
    interval = setInterval(() => void checkNow(), SCHEDULE_CHECK_INTERVAL_MS);
    interval.unref();
  }, service.millisecondsUntilNextCheck());
  timeout.unref();
  return {
    stop: () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    },
    checkNow,
  };
}
