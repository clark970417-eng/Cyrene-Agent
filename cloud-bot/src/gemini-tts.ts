import type { CloudBotConfig } from "./config.js";
import { normalizeCompanionAddress } from "./core.js";

export type GeneratedSpeech = {
  audio: Buffer;
  fileName: string;
  mimeType: string;
};

type GeminiTtsResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
  error?: { message?: string };
};

export function pcm16ToWav(pcm: Buffer, sampleRate = 24_000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export function prepareSpeechText(text: string, maxChars = 900): string {
  const normalized = normalizeCompanionAddress(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\([^()\n]{0,50}(?:笑|語氣|輕聲|溫柔|開玩笑|嘆氣)[^()\n]{0,50}\)/gu, "")
    .replace(/（[^（）\n]{0,50}(?:笑|語氣|輕聲|溫柔|開玩笑|嘆氣)[^（）\n]{0,50}）/gu, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.slice(0, maxChars).trim();
}

function parseSampleRate(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate\s*=\s*(\d+)/i);
  const rate = Number.parseInt(match?.[1] ?? "", 10);
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
}

export async function synthesizeGeminiSpeech(
  config: Pick<CloudBotConfig, "geminiApiKey" | "ttsEnabled" | "ttsModel" | "ttsVoiceName" | "ttsMaxChars">,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeneratedSpeech> {
  if (!config.ttsEnabled) throw new Error("雲端語音已停用");
  if (!config.geminiApiKey) throw new Error("雲端語音缺少 GEMINI_API_KEY");
  const speechText = prepareSpeechText(text, config.ttsMaxChars);
  if (!speechText) throw new Error("沒有可朗讀的內容");

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ttsModel)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `請精確朗讀以下臺灣繁體中文。聲線年輕、溫柔、親近，節奏自然，不要朗讀指示文字：\n\n${speechText}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoiceName } } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = await response.json() as GeminiTtsResponse;
  if (!response.ok) throw new Error(`Gemini TTS HTTP ${response.status}: ${body.error?.message ?? "未知錯誤"}`);
  const inline = body.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS 沒有回傳音訊");
  const raw = Buffer.from(inline.data, "base64");
  const mimeType = inline.mimeType?.toLowerCase() ?? "audio/l16;codec=pcm;rate=24000";
  if (mimeType.includes("wav")) return { audio: raw, fileName: "cyrene-voice.wav", mimeType: "audio/wav" };
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return { audio: raw, fileName: "cyrene-voice.mp3", mimeType: "audio/mpeg" };
  return { audio: pcm16ToWav(raw, parseSampleRate(mimeType)), fileName: "cyrene-voice.wav", mimeType: "audio/wav" };
}
