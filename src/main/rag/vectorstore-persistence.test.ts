import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonVectorStore, type MemoryEntry } from "./vectorstore";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function createStore(): { dir: string; store: JsonVectorStore } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-vectorstore-"));
  tempDirs.push(dir);
  return { dir, store: new JsonVectorStore(dir) };
}

function prepared(text: string): Omit<MemoryEntry, "id" | "weight" | "createdAt" | "lastRecalledAt"> {
  return { text, source: "test", embedding: [1, 0] };
}

describe("JsonVectorStore persistence", () => {
  it("coalesces writes and persists atomically after the debounce window", async () => {
    vi.useFakeTimers();
    const { dir, store } = createStore();
    store.addPreparedBatch([prepared("one")]);
    store.addPreparedBatch([prepared("two")]);

    expect(fs.existsSync(path.join(dir, "memory-store.json"))).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await store.flush();

    const saved = JSON.parse(fs.readFileSync(path.join(dir, "memory-store.json"), "utf8")) as MemoryEntry[];
    expect(saved.map((entry) => entry.text)).toEqual(["one", "two"]);
    expect(fs.existsSync(path.join(dir, "memory-store.json.tmp"))).toBe(false);
  });

  it("flushSync preserves pending changes before shutdown", () => {
    vi.useFakeTimers();
    const { dir, store } = createStore();
    store.addPreparedBatch([prepared("last turn")]);
    store.flushSync();

    const saved = JSON.parse(fs.readFileSync(path.join(dir, "memory-store.json"), "utf8")) as MemoryEntry[];
    expect(saved[0]?.text).toBe("last turn");
  });
});
