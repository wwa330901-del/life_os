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

## CI / 自動發版

- `.github/workflows/ci.yml`：每次 push/PR 到 master，自動跑後端 `tsc`+`build`+`jest`、前端 `flutter analyze`+`test`。
- `.github/workflows/release.yml`：push `vX.Y.Z` 格式的 tag（例如 `git tag v2.11.0 && git push origin v2.11.0`）就會自動 build＋打包安裝檔＋建立 GitHub Release，版本號直接從 tag 帶入——不需要、也不應該手動改 `pubspec.yaml`／`installer/life_os.iss` 裡的版本號（那兩個檔案裡的版本號只是本機開發用的預設值，實際發版時會被 CI 覆蓋）。

### 選用：錯誤追蹤（Sentry）

後端／前端都已經接好 Sentry SDK，但**預設關閉**（沒有 DSN 就完全不會初始化、不會送出任何資料）。要打開：

1. 去 [sentry.io](https://sentry.io) 建立帳號＋一個 Node/NestJS 專案、一個 Flutter 專案（各自會給一組 DSN）。
2. 後端：把 Node 專案的 DSN 填進 Render 後台 `life-os-api` 服務的環境變數 `SENTRY_DSN`，儲存並重新部署。
3. 前端：把 Flutter 專案的 DSN 加進這個 repo 的 GitHub Secrets，名稱 `SENTRY_DSN_FLUTTER`（Settings → Secrets and variables → Actions）——下一次 push tag 觸發的自動發版就會把它編進安裝檔裡。

## 目前已完成

- 帳號註冊 / 登入（JWT、Google 登入）
- 個人空間 + 行事曆空間自動/按需建立
- 記帳（含借貸/代墊/定期交易/淨資產趨勢）、投資（股票）、代辦事項、行事曆（含 Google/iCloud 同步、共用行事曆）、知識庫（AI 內容分析）、AI 問答、好友
- API 一律要求登入驗證，空間存取權限在後端檢查（不是前端隱藏按鈕）

## 目前狀態（2026-09-29）

`life_os` 原本是個人／公司共用的整合平台，依顧問文件規劃了 8 大模組＋2 項橫向基礎建設，其中 6 大模組＋2 項橫向建設（專案管理、成控、簽核、財務/請付款、CRM、工程執行紀錄、權限架構、監控儀表板）已完成並進入大測試。

**2026-09-29 決議：公司空間相關的一切（上述模組全部）已從這個 repo 拆出封存，`life_os` 之後只作為個人軟體存在**（記帳、投資、代辦事項、行事曆、知識庫、AI 問答）。完整版（含公司空間）保留在 git 分支 `archive/company-space-v2.9.36`，之後若要重啟公司那條線，從該分支挖回來即可。原規劃的模組 7（知識管理與新人培訓／SOP中心）、8（人資系統）從未開始撰寫，隨此次拆分一併不再規劃於本 repo。
