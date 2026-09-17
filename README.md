# life_os

人生與企業整合式數位作業平台。個人空間（記帳、投資、學習、旅遊、美食、日記、人生目標）與公司/專案空間共用同一套帳號、權限與後端，Windows 為第一階段完整操作介面，LINE 之後接入作為輕量入口。

規劃文件見 `../new/大系統V1.1.0.md`、`V1.2.0.md`、`V1.3.0.md`。

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

## 目前已完成（第一個切片：平台核心 MVP）

- 帳號註冊 / 登入（JWT）
- 個人空間自動建立
- 公司空間會員關係骨架（`CompanyMembership`，含 OWNER/ADMIN/MEMBER 角色）
- 登入 → 空間選擇（個人 / 境為）→ 首頁 的完整畫面流程
- API 一律要求登入驗證，空間存取權限在後端檢查（不是前端隱藏按鈕）

## 目前狀態（2026-09-17）

上方「目前已完成」與「尚未開始」是最初 MVP 切片階段的紀錄，已過時。依 `Document Form/室內設計-研發工程與系統分析文件.pdf`（顧問文件）定義的 8 大模組 + 2 項橫向基礎建設盤點如下：

- 已完成：1. 專案管理系統、2. 成控系統、3. 簽核系統、4. 財務/請付款系統、5. CRM 雙軌管理、6. 工程執行紀錄系統、A. 權限架構、B. 監控儀表板。這些模組程式碼已完成，目前進入大測試階段。
- **暫停開發**：7. 知識管理與新人培訓（SOP中心/Onboarding）、8. 人資系統（HR）。這兩項是顧問文件原始規劃的模組，尚未開始撰寫任何程式碼，2026-09-17 決議先暫停，之後視情況再排入開發。
