import { describe, expect, it } from "vitest";
import { syncDailyRitualTasks, type DailyRitualSettings } from "./daily-rituals";
import type { NewScheduledTaskInput, ScheduledTask, ScheduledTaskPatch } from "../scheduler/types";

const settings = (patch: Partial<DailyRitualSettings> = {}): DailyRitualSettings => ({
  dailyRitualEnabled: true,
  dailyRitualVoice: true,
  dailyRitualMorningEnabled: true,
  dailyRitualMorningTime: "08:00",
  dailyRitualAfternoonEnabled: true,
  dailyRitualAfternoonTime: "15:00",
  dailyRitualEveningEnabled: true,
  dailyRitualEveningTime: "22:30",
  ...patch,
});

function fakeStore() {
  let tasks: ScheduledTask[] = [];
  let sequence = 0;
  const stamp = "2026-08-12T00:00:00.000Z";
  return {
    getTasks: () => tasks.map((task) => ({ ...task })),
    addTask: (input: NewScheduledTaskInput) => {
      const task: ScheduledTask = {
        ...input,
        id: `task-${++sequence}`,
        enabled: input.enabled !== false,
        nextFireAt: stamp,
        toolMode: input.toolMode ?? "all-enabled",
        allowedToolIds: input.allowedToolIds ?? [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      tasks.push(task);
      return { ...task };
    },
    updateTask: (id: string, patch: ScheduledTaskPatch) => {
      const index = tasks.findIndex((task) => task.id === id);
      tasks[index] = { ...tasks[index], ...patch, updatedAt: stamp };
      return { ...tasks[index] };
    },
  };
}

describe("daily rituals compatibility", () => {
  it("restores all three managed tasks without duplicating them", () => {
    const store = fakeStore();
    const first = syncDailyRitualTasks(settings(), store);
    const second = syncDailyRitualTasks(settings({ dailyRitualMorningTime: "09:15" }), store);
    expect(second.map((task) => task.id)).toEqual(first.map((task) => task.id));
    expect(second[0].schedule).toEqual({ kind: "daily", timeOfDay: "09:15" });
  });

  it("keeps tasks but disables them when the master switch is off", () => {
    expect(syncDailyRitualTasks(settings({ dailyRitualEnabled: false }), fakeStore()).every((task) => !task.enabled)).toBe(true);
  });
});
