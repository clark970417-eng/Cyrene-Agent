import { describe, expect, it } from "vitest";
import { createKeyedTaskQueue } from "./keyed-task-queue";

describe("keyed task queue", () => {
  it("serializes one chat while allowing different chats to run in parallel", async () => {
    const queue = createKeyedTaskQueue();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const first = queue.run("chat-a", async () => {
      events.push("first:start");
      await gate;
      events.push("first:end");
    });
    const second = queue.run("chat-a", async () => { events.push("second:start"); });
    await queue.run("chat-b", async () => { events.push("parallel:start"); });

    expect(events).toEqual(["first:start", "parallel:start"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "parallel:start", "first:end", "second:start"]);
  });

  it("continues after a failed task and releases its queue state", async () => {
    const queue = createKeyedTaskQueue(1);
    await expect(queue.run("chat-a", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(queue.run("chat-a", async () => "recovered")).resolves.toBe("recovered");
  });

  it("rejects excess work instead of growing without a bound", async () => {
    const queue = createKeyedTaskQueue(1);
    let release!: () => void;
    const running = queue.run("chat-a", () => new Promise<void>((resolve) => { release = resolve; }));
    await expect(queue.run("chat-a", async () => undefined)).rejects.toThrow("channel_queue_full:chat-a");
    release();
    await running;
  });
});
