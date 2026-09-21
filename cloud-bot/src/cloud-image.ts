import type { CloudBotConfig } from "./config.js";

type GeminiImageResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
  error?: { message?: string };
};

export type GeneratedImage = {
  image: Buffer;
  fileName: string;
};

export async function generateCloudImage(
  config: Pick<CloudBotConfig, "geminiApiKey" | "imageModel">,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeneratedImage> {
  if (!config.geminiApiKey) throw new Error("雲端畫圖缺少 GEMINI_API_KEY");
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.imageModel)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt.trim() }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const body = await response.json() as GeminiImageResponse;
  if (!response.ok) throw new Error(`Gemini Image HTTP ${response.status}: ${body.error?.message ?? "未知錯誤"}`);
  const inline = body.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini 沒有回傳圖片");
  const extension = inline.mimeType?.includes("jpeg") ? "jpg" : inline.mimeType?.includes("webp") ? "webp" : "png";
  return { image: Buffer.from(inline.data, "base64"), fileName: `cyrene-drawing.${extension}` };
}
