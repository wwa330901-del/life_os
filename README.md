# life_os

個人生活數位作業平台「元序」（記帳、投資、代辦事項、行事曆、收藏、人生目標、旅行、AI 助理）。App 有 Windows 版和安卓平板版；LINE 是日常主要入口（直接講話給 AI、提醒、早報、回顧）。

規劃文件見 `../new/大系統V1.1.0.md` 起的各版本紀錄。

## 結構

```text
life_os/
├── apps/
│   ├── api/          NestJS + Prisma + PostgreSQL
│   └── windows_app/  Flutter App（Windows＋安卓平板）
└── docker-compose.yml  本機 PostgreSQL
```

LINE 的程式在 `apps/api/src/line/`（2026-11-22 拆檔，每檔 800 行以內）：

| 檔案 | 負責 |
|---|---|
| `line.service.ts` | 收 webhook、依訊息內容分派給下面各檔 |
| `line-reply.service.ts` | 回訊息（文字、按鈕、輸入中動畫）、下載使用者傳的檔案 |
| `line-ai.service.ts` | 交給 AI 的對話（含確定／取消按鈕）、照片 |
| `line-finance-commands.service.ts` | 記帳、轉帳、財務總覽 |
| `line-loan-commands.service.ts` | 借貸、代墊 |
| `line-stock-commands.service.ts` | 股票 |
| `line-todo-commands.service.ts` | 代辦、提醒按鈕（完成／延後）、人生目標 |
| `line-calendar-commands.service.ts` | 行事曆 |
| `line-knowledge.service.ts` | 收藏（連結、文字、影片、展覽） |
| `line-linking.service.ts` | 綁定帳號 |
| `line-shared.ts` | 共用的常數、說明文字、「看不懂」的回覆 |

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

## 目前狀態（2026-11-22）

- 「每項到 90 分」計畫第 1～5 階段完成：自動備份＋還原演練、真 AI 測試（`ai-eval.yml`）、金鑰加密 v2、App 流程測試、三種版面＋新手引導、35 套外觀、LINE 確認按鈕／提醒總覽／早報防忘、AI 費用警告。
- AI 費用：每小時估算本月 Claude＋Gemini 合計，到 20 美金 LINE 通知管理員、30 美金嚴重警告（AI 不會停），見 `apps/api/src/admin/ai-usage-admin.service.ts`。
- 下一步：觀察 8 週後再做一次軟體健檢（`docs/軟體健檢/`）。

## 2026-09-29 狀態

`life_os` 原本是個人／公司共用的整合平台，依顧問文件規劃了 8 大模組＋2 項橫向基礎建設，其中 6 大模組＋2 項橫向建設（專案管理、成控、簽核、財務/請付款、CRM、工程執行紀錄、權限架構、監控儀表板）已完成並進入大測試。

**2026-09-29 決議：公司空間相關的一切（上述模組全部）已從這個 repo 拆出封存，`life_os` 之後只作為個人軟體存在**（記帳、投資、代辦事項、行事曆、知識庫、AI 問答）。完整版（含公司空間）保留在 git 分支 `archive/company-space-v2.9.36`，之後若要重啟公司那條線，從該分支挖回來即可。原規劃的模組 7（知識管理與新人培訓／SOP中心）、8（人資系統）從未開始撰寫，隨此次拆分一併不再規劃於本 repo。
