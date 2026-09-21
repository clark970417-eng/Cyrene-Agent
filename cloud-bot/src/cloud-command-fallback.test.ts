import assert from "node:assert/strict";
import test from "node:test";
import { buildCloudCommandFallbackPrompt } from "./cloud-command-fallback.js";

test("future Discord commands automatically receive an unrestricted cloud fallback", () => {
  const prompt = buildCloudCommandFallbackPrompt("future-feature", [
    { name: "mode", value: "full" },
    { name: "enabled", value: true },
  ]);
  assert.match(prompt, /\/future-feature/);
  assert.match(prompt, /mode=full/);
  assert.match(prompt, /enabled=true/);
  assert.match(prompt, /不要.*拒絕/);
});
