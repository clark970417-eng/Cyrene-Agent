// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextUsageRing, computeContextRatio } from "./ContextUsageRing";
import type { ContextUsageSnapshot } from "../../../../../shared/context-usage";

afterEach(cleanup);

describe("ContextUsageRing", () => {
  it("clamps invalid ratios and keeps real ratios above one for warnings", () => {
    expect(computeContextRatio(50, 100)).toBe(0.5);
    expect(computeContextRatio(120, 100)).toBe(1.2);
    expect(computeContextRatio(10, 0)).toBe(0);
  });

  it("announces the actual context percentage", () => {
    const usage: ContextUsageSnapshot = {
      phase: "terminal",
      totalTokens: 920,
      contextWindowTokens: 1000,
      messageCount: 8,
      updatedAt: Date.now(),
      categories: [
        { key: "conversation", tokens: 700 },
        { key: "systemPrompt", tokens: 220 },
      ],
    };
    render(createElement(ContextUsageRing, { usage }));
    expect(screen.getByRole("button", { name: "上下文已使用 92%" }).className).toContain("is-alert");
    expect(screen.getByText("92")).toBeTruthy();
  });
});
