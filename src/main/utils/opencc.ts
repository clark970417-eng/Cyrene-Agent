import * as OpenCC from "opencc-js";

const converter = OpenCC.Converter({ from: "cn", to: "tw" });

/**
 * 將簡體中文文本強制轉換為繁體中文（台灣標準），並替換常見名詞。
 */
export function toTraditionalTaiwan(text: string): string {
  if (!text) return "";
  const traditional = converter(text);
  // 替換一些常見的台灣/大陸用語差異（如屏幕 -> 螢幕）
  return traditional
    .replace(/屏幕/g, "螢幕")
    .replace(/計算機/g, "電腦")
    .replace(/視頻/g, "影片")
    .replace(/音頻/g, "音訊")
    .replace(/支持/g, "支援");
}
