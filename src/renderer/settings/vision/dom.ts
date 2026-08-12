// Vision 面板 DOM 引用（API 面板的视觉模型子区）
// 从 settings.ts 抽离。ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。

export const visionBaseUrlInput = document.getElementById("vision-base-url") as HTMLInputElement;
export const visionApiKeyInput = document.getElementById("vision-api-key") as HTMLInputElement;
export const visionModelInput = document.getElementById("vision-model") as HTMLInputElement;
export const visionFieldsWrap = document.getElementById("vision-fields-wrap") as HTMLElement;
export const testVisionBtn = document.getElementById("test-vision-btn") as HTMLButtonElement;
export const visionTestStatus = document.getElementById("vision-test-status") as HTMLElement;
export const visionEnabledInput = document.getElementById("vision-enabled") as HTMLInputElement;
export const visionAutoAnalyzeInput = document.getElementById("vision-auto-analyze") as HTMLInputElement;
export const visionMaxImagesInput = document.getElementById("vision-max-images") as HTMLSelectElement;
export const visionMaxImageMbInput = document.getElementById("vision-max-image-mb") as HTMLSelectElement;
export const screenCompanionEnabledInput = document.getElementById("screen-companion-enabled") as HTMLInputElement;
export const companionObserveIntervalInput = document.getElementById("companion-observe-interval") as HTMLSelectElement;
export const companionTalkativenessInput = document.getElementById("companion-talkativeness") as HTMLSelectElement;
export const companionMinIntervalInput = document.getElementById("companion-min-interval") as HTMLSelectElement;
export const companionProactiveTargetInput = document.getElementById("companion-proactive-target") as HTMLSelectElement;
export const companionDiscordSubtargetInput = document.getElementById("companion-discord-subtarget") as HTMLSelectElement;
export const companionDiscordChannelIdInput = document.getElementById("companion-discord-channel-id") as HTMLInputElement;
