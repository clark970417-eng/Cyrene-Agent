/** 辨識 Discord 文字訊息中的自然語言語音請求。 */

function removeEmojiForSpeech(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\uFE0F\u200D]/g, "").trim();
}
export function extractDiscordExactVoiceText(text: string): string | null {
  const cleaned = text
    .replace(/\[附件:\s*.*?\s*\]/gi, "")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/能只說(?:一)?句\s*(.+?)(?:嗎)?[？?]?\s*$/u);
  if (!match?.[1]?.trim()) return null;
  const raw = match[1].trim();
  let spoken = removeEmojiForSpeech(raw);
  if (/[🔥🥳🤩😆😡🤬💢]/u.test(raw) && !/[!！]$/.test(spoken)) spoken += "！";
  else if (/[😢😭🥺💔]/u.test(raw) && !/(?:……|…)$/.test(spoken)) spoken += "……";
  else if (/[🥰😍😘💕❤️]/u.test(raw) && !/[~～]$/.test(spoken)) spoken += "～";
  else if (/[🤔❓]/u.test(raw) && !/[?？]$/.test(spoken)) spoken += "？";
  return spoken || null;
}

export function extractDiscordVoiceRequestTopic(text: string): string | null {
  const cleaned = text
    .replace(/\[附件:\s*.*?\s*\]/gi, "")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exactText = extractDiscordExactVoiceText(cleaned);
  if (exactText !== null) return exactText;

  if (
    /(?:你能|你會|你可以|你能不能|能不能|可不可以|可否|能不能夠)(?:傳|發|發送|錄|用語音|講|說)(?:音訊|語音|聲音)?(?:嗎|不|麼)?[？?]?\s*$/u.test(cleaned) ||
    /(?:可以|能)(?:傳|發|發送|錄)(?:語音|聲音)(?:嗎)?[？?]?\s*$/u.test(cleaned)
  ) {
    return "親切並確定地告訴夥伴你可以傳語音，並給予溫暖的回應";
  }

  if (/(?:教學|圖片|相片|短片|影片)/u.test(cleaned)) return null;

  const wantListen = cleaned.match(/(?:想聽|聽聽|好想聽|想聽聽)(?:你|昔漣)?(?:說|講|唸|唱)?(?:一段|一個|幾句|一句|個|些)?\s*(.+?)\s*(?:嗎|吧|麼|嘛)?[？?]?\s*$/u);
  if (wantListen) return wantListen[1]?.trim() || "自由發揮一段溫柔、親切的陪伴語音對話";

  const voice = cleaned.match(/(?:能|可以|能不能|可不可以|請|幫我)?(?:傳|發|錄|給)(?:一段|一個|幾句|一句|個|些)?\s*(?:(.+?)的)?語音(?:嗎|吧|麼|嘛)?[？?]?\s*$/u);
  if (voice) return voice[1]?.trim() || "自由發揮一段自然、親切的內容";

  const say = cleaned.match(/(?:能|可以|幫我)?(?:說|講|唸)(?:一|幾)?(?:句|個)\s*(.+?)(?:嗎|吧|麼|嘛)?[？?]?\s*$/u);
  if (say?.[1]?.trim()) return say[1].trim();

  if (/(?:語音|聲音|用講的|聽聲音|asmr|耳語|輕聲|睡前|唱|唱歌|吟唱|\/sing|\/asmr|!sing|!asmr)/iu.test(cleaned)) {
    return cleaned.replace(/(?:傳|發|錄|用語音|說|講|唸|請|幫我|能|可以|嗎|吧|麼|嘛|？|\?)/gu, "").trim() || "自由發揮一段自然親切的語音對話";
  }
  return null;
}
