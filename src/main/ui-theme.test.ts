import { describe, expect, it } from "vitest";
import { normalizeUiTheme } from "../shared/ui-theme";

describe("normalizeUiTheme", () => {
  it.each([
    ["pearl-white", "pearl-white"],
    ["cyrene-night", "cyrene-night"],
    ["classic", "cyrene-night"],
    ["polished-pink", "cyrene-night"],
    [undefined, "cyrene-night"],
    ["unknown", "cyrene-night"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUiTheme(input)).toBe(expected);
  });
});
