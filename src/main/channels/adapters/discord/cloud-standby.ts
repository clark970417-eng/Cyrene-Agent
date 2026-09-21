import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import * as path from "node:path";
import type { DiscordChannelConfig } from "../../settings-store";

export type CloudStandbyAction = "online" | "offline" | "restart" | "status";

const CLOUD_STANDBY_HOST_KEY_ALIAS = "cyrene-cloud-standby";

export type CloudStandbyStatus = {
  reachable: boolean;
  cloudService: "active" | "inactive" | "activating" | "failed" | "unknown";
  watchdog: "active" | "inactive" | "failed" | "unknown";
  heartbeatAge: number | null;
};

export type CloudNotificationFiles = {
  x?: unknown;
  aniList?: unknown;
};

export function sanitizeCloudAniListConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { accessToken: _accessToken, ...safe } = value as Record<string, unknown>;
  return safe;
}

export function isCloudStandbyConfigured(config: DiscordChannelConfig): boolean {
  return Boolean(
    config.cloudStandbyEnabled
    && config.cloudStandbyHost?.trim()
    && config.cloudStandbyUser?.trim()
    && config.cloudStandbyKeyPath?.trim(),
  );
}

export function cloudStandbySshArgs(config: DiscordChannelConfig, action: CloudStandbyAction): string[] {
  const host = config.cloudStandbyHost?.trim();
  const user = config.cloudStandbyUser?.trim();
  const configuredKey = config.cloudStandbyKeyPath?.trim();
  if (!host || !user || !configuredKey) throw new Error("雲端備援 SSH 設定不完整");
  const keyPath = configuredKey === "~"
    ? homedir()
    : configuredKey.startsWith("~/")
      ? path.join(homedir(), configuredKey.slice(2))
      : configuredKey;
  const script = action === "online"
    ? "/usr/local/sbin/cyrene-local-online"
    : action === "offline"
      ? "/usr/local/sbin/cyrene-local-offline"
      : action === "restart"
        ? "/usr/local/sbin/cyrene-cloud-restart"
        : "/usr/local/sbin/cyrene-cloud-status";
  return [
    "-i", keyPath,
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `HostKeyAlias=${CLOUD_STANDBY_HOST_KEY_ALIAS}`,
    `${user}@${host}`,
    ...(action === "status" ? [script] : ["sudo", script]),
  ];
}

function cloudStandbyConnectionArgs(config: DiscordChannelConfig): string[] {
  return cloudStandbySshArgs(config, "status").slice(0, -1);
}

async function uploadCloudNotificationFile(
  config: DiscordChannelConfig,
  fileName: "x-notifications.json" | "anilist-notifications.json",
  value: unknown,
): Promise<void> {
  const remoteCommand = `umask 077; mkdir -p "$HOME/cyrene-data"; cat > "$HOME/cyrene-data/${fileName}.tmp" && mv "$HOME/cyrene-data/${fileName}.tmp" "$HOME/cyrene-data/${fileName}"`;
  const args = [...cloudStandbyConnectionArgs(config), remoteCommand];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ssh", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 12_000);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `雲端通知設定同步失敗（exit ${code ?? "unknown"}）`));
    });
    child.stdin.end(`${JSON.stringify(value, null, 2)}\n`);
  });
}

export async function syncCloudNotificationFiles(
  config: DiscordChannelConfig,
  files: CloudNotificationFiles,
): Promise<void> {
  if (!isCloudStandbyConfigured(config)) return;
  if (files.x !== undefined) await uploadCloudNotificationFile(config, "x-notifications.json", files.x);
  if (files.aniList !== undefined) {
    await uploadCloudNotificationFile(config, "anilist-notifications.json", sanitizeCloudAniListConfig(files.aniList));
  }
}

async function runCloudStandby(config: DiscordChannelConfig, action: CloudStandbyAction): Promise<string> {
  const args = cloudStandbySshArgs(config, action);
  return await new Promise<string>((resolve, reject) => {
    execFile("ssh", args, { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

export async function signalCloudStandby(config: DiscordChannelConfig, action: Exclude<CloudStandbyAction, "status">): Promise<void> {
  await runCloudStandby(config, action);
}

export async function queryCloudStandby(config: DiscordChannelConfig): Promise<CloudStandbyStatus> {
  const output = await runCloudStandby(config, "status");
  const parsed = JSON.parse(output) as Partial<CloudStandbyStatus>;
  return {
    reachable: true,
    cloudService: ["active", "inactive", "activating", "failed"].includes(parsed.cloudService ?? "")
      ? parsed.cloudService as CloudStandbyStatus["cloudService"]
      : "unknown",
    watchdog: ["active", "inactive", "failed"].includes(parsed.watchdog ?? "")
      ? parsed.watchdog as CloudStandbyStatus["watchdog"]
      : "unknown",
    heartbeatAge: typeof parsed.heartbeatAge === "number" && Number.isFinite(parsed.heartbeatAge) && parsed.heartbeatAge >= 0
      ? parsed.heartbeatAge
      : null,
  };
}
