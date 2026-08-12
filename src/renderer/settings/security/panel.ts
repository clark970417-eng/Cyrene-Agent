import type { BackupSummary } from "../shared/types";

let selectedBackup: BackupSummary | null = null;

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function selected(container: string): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`#${container} input:checked`)).map((input) => input.value);
}

function status(id: string, message: string, error = false): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", error);
  element.classList.toggle("is-ok", !error);
}

async function load(): Promise<void> {
  if (!window.settings) return;
  const [vault, config] = await Promise.all([window.settings.securityGetStatus(), window.settings.backupGetConfig()]);
  const title = document.getElementById("vault-title");
  const detail = document.getElementById("vault-detail");
  if (title) title.textContent = vault.available ? `macOS Keychain 已就緒 · ${vault.protectedCount} 個密鑰受保護` : "macOS Keychain 目前不可用";
  if (detail) detail.textContent = vault.available ? "備份會保留所有一般設定與歷史，但不會攜帶 API Key、Token 或密碼。" : "一般資料仍可備份；密鑰會留在原電腦且不會被覆寫。";
  const enabled = document.getElementById("backup-auto-enabled") as HTMLInputElement | null;
  const retention = document.getElementById("backup-retention") as HTMLSelectElement | null;
  if (enabled) enabled.checked = config.autoEnabled;
  if (retention) retention.value = String(config.retentionDays);
  const last = document.getElementById("backup-last-auto");
  if (last) last.textContent = config.lastAutoBackupAt ? `上次：${new Date(config.lastAutoBackupAt).toLocaleString("zh-TW")}` : "尚未執行";
}

window.addEventListener("cyrene:load-security-panel", () => void load());

document.getElementById("backup-create-btn")?.addEventListener("click", async () => {
  const categories = selected("backup-create-categories");
  if (!categories.length) return status("backup-create-status", "請至少選擇一種資料", true);
  status("backup-create-status", "正在封存…");
  try {
    const result = await window.settings!.backupCreate(categories);
    status("backup-create-status", result ? `完成：${result.fileCount} 個檔案 · ${bytes(result.sizeBytes)}` : "已取消");
  } catch (error) { status("backup-create-status", error instanceof Error ? error.message : String(error), true); }
});

for (const id of ["backup-auto-enabled", "backup-retention"]) document.getElementById(id)?.addEventListener("change", async () => {
  const enabled = (document.getElementById("backup-auto-enabled") as HTMLInputElement).checked;
  const retention = (document.getElementById("backup-retention") as HTMLSelectElement).value === "30" ? 30 : 7;
  await window.settings!.backupSaveConfig({ autoEnabled: enabled, retentionDays: retention });
  await load();
});

document.getElementById("backup-pick-btn")?.addEventListener("click", async () => {
  try {
    selectedBackup = await window.settings!.backupPickInspect();
    if (!selectedBackup) return;
    document.getElementById("backup-preview")?.classList.remove("is-hidden");
    document.getElementById("backup-preview-date")!.textContent = new Date(selectedBackup.createdAt).toLocaleString("zh-TW");
    document.getElementById("backup-preview-summary")!.textContent = `${selectedBackup.fileCount} 個檔案 · ${bytes(selectedBackup.sizeBytes)} · v${selectedBackup.appVersion}`;
    const container = document.getElementById("backup-restore-categories");
    container?.replaceChildren(...selectedBackup.categories.map((category) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox"; input.value = category.id; input.checked = true;
      label.append(input, `${category.label} · ${category.fileCount}`);
      return label;
    }));
  } catch (error) { status("backup-restore-status", error instanceof Error ? error.message : String(error), true); }
});

document.getElementById("backup-restore-btn")?.addEventListener("click", async () => {
  if (!selectedBackup) return;
  const categories = selected("backup-restore-categories");
  if (!categories.length) return status("backup-restore-status", "請至少選擇一種資料", true);
  if (!window.confirm("還原前會先自動備份目前資料。確定要繼續嗎？")) return;
  try {
    const result = await window.settings!.backupRestore({ filePath: selectedBackup.filePath, categories });
    status("backup-restore-status", `已還原 ${result.restoredFiles} 個檔案`);
    document.getElementById("backup-restart-callout")?.classList.remove("is-hidden");
  } catch (error) { status("backup-restore-status", error instanceof Error ? error.message : String(error), true); }
});

document.getElementById("security-restart-btn")?.addEventListener("click", () => window.settings?.securityRestartApp());
