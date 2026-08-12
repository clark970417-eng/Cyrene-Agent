import * as OpenCC from "opencc-js";

const toTaiwan = OpenCC.Converter({ from: "cn", to: "twp" });
const ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-description"] as const;

function convertText(value: string): string {
  return /[\u3400-\u9fff]/u.test(value) ? toTaiwan(value) : value;
}

function convertElement(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest("script, style, code, pre, [data-preserve-language]")) {
      const converted = convertText(node.nodeValue ?? "");
      if (converted !== node.nodeValue) node.nodeValue = converted;
    }
    node = walker.nextNode();
  }
  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    for (const attr of ATTRIBUTES) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const converted = convertText(value);
      if (converted !== value) element.setAttribute(attr, converted);
    }
  }
}

/** 將舊版與動態產生的設定介面文字統一顯示為台灣繁體，不改值、路徑或資料。 */
export function installTraditionalTaiwanUi(): void {
  convertElement(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && record.target.nodeType === Node.TEXT_NODE) {
        const text = record.target.nodeValue ?? "";
        const converted = convertText(text);
        if (converted !== text) record.target.nodeValue = converted;
      }
      for (const added of record.addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          const text = added.nodeValue ?? "";
          const converted = convertText(text);
          if (converted !== text) added.nodeValue = converted;
        } else if (added instanceof Element) {
          convertElement(added);
        }
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}

installTraditionalTaiwanUi();
