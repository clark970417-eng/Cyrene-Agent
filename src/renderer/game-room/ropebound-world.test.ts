import { describe, expect, it } from "vitest";
import { createEndlessWorld } from "./ropebound-game";

describe("endless memory-thread worlds", () => {
  it("builds a complete route with six flowers and three events", () => {
    const world = createEndlessWorld(12345, 2);
    expect(world.platforms.length).toBeGreaterThanOrEqual(13);
    expect(world.pickupPositions).toHaveLength(6);
    expect(world.orbPositions).toHaveLength(3);
    expect(world.width).toBeGreaterThan(4000);
  });

  it("replays the same seed and changes on another stage", () => {
    expect(createEndlessWorld(7, 1)).toEqual(createEndlessWorld(7, 1));
    expect(createEndlessWorld(7, 1)).not.toEqual(createEndlessWorld(7, 2));
  });
});
