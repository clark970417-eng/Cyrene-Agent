# 昔漣桌面陪伴系統・個人擴充版

> 一個以 Electron、TypeScript 與 Live2D 建構的桌面 AI 陪伴系統，整合對話、長期記憶、語音、工具調用、跨平台訊息與互動式生活空間。

![專案預覽](./preview.png)

## 專案定位

這個 repository 是我基於 [Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent) 持續開發的個人擴充版本。原專案提供了 Live2D 桌面角色、AI 對話、記憶、語音與工具系統等重要基礎；我在此基礎上重新整理介面與互動流程，並加入遊戲房、工作空間、離線語音辨識、安全備份、Discord、雲端城市、Discord Activity、記憶視覺化與日常陪伴等功能。

本專案不是從零開始的獨立作品。原始程式依 MIT License 使用，原作者與素材來源列在本文末尾的「來源、授權與聲明」。

## 我在這個版本中的主要擴充

### 1. 整合式工作空間

- 建立新的 Workspace 介面，把聊天、模型狀態、連線狀態、工作階段與功能入口集中在同一個視窗。
- 加入工作階段列表、模型／推理模式切換、使用統計與即時狀態同步。
- 整合筆記本、遊戲房、記憶頁面、Discord 設定與畫板等子系統。

### 2. 遊戲房與互動內容

- 新增遊戲房與統計紀錄，讓 Live2D 角色能依遊戲結果播放反應。
- 包含共鳴配對、井字棋、猜拳、翻牌記憶、四子棋、二十問、真心話卡、接續故事、昔漣問答與 Ropebound 繩索合作闖關等內容。
- 新增 Ropebound Discord Activity 版本，支援在 Discord 內開啟合作遊戲，並透過 Supabase Realtime 同步房間與 Player 2 操作。
- 將勝負、平手與遊玩次數保存在本機，形成可延續的互動紀錄。
- 新增獨立遊戲攻略模式，能依中英文問題切換語言，整理配隊、關卡打法與攻略來源。

### 3. 筆記本、畫板與內容工具

- 新增支援 Markdown 分頁、章節導覽與翻頁效果的雙頁筆記本。
- 共同筆記本可自動收錄 Discord 一起聽過的歌曲與完成事項，並在內容變更後即時重新整理。
- 新增繪圖／圖片生成介面，支援提示詞整理、免費圖片來源與可配置的生成服務。
- 新增專用學習模式，可依中英文問題切換語言，以 Markdown、LaTeX 與來源查證輔助學術解題。
- 新增 AI 出題考試介面，可選科目、題數與推理強度，並提供計時、答題解析、成績與錯題回顧。
- 強化文件、PDF、試算表與簡報相關工具，讓代理能處理更多實際工作。
- 新增永晝花庭雲端城市入口，使用持久化資料與離線時間結算，讓城市在重新進入時延續成長狀態。

### 4. 更完整的代理、記憶與陪伴行為

- 新增 Agent Activity 記錄與摘要，追蹤工具執行的成功、失敗、拒絕與耗時，同時遮蔽敏感欄位。
- 新增記憶圖譜檢視，將人物、地點、事件與長期記憶整理成節點與關係。
- 新增早安、午後關心與晚安三種每日儀式，可結合近期記憶、待辦與天氣。
- 加入安靜時段與主動開場策略，降低不合時宜的打擾。
- 加入桌寵氣泡專用的短回覆整理與長度保護，避免桌面對話被過長內容佔滿。

### 5. 語音、通話與畫面理解

- 新增以 `Xenova/whisper-base` 為基礎的離線語音辨識；模型首次使用時下載，之後保存在本機快取。
- 改善通話中的語音分段、音訊處理與提早播放流程。
- 加入共享畫面上下文判斷，只有在使用者問題確實涉及畫面時才附加影像。
- 擴充多種 TTS／語音服務的設定與測試流程。

### 6. 訊息平台與外部連線

- 新增 Discord Bot adapter，支援頻道白名單、提及判斷、文字分段、附件與 embed 訊息。
- 擴充 Discord Slash Commands、語音通話與狀態查詢，讓使用者可直接聊天、加入或離開語音頻道。
- 新增 Discord 音樂播放，可用歌曲名稱搜尋，並處理 YouTube／Bilibili／SoundCloud／Spotify 連結、播放清單、Bilibili 合集與多分段內容。
- 提供可即時更新的播放器卡片、私人佇列、播放歷史、收藏歌單、下一首預取、感知式音量、分類續播、循環、隨機與自動推薦控制。
- 新增 Spotify Premium 連線與播放控制，可透過 OAuth 授權、歌曲搜尋、Spotify 連結、個人播放清單或作者熱門歌曲播放、切換裝置、上一首／下一首、播放／暫停與音量控制，並以加密方式保存 Client Secret 與 Refresh Token。
- 新增無視窗雲端 Discord Bot 服務，可部署在 Linux 容器中維持文字聊天、`/chat`、`/status`、`/forget` 與健康檢查，電腦關機後仍能保持基本陪伴入口在線。
- 外部訊息與 Discord 顯示文字會統一轉為台灣繁體中文，並保留使用者的原始輸入。
- 持續整合飛書、微信與本機 inbound server，讓同一個代理核心可服務不同聊天入口。
- 對平台能力進行分流，避免不支援的訊息格式或工具被錯誤調用。

### 7. 本機安全與備份

