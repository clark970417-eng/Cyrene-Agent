import assert from "node:assert/strict";
import test from "node:test";
import { generateCloudImage } from "./cloud-image.js";

test("generateCloudImage decodes Gemini inline image data", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("image").toString("base64"), mimeType: "image/png" } }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  const result = await generateCloudImage({ geminiApiKey: "test", imageModel: "image-model" }, "畫昔漣", fetchImpl as typeof fetch);
  assert.equal(result.image.toString(), "image");
  assert.equal(result.fileName, "cyrene-drawing.png");
});
