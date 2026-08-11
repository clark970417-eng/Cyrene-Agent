export type UiTheme = "cyrene-night" | "pearl-white";

export function normalizeUiTheme(value: unknown): UiTheme {
  return value === "pearl-white" ? "pearl-white" : "cyrene-night";
}
