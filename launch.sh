#!/bin/bash

set -u

readonly CYRENE_PROJECT_ROOT="/Users/clark/cy-integration"
readonly CYRENE_LEGACY_ROOTS=(
  "/Users/clark/cy"
  "/Users/clark/Cyrene-Agent"
)
readonly CYRENE_LOG_DIR="${HOME}/Library/Logs/Cyrene-Agent"
readonly CYRENE_LOG_FILE="${CYRENE_LOG_DIR}/launcher.log"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "${CYRENE_LOG_DIR}"

if pgrep -f "^${CYRENE_PROJECT_ROOT}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \\.$" >/dev/null 2>&1; then
  exit 0
fi

for legacy_root in "${CYRENE_LEGACY_ROOTS[@]}"; do
  while IFS= read -r legacy_pid; do
    [ -n "${legacy_pid}" ] || continue
    printf '[%s] Stopping legacy Cyrene process %s from %s\n' \
      "$(date '+%Y-%m-%d %H:%M:%S')" "${legacy_pid}" "${legacy_root}" >> "${CYRENE_LOG_FILE}"
    kill -TERM "${legacy_pid}" 2>/dev/null || true
    for _attempt in 1 2 3 4 5; do
      kill -0 "${legacy_pid}" 2>/dev/null || break
      sleep 0.2
    done
  done < <(pgrep -f "^${legacy_root}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \\.$" || true)
done

if [ ! -d "${CYRENE_PROJECT_ROOT}/node_modules" ]; then
  printf '[%s] Missing node_modules; run npm ci in %s first.\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${CYRENE_PROJECT_ROOT}" >> "${CYRENE_LOG_FILE}"
  exit 1
fi

# TTS is optional for the desktop UI. Start GPT-SoVITS in the background when
# it is installed locally, but never make the workspace wait for port 9880.
if ! lsof -i :9880 >/dev/null 2>&1 && \
   [ -x "/Users/clark/GPT-SoVITS/venv/bin/python" ] && \
   [ -f "/Users/clark/GPT-SoVITS/api_v2.py" ]; then
  printf '[%s] Starting GPT-SoVITS in background.\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "${CYRENE_LOG_FILE}"
  (
    cd "/Users/clark/GPT-SoVITS" || exit 1
    PYTHONUNBUFFERED=1 PATH="/Users/clark/bin:${PATH}" \
      "/Users/clark/GPT-SoVITS/venv/bin/python" api_v2.py -a 127.0.0.1 -p 9880 \
      >> "${CYRENE_LOG_DIR}/gptsovits-startup.log" 2>&1 &
  )
fi

cd "${CYRENE_PROJECT_ROOT}" || exit 1
printf '[%s] Starting Cyrene from %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${CYRENE_PROJECT_ROOT}" >> "${CYRENE_LOG_FILE}"
# The Dock launcher uses the compiled renderer instead of a Vite development
# server. This prevents an orphaned localhost:5173 process from serving an old
# UI after Electron has been restarted.
# Building the entire project here made every Dock launch wait while Vite
# transformed thousands of modules.  The Dock launcher now consumes the
# already-compiled output; a build is only needed for a fresh checkout (or can
# be explicitly requested with CYRENE_FORCE_BUILD=1).
needs_build=0
if [ -f "dist/main/main/index.js" ] && find src/main src/shared -type f -newer "dist/main/main/index.js" -print -quit | grep -q .; then needs_build=1; fi
if [ -f "dist/preload/preload/index.js" ] && find src/preload src/shared -type f -newer "dist/preload/preload/index.js" -print -quit | grep -q .; then needs_build=1; fi
if [ -f "dist/renderer/index.html" ] && find src/renderer src/shared -type f -newer "dist/renderer/index.html" -print -quit | grep -q .; then needs_build=1; fi

if [ "${CYRENE_FORCE_BUILD:-0}" = "1" ] || [ "${needs_build}" = "1" ] || \
   [ ! -f "dist/main/main/index.js" ] || \
   [ ! -f "dist/preload/preload/index.js" ] || \
   [ ! -f "dist/renderer/index.html" ]; then
  printf '[%s] Compiled output missing; building before launch.\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "${CYRENE_LOG_FILE}"
  nohup /bin/zsh -c '/usr/local/bin/npm run build && exec ./node_modules/.bin/electron .' >> "${CYRENE_LOG_FILE}" 2>&1 &
else
  nohup ./node_modules/.bin/electron . >> "${CYRENE_LOG_FILE}" 2>&1 &
fi
