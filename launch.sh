#!/bin/bash

# 設定環境變量，確保 GUI 啟動時能找到 npm 和 node
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# 建立日誌資料夾（如果不存在）
mkdir -p "/Users/clark/Library/Application Support/live2d-cyrene/logs"

# 1. 檢查 GPT-SoVITS 是否已在運行 (port 9880)
if ! lsof -i :9880 > /dev/null 2>&1; then
    echo "Starting GPT-SoVITS..."
    cd /Users/clark/GPT-SoVITS
    PYTHONUNBUFFERED=1 PATH="/Users/clark/bin:$PATH" /Users/clark/GPT-SoVITS/venv/bin/python api_v2.py -a 127.0.0.1 -p 9880 > "/Users/clark/Library/Application Support/live2d-cyrene/logs/gptsovits-startup.log" 2>&1 &
    # 等待 2 秒讓服務啟動
    sleep 2
fi

# 2. 啟動桌寵
cd /Users/clark/cy
npm run dev > "/Users/clark/Library/Application Support/live2d-cyrene/logs/electron.log" 2>&1
