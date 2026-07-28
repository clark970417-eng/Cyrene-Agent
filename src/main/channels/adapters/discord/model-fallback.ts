export const DISCORD_OWNER_ID = "798893182883463179";
export const GEMINI_PROVIDER_NAME = "Gemini（Google）";

export interface DiscordModelProfile {
  baseUrl: string;
  model: string;
  apiKey: string;
  explicitTransport?: "openai" | "anthropic" | "auto";
}

export interface DiscordPrimaryModelSettings extends DiscordModelProfile {
  provider: string;
  perProvider?: Record<string, DiscordModelProfile>;
}

export function isOpenRouterFreeQuotaError(
  error: unknown,
  settings: Pick<DiscordPrimaryModelSettings, "baseUrl" | "model">,
): boolean {
  if (!/openrouter\.ai/i.test(settings.baseUrl) || settings.model !== "openrouter/free") return false;
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP\s*429/i.test(message)
    && /(?:free-models-per-day|rate\s*limit|quota|remaining["']?\s*:\s*["']?0)/i.test(message);
}

export function getGeminiOwnerFallback(
  settings: DiscordPrimaryModelSettings,
  senderId: string,
  error: unknown,
): DiscordModelProfile & { provider: typeof GEMINI_PROVIDER_NAME } | null {
  if (senderId !== DISCORD_OWNER_ID || !isOpenRouterFreeQuotaError(error, settings)) return null;
  const profile = settings.perProvider?.[GEMINI_PROVIDER_NAME];
  if (!profile?.apiKey?.trim() || !profile.baseUrl?.trim() || !profile.model?.trim()) return null;
  return {
    provider: GEMINI_PROVIDER_NAME,
    baseUrl: profile.baseUrl.trim(),
    model: profile.model.trim(),
    apiKey: profile.apiKey.trim(),
    explicitTransport: profile.explicitTransport ?? "openai",
  };
}

export function isDiscordNonOwnerQuotaFailure(
  settings: DiscordPrimaryModelSettings,
  senderId: string,
  error: unknown,
): boolean {
  return senderId !== DISCORD_OWNER_ID && isOpenRouterFreeQuotaError(error, settings);
}