- 使用 Electron `safeStorage` 保護 API Key、Token 與郵件密碼等敏感設定。
- 新增 Secret Vault 狀態檢查、舊資料遷移、遮蔽與保留既有密鑰的流程。
- 新增分類式 `.cybackup` 備份，可選擇對話、記憶、規劃、個人化、知識與設定。
- 還原前自動建立安全備份，並限制檔案數量、路徑與解壓後大小。

### 8. 測試與可靠性

- 專案目前包含 86 個測試檔、572 項測試，涵蓋記憶、排程、工具、頻道、遊戲、語音、安全與 UI 邏輯。
- 對 IPC 資料、共享畫面、備份路徑、訊息長度與代理活動紀錄加入界線檢查。
- 提供 TypeScript 建置、Vitest 測試與 GitHub Actions workflow。

## 原始專案提供的基礎

以下能力主要承接自原始 `Cyrene-Agent`，並在此版本中繼續整合或調整：

- Live2D 桌面角色、表情、動作與口型同步
- 多模型 AI 對話與供應商切換
- 長期記憶、RAG、世界書與關係系統
- MCP、函式調用與內建工具
- 語音辨識、語音合成與通話模式
- 排程任務、待辦與主動訊息
- 飛書、微信等聊天平台整合

## 技術架構

```text
Electron Main Process
├── Agent Orchestrator        # 模型、工具、MCP、上下文與子代理
├── Memory & RAG              # 記憶、實體圖譜、檢索與衝突處理
├── Channels                  # Discord、飛書、微信與 inbound server
├── Voice & Call              # ASR、TTS、通話與畫面上下文
├── Scheduler & Rituals       # 排程、待辦與每日陪伴儀式
├── Security & Backup         # Secret Vault 與分類備份
└── Game / Document Tools     # 遊戲代理與文件工具

Electron Renderer
├── Live2D Desktop Pet
├── Chat / Call / Settings
├── Workspace Dashboard
├── Notebook / Paint
├── Study / Exam
└── Game Room
```

主要技術：

- Electron 43
- TypeScript
- Vite
- Vitest
- PixiJS + `pixi-live2d-display`
- LanceDB、LlamaIndex、BM25 與 Transformers.js
- Discord.js、Lark SDK、WebSocket 與 MCP SDK

## 執行需求

- Node.js `>=24 <25`
- npm `>=10`
- Git
- 可用的 AI 模型 API，或專案支援的本機模型服務

部分原生套件、語音服務與桌面自動化功能具有作業系統相依性。若在不同平台執行，可能需要額外安裝編譯工具、音訊元件或模型檔案。

## 安裝與啟動

```bash
git clone https://github.com/clark970417-eng/My-project-one.git
cd My-project-one
npm ci
npm run dev
```

建立 production build：

```bash
npm run build
```

執行測試：

```bash
npm test
```

## 初次設定

1. 開啟應用程式的「設定」。
2. 選擇模型供應商、Base URL 與模型名稱。
3. 在本機輸入對應的 API Key，儲存後先執行連線測試。
4. 依需求啟用語音、Discord、飛書、微信、本機模型或每日儀式。
5. 第一次啟用離線 Whisper 時，等待模型下載與快取完成。

請勿把 API Key、Bot Token、密碼或包含私密對話的備份提交到 Git。即使 repository 是 Private，也不應把密鑰直接寫進程式碼。

## 資料與隱私

- 模型設定、聊天紀錄、記憶、任務與遊戲統計主要保存在 Electron 的本機 `userData` 目錄。
- 支援的敏感設定會透過作業系統提供的安全儲存能力加密。
- 備份功能預設不應匯出 API Key、Token 或郵件密碼。
- 使用雲端模型、TTS、搜尋、Discord、飛書或微信時，資料會依所選服務的方式傳送；請自行閱讀各服務的隱私政策。

## 專案限制

- 這是一個持續開發中的個人專案，不保證所有模型供應商或平台組合都能直接使用。
- 部分功能需要第三方 API、Bot 權限、本機模型或額外服務。
- 離線 Whisper 首次使用仍需要下載模型。
- GitHub Actions 的分支設定與發佈流程仍需要依 repository 的實際分支策略調整。

## 來源、授權與聲明

### 原始程式

- 上游專案：[Playa-0v0/Cyrene-Agent](https://github.com/Playa-0v0/Cyrene-Agent)
- 原作者：Playa-0v0
- 程式授權：[MIT License](./LICENSE)
- 本 repository 的擴充版本由 [clark970417-eng](https://github.com/clark970417-eng) 維護。

MIT License 允許使用、修改與散布，但原始版權聲明與授權條款必須保留。此 README 明確標示上游來源，也用來區分原始基礎與本版本的擴充內容。

### Live2D 模型

- 模型作者：Bilibili 創作者「是依七哒」
- 原始頁面：[space.bilibili.com/457683484](https://space.bilibili.com/457683484)
- 完整說明：[MODEL_LICENSE.md](./MODEL_LICENSE.md)

模型與角色相關素材不屬於本 repository 維護者。昔漣／Cyrene 的角色名稱、設計與相關智慧財產權屬於 HoYoverse／miHoYo。本專案屬於非官方、非商業的粉絲衍生開發，與 HoYoverse／miHoYo 無隸屬或背書關係。

## 學習與作品集說明

此專案展示的是在既有開源系統上進行閱讀、整合、重構、功能擴充、安全設計與測試的能力。若將它用於課程、申請或作品集，應同時附上原始專案連結，並以本 README 的「主要擴充」章節說明自己的實際貢獻。
