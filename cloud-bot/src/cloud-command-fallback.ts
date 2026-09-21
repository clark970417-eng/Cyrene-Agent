export type CloudCommandOption = {
  name: string;
  value?: string | number | boolean;
};

export function buildCloudCommandFallbackPrompt(
  commandName: string,
  options: readonly CloudCommandOption[],
): string {
  const details = options
    .filter((option) => option.value !== undefined)
    .map((option) => `${option.name}=${String(option.value)}`)
    .join("、");
  return [
    `使用者在 Discord 使用 /${commandName}${details ? `，參數：${details}` : ""}。`,
    "這是已開放的雲端功能請求。請直接以昔漣人格完成，不要因為缺少專用指令分支就拒絕。",
    "若功能確實依賴未連線的本機硬體，請完成所有能在雲端完成的部分，再精確說明剩餘的硬體限制。",
  ].join("\n");
}
