# life_os

個人生活數位作業平台（記帳、投資、代辦事項、行事曆、知識庫、AI 問答），Windows 為第一階段完整操作介面，LINE 之後接入作為輕量入口。

規劃文件見 `../new/大系統V1.1.0.md` 起的各版本紀錄。

## 結構

```text
life_os/
├── apps/
│   ├── api/          NestJS + Prisma + PostgreSQL
│   └── windows_app/  Flutter Windows App
└── docker-compose.yml  本機 PostgreSQL
```

## 本機開發環境設定

### 1. 安裝 Docker Desktop

從 https://www.docker.com/products/docker-desktop/ 下載安裝，Windows 上會要求啟用 WSL2（安裝程式會引導）。裝完並確認 Docker Desktop 是執行中的狀態。

### 2. 啟動本機 PostgreSQL

在 `life_os/` 目錄下：

```bash
docker compose up -d
```

### 3. 啟動 API

```bash
cd apps/api
npm install
npx prisma migrate dev --name init
npm run start:dev
```

API 會跑在 `http://localhost:3000`。

### 4. 啟動 Windows App

```bash
cd apps/windows_app
flutter pub get
flutter run -d windows
```

## 目前已完成

- 帳號註冊 / 登入（JWT、Google 登入）
- 個人空間 + 行事曆空間自動/按需建立
- 記帳（含借貸/代墊/定期交易/淨資產趨勢）、投資（股票）、代辦事項、行事曆（含 Google/iCloud 同步、共用行事曆）、知識庫（AI 內容分析）、AI 問答、好友
- API 一律要求登入驗證，空間存取權限在後端檢查（不是前端隱藏按鈕）

## 目前狀態（2026-09-29）

`life_os` 原本是個人／公司共用的整合平台，依顧問文件規劃了 8 大模組＋2 項橫向基礎建設，其中 6 大模組＋2 項橫向建設（專案管理、成控、簽核、財務/請付款、CRM、工程執行紀錄、權限架構、監控儀表板）已完成並進入大測試。

**2026-09-29 決議：公司空間相關的一切（上述模組全部）已從這個 repo 拆出封存，`life_os` 之後只作為個人軟體存在**（記帳、投資、代辦事項、行事曆、知識庫、AI 問答）。完整版（含公司空間）保留在 git 分支 `archive/company-space-v2.9.36`，之後若要重啟公司那條線，從該分支挖回來即可。原規劃的模組 7（知識管理與新人培訓／SOP中心）、8（人資系統）從未開始撰寫，隨此次拆分一併不再規劃於本 repo。
