import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "./rag/embedding";
import { matchSticker } from "./sticker-embedder";

const provider: EmbeddingProvider = {
  name: "test",
  dims: 2,
  embed: async () => [1, 0],
  embedBatch: async (texts) => texts.map(() => [1, 0]),
};

describe("matchSticker", () => {
  it("selects the closest enabled candidate", async () => {
    await expect(matchSticker("開心", provider, [
      { id: "happy", embedding: [1, 0] },
      { id: "calm", embedding: [0.8, 0.2] },
    ], 0.5)).resolves.toEqual({ id: "happy", score: 1 });
  });

  it("uses the next relevant candidate when a recent sticker is excluded", async () => {
    const result = await matchSticker("開心", provider, [
      { id: "happy", embedding: [1, 0] },
      { id: "celebrate", embedding: [0.9, 0.1] },
      { id: "sad", embedding: [-1, 0] },
    ], 0.5, { excludeIds: ["happy"] });

    expect(result?.id).toBe("celebrate");
    expect(result?.score).toBeGreaterThan(0.9);
  });

  it("returns null when every remaining candidate is below threshold", async () => {
    await expect(matchSticker("開心", provider, [
      { id: "happy", embedding: [1, 0] },
      { id: "sad", embedding: [-1, 0] },
    ], 0.5, { excludeIds: ["happy"] })).resolves.toBeNull();
  });
});
