import { app, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createLlmClient } from "./services/llm/llm-client";
import { loadModelSettings } from "./settings/model-settings";

type PaintPayload = {
  provider: "openrouter" | "gemini"; prompt: string; model: string; aspectRatio: string;
  resolution: "1K" | "2K" | "4K"; quality: "auto" | "low" | "medium" | "high";
  references?: Array<{ dataUrl: string; mimeType: string }>;
};

function credentials() {
  const settings = loadModelSettings();
  const profiles = Object.values(settings.perProvider ?? {});
  const openrouter = profiles.find((profile) => /openrouter/i.test(profile.baseUrl)) ?? settings.perProvider?.Custom;
  const gemini = profiles.find((profile) => /generativelanguage\.googleapis\.com/i.test(profile.baseUrl)) ?? settings.perProvider?.["Gemini（Google）"];
  return {
    openrouter: { apiKey: openrouter?.apiKey || process.env.OPENROUTER_API_KEY || "", baseUrl: (openrouter?.baseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, ""), model: openrouter?.model || "google/gemini-3.1-flash-image" },
    gemini: { apiKey: gemini?.apiKey || process.env.GEMINI_API_KEY || "", model: gemini?.model || "gemini-3.1-flash-image" },
  };
}

async function errorText(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string }; message?: string };
    return typeof parsed.error === "string" ? parsed.error : parsed.error?.message || parsed.message || body;
  } catch { return body || `HTTP ${response.status}`; }
}

async function saveImage(bytes: Uint8Array, mimeType: string): Promise<string> {
  const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const dir = path.join(app.getPath("pictures"), "Cyrene Studio");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `cyrene-${Date.now()}.${extension}`);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

function findImage(value: unknown, depth = 0): { data: string; mimeType: string } | null {
  if (depth > 7 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findImage(item, depth + 1); if (found) return found; }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data = typeof record.data === "string" ? record.data : undefined;
  const mimeType = typeof record.mime_type === "string" ? record.mime_type : typeof record.mimeType === "string" ? record.mimeType : undefined;
  if (data && (!mimeType || mimeType.startsWith("image/"))) return { data, mimeType: mimeType || "image/png" };
  for (const child of Object.values(record)) { const found = findImage(child, depth + 1); if (found) return found; }
  return null;
}

export function registerPaintIpc(): void {
  for (const channel of ["paint:build-prompt", "paint:get-connections", "paint:generate-image"]) ipcMain.removeHandler(channel);
  ipcMain.handle("paint:build-prompt", async (_event, description: string) => {
    const input = String(description ?? "").trim();
    if (!input) return "";
    const settings = loadModelSettings();
    if (!settings.apiKey) return input;
    try {
      return (await createLlmClient().chat(settings, [
        { role: "system", content: "Convert the Traditional Chinese image brief into one concise production-ready English image prompt. Preserve subject, clothing, pose, camera, lighting, mood and style. Output only the prompt. Do not invent sexual content." },
        { role: "user", content: input },
      ], 0.2, 20_000, "繪圖提示詞生成")).trim() || input;
    } catch (error) {
      console.warn("[Paint] prompt enhancement unavailable; using original brief", error);
      return input;
    }
  });
  ipcMain.handle("paint:get-connections", () => {
    const cfg = credentials();
    return [
      { provider: "openrouter", label: "OpenRouter Image API", connected: Boolean(cfg.openrouter.apiKey), model: cfg.openrouter.model },
      { provider: "gemini", label: "Gemini 原生圖片 API", connected: Boolean(cfg.gemini.apiKey), model: cfg.gemini.model },
    ];
  });
  ipcMain.handle("paint:generate-image", async (_event, payload: PaintPayload) => {
    if (!payload?.prompt?.trim()) throw new Error("繪圖 Prompt 不可為空。");
    const cfg = credentials();
    const references = (payload.references ?? []).slice(0, 4);
    if (payload.provider === "openrouter") {
      if (!cfg.openrouter.apiKey) throw new Error("尚未設定 OpenRouter API Key。");
      const response = await fetch(`${cfg.openrouter.baseUrl}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.openrouter.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://cyrene.local", "X-Title": "Cyrene Painting Studio" },
        body: JSON.stringify({ model: payload.model || cfg.openrouter.model, prompt: payload.prompt, n: 1, aspect_ratio: payload.aspectRatio || "1:1", resolution: payload.resolution || "1K", quality: payload.quality || "auto", output_format: "png", ...(references.length ? { input_references: references.map((reference) => ({ type: "image_url", image_url: { url: reference.dataUrl } })) } : {}) }),
      });
      if (!response.ok) throw new Error(`OpenRouter：${await errorText(response)}`);
      const result = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string; url?: string }> };
      const image = result.data?.[0];
      if (image?.b64_json) {
        const mimeType = image.media_type || "image/png";
        return { dataUrl: `data:${mimeType};base64,${image.b64_json}`, savedPath: await saveImage(Buffer.from(image.b64_json, "base64"), mimeType) };
      }
      if (image?.url) {
        const downloaded = await fetch(image.url);
        if (!downloaded.ok) throw new Error(`下載生成圖片失敗：HTTP ${downloaded.status}`);
        const mimeType = downloaded.headers.get("content-type") || "image/png";
        return { dataUrl: image.url, savedPath: await saveImage(new Uint8Array(await downloaded.arrayBuffer()), mimeType) };
      }
      throw new Error("OpenRouter 回應中沒有圖片資料。");
    }
    if (!cfg.gemini.apiKey) throw new Error("尚未設定 Gemini API Key。");
    const input: Array<Record<string, string>> = [{ type: "text", text: payload.prompt }];
    for (const reference of references) {
      const match = /^data:([^;,]+);base64,(.+)$/s.exec(reference.dataUrl);
      if (!match) throw new Error("參考圖格式無效。");
      input.push({ type: "image", mime_type: match[1] || reference.mimeType, data: match[2] });
    }
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: { "x-goog-api-key": cfg.gemini.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: payload.model || cfg.gemini.model, input, response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: payload.aspectRatio || "1:1", image_size: (payload.model || "").includes("flash-lite-image") ? "1K" : payload.resolution || "1K" } }),
    });
    if (!response.ok) throw new Error(`Gemini：${await errorText(response)}`);
    const image = findImage(await response.json());
    if (!image) throw new Error("Gemini 回應中沒有圖片資料。");
    return { dataUrl: `data:${image.mimeType};base64,${image.data}`, savedPath: await saveImage(Buffer.from(image.data, "base64"), image.mimeType) };
  });
}
