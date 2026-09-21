const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_WITHOUT_SPACE = /^(#{1,6})(?=[^#\s])/;
const GLUED_LANGUAGE_FENCE = /(\S)(`{3})([\w+-]+)\s*$/;

export function normalizeModelMarkdown(input: string): string {
  if (!input.includes("#") && !input.includes("```")) return input;
  const output: string[] = [];
  let insideFence = false;

  for (const originalLine of input.split("\n")) {
    if (FENCE_LINE.test(originalLine)) {
      insideFence = !insideFence;
      output.push(originalLine);
      continue;
    }
    if (insideFence) {
      output.push(originalLine);
      continue;
    }

    const gluedFence = originalLine.match(GLUED_LANGUAGE_FENCE);
    if (gluedFence) {
      const fenceStart = originalLine.lastIndexOf("```");
      output.push(originalLine.slice(0, fenceStart), "", originalLine.slice(fenceStart));
      continue;
    }

    const line = originalLine.replace(HEADING_WITHOUT_SPACE, "$1 ");
    if (!line.startsWith("#")) {
      output.push(line);
      continue;
    }

    const period = line.indexOf("。");
    const possibleBody = period >= 0 ? line.slice(period + 1).trim() : "";
    if (possibleBody.length >= 2) output.push(line.slice(0, period), "", possibleBody);
    else output.push(line);
  }

  return output.join("\n");
}
