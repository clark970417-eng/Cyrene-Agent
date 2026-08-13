# 永晝花庭

Cyrene-Agent 的雲端城市入口。城市狀態保存在 Cloudflare D1；每次重新進入時，系統會依照最後結算時間補上離線期間，因此網頁關閉後城市仍會繼續前進。

## 本機啟動

需要 Node.js 22.13 以上版本。

```bash
npm install
npm run dev
```

## 驗證

```bash
npm test
```

城市資料結構位於 `db/schema.ts`，時間推進規則位於 `lib/city.ts`，雲端讀寫入口位於 `app/api/city/route.ts`。
