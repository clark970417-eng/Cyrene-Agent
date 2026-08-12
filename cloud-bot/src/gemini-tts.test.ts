import assert from "node:assert/strict";
import test from "node:test";
import { pcm16ToWav, prepareSpeechText, synthesizeGeminiSpeech } from "./gemini-tts.js";

test("PCM 會包成 Discord 可播放的 WAV", () => {
  const wav = pcm16ToWav(Buffer.from([0, 0, 1, 0]));
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt32LE(40), 4);
});
test("朗讀內容強制繁體並移除動作文字", () => {
  assert.equal(prepareSpeechText("（輕輕笑著）这个视频支持屏幕显示。"), "這個影片支援螢幕顯示。");
});

test("Gemini TTS 回應會轉成 WAV 附件", async () => {
  let requestBody: Record<string, any> | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: Buffer.from([0, 0]).toString("base64") } }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await synthesizeGeminiSpeech({ geminiApiKey: "test", ttsEnabled: true, ttsModel: "gemini-3.1-flash-tts-preview", ttsVoiceName: "Leda", ttsMaxChars: 900 }, "你好", fakeFetch);
  assert.equal(result.fileName, "cyrene-voice.wav");
  assert.equal(result.audio.subarray(0, 4).toString("ascii"), "RIFF");
  assert.deepEqual(requestBody?.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(requestBody?.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Leda");
});
