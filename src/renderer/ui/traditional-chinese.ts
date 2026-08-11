let toTaiwanTraditional: (text: string) => string = (text) => text;
const SKIP_SELECTOR = "input, textarea, [contenteditable='true'], pre, code, .message-content, .markdown-body, [data-user-content]";
const ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

function shouldSkip(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest(SKIP_SELECTOR));
}

function convertTextNode(node: Text): void {
  if (shouldSkip(node) || !/[\u3400-\u9fff]/u.test(node.data)) return;
  const converted = toTaiwanTraditional(node.data);
  if (converted !== node.data) node.data = converted;
}

function convertElement(element: Element): void {
  if (shouldSkip(element)) return;
  for (const attr of ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (value && /[\u3400-\u9fff]/u.test(value)) element.setAttribute(attr, toTaiwanTraditional(value));
  }
  if (element instanceof HTMLOptionElement && /[\u3400-\u9fff]/u.test(element.textContent ?? "")) {
    element.textContent = toTaiwanTraditional(element.textContent ?? "");
  }
}

function convertTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    convertTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) convertElement(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current.nodeType === Node.TEXT_NODE) convertTextNode(current as Text);
    else convertElement(current as Element);
  }
}

async function startTaiwanTraditionalUi(): Promise<void> {
  const { Converter } = await import("opencc-js");
  toTaiwanTraditional = Converter({ from: "cn", to: "twp" });
  document.documentElement.lang = "zh-Hant-TW";
  convertTree(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") convertTextNode(mutation.target as Text);
      else for (const node of mutation.addedNodes) convertTree(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void startTaiwanTraditionalUi(), { once: true });
else void startTaiwanTraditionalUi();
