import type { CloudBotConfig } from "./config.js";
import { normalizeCompanionAddress, type ChatEntry } from "./core.js";

export type ImageInput = {
  url: string;
  mime?: string;
  name?: string;
};

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image_url"; image_url: { url: string } };
type RequestMessage = {
  role: "system" | ChatEntry["role"];
  content: string | Array<TextContent | ImageContent>;
};

/**
 * OpenRouter 使用 OpenAI 相容的 image_url content block。
 * 圖片只掛在本輪最後一則 user message，不寫入持久化聊天歷史。
 */
export function buildRequestMessages(systemPrompt: string, history: ChatEntry[], images: ImageInput[] = []): RequestMessage[] {
  const messages: RequestMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
  ];
  if (!images.length) return messages;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user" || typeof message.content !== "string") continue;
    message.content = [
      { type: "text", text: message.content || "請看看我附上的圖片。" },
      ...images.map((image): ImageContent => ({ type: "image_url", image_url: { url: image.url } })),
    ];
    break;
  }
  return messages;
}

export async function generateReply(
  config: CloudBotConfig,
  systemPrompt: string,
  history: ChatEntry[],
  images: ImageInput[] = [],
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const model = images.length ? config.llmVisionModel : config.llmModel;
    const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.llmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: buildRequestMessages(systemPrompt, history, images),
        temperature: 0.85,
        max_tokens: config.maxOutputTokens,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`LLM HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json() as { model?: string; choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("模型沒有返回文字");
    console.log(`[LLM] ${images.length ? `視覺 ${images.length} 張` : "文字"}：requested=${model} selected=${data.model || "unknown"}`);
    return normalizeCompanionAddress(content.trim());
  } finally {
    clearTimeout(timeout);
  }
}
