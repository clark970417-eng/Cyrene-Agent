#!/bin/bash

set -u

readonly CYRENE_PROJECT_ROOT="/Users/clark/cy-integration"
readonly CYRENE_LEGACY_ROOT="/Users/clark/cy"
readonly CYRENE_LOG_DIR="${HOME}/Library/Logs/Cyrene-Agent"
readonly CYRENE_LOG_FILE="${CYRENE_LOG_DIR}/launcher.log"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "${CYRENE_LOG_DIR}"

if pgrep -f "${CYRENE_PROJECT_ROOT}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" >/dev/null 2>&1; then
  exit 0
fi

legacy_pid="$(pgrep -f "${CYRENE_LEGACY_ROOT}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" | head -n 1 || true)"
if [ -n "${legacy_pid}" ]; then
  kill -TERM "${legacy_pid}" 2>/dev/null || true
  for _attempt in 1 2 3 4 5; do
    kill -0 "${legacy_pid}" 2>/dev/null || break
    sleep 0.2
  done
fi

if [ ! -d "${CYRENE_PROJECT_ROOT}/node_modules" ]; then
  printf '[%s] Missing node_modules; run npm ci in %s first.\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${CYRENE_PROJECT_ROOT}" >> "${CYRENE_LOG_FILE}"
  exit 1
fi

cd "${CYRENE_PROJECT_ROOT}" || exit 1
printf '[%s] Starting Cyrene from %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${CYRENE_PROJECT_ROOT}" >> "${CYRENE_LOG_FILE}"
# The Dock launcher uses the compiled renderer instead of a Vite development
# server. This prevents an orphaned localhost:5173 process from serving an old
# UI after Electron has been restarted.
nohup /bin/zsh -c '/usr/local/bin/npm run build && exec /usr/local/bin/npm start' >> "${CYRENE_LOG_FILE}" 2>&1 &
