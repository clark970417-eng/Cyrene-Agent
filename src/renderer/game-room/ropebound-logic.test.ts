import { describe, expect, it } from "vitest";
import { createMemoryRope, seededRandom, stepMemoryRope, type RopeBody } from "./ropebound-logic";

function body(x: number, grounded = false): RopeBody {
  return { x, y: 100, width: 34, height: 54, vx: 0, vy: 0, grounded, mass: 1 };
}

describe("memory rope", () => {
  it("creates a continuous rope between both players", () => {
    const first = body(10);
    const second = body(180);
    const rope = createMemoryRope(first, second, 12, 220);
    expect(rope.points).toHaveLength(13);
    expect(rope.points[0].x).toBeCloseTo(27);
    expect(rope.points.at(-1)?.x).toBeCloseTo(197);
  });

  it("pulls separated players back toward each other", () => {
    const first = body(0, true);
    const second = body(360);
    const rope = createMemoryRope(first, second, 12, 220);
    stepMemoryRope(rope, first, second, [], 1 / 120, 1, false);
    expect(first.vx).toBeGreaterThan(0);
    expect(second.vx).toBeLessThan(0);
    expect(rope.tension).toBeGreaterThan(0.5);
  });

  it("uses reproducible random sequences", () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});
