import type { NewScheduledTaskInput, ScheduledTask, ScheduledTaskPatch } from "../scheduler/types";

export type DailyRitualId = "morning" | "afternoon" | "evening";

export interface DailyRitualSettings {
  dailyRitualEnabled: boolean;
  dailyRitualVoice: boolean;
  dailyRitualMorningEnabled: boolean;
  dailyRitualMorningTime: string;
  dailyRitualAfternoonEnabled: boolean;
  dailyRitualAfternoonTime: string;
  dailyRitualEveningEnabled: boolean;
  dailyRitualEveningTime: string;
}

interface SchedulerStoreLike {
  getTasks(): ScheduledTask[];
  addTask(input: NewScheduledTaskInput): ScheduledTask;
  updateTask(id: string, patch: ScheduledTaskPatch): ScheduledTask;
}

const RITUALS: Array<{
  id: DailyRitualId;
  title: string;
  enabledKey: keyof DailyRitualSettings;
  timeKey: keyof DailyRitualSettings;
  prompt: string;
}> = [
  {
    id: "morning",
    title: "🌅 昔漣的早安儀式",
    enabledKey: "dailyRitualMorningEnabled",
    timeKey: "dailyRitualMorningTime",
    prompt: [
      "這是一段每日早安陪伴儀式。請自然地向用戶道早安，像真正一起生活的陪伴者，不要提及排程或系統。",
      "結合使用者資料、近期記憶與今日待辦；若天氣工具可用，優先查詢台灣所在地或使用者設定城市的今日天氣。",
      "用 2 至 4 句繁體中文，先關心感受，再給今天最值得留意的一件事；不要編造缺少的資料。",
    ].join("\n"),
  },
  {
    id: "afternoon",
    title: "☕ 昔漣的午後關心",
    enabledKey: "dailyRitualAfternoonEnabled",
    timeKey: "dailyRitualAfternoonTime",
    prompt: "這是一段每日午後陪伴儀式。參考近期記憶與今日待辦，用 2 至 3 句繁體中文自然關心使用者，提醒休息或調整當下最重要的一件事；不要提及排程，也不要說教。",
  },
  {
    id: "evening",
    title: "🌙 昔漣的晚安儀式",
    enabledKey: "dailyRitualEveningEnabled",
    timeKey: "dailyRitualEveningTime",
    prompt: "這是一段每日晚間陪伴儀式。結合近期記憶與今日待辦，用 2 至 4 句繁體中文陪使用者收尾今天，肯定已完成的事並留一個容易回答的回顧問題；不要提及排程或編造事件。",
  },
];

export function syncDailyRitualTasks(settings: DailyRitualSettings, store: SchedulerStoreLike): ScheduledTask[] {
  const existing = store.getTasks();
  return RITUALS.map((ritual) => {
    const enabled = settings.dailyRitualEnabled && Boolean(settings[ritual.enabledKey]);
    const common = {
      title: ritual.title,
      prompt: ritual.prompt,
      enabled,
      schedule: { kind: "daily" as const, timeOfDay: String(settings[ritual.timeKey]) },
      toolMode: "allow-list" as const,
      allowedToolIds: ritual.id === "morning" ? ["weather"] : [],
      managedBy: "daily-ritual" as const,
      ritualId: ritual.id,
    };
    const current = existing.find((task) => task.managedBy === "daily-ritual" && task.ritualId === ritual.id);
    return current ? store.updateTask(current.id, common) : store.addTask(common);
  });
}
