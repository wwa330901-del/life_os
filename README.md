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

## 尚未開始

- LINE 串接
- AI 功能
- 記帳、工期管理（reno_pm 甘特圖引擎搬遷）、成本控制等業務模組
- 細緻的角色/欄位權限規則
- Supabase Storage、雲端部署
