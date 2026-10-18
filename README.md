# Gym Assistant Coach

透過 LINE 官方帳號使用的健身助理：記錄訓練、拍照記錄飲食、AI 菜單與飲食建議，之後加入教練約課與附近餐廳推薦。

- 設計規格：[docs/specs/2026-10-15-gym-assistant-coach-design.md](docs/specs/2026-10-15-gym-assistant-coach-design.md)

## 專案結構

| 路徑              | 內容                                                 |
| ----------------- | ---------------------------------------------------- |
| `apps/api`        | Node.js API（Fastify + TypeScript）                  |
| `apps/liff`       | LIFF 前端（React + Vite + TypeScript）               |
| `apps/bot`        | LINE Bot 服務（Python + FastAPI，uv 管理）           |
| `packages/shared` | api 與 liff 共用的型別（只含原始碼，由打包工具編入） |

## 開發環境

- Node.js 24 以上（`.nvmrc`），npm workspaces
- [uv](https://docs.astral.sh/uv/)（會自動安裝 Python 3.12）

```sh
# Node（api、liff、shared）
npm install
npm run lint && npm run typecheck && npm test && npm run build
npm run dev -w @gac/api     # http://localhost:8080/health
npm run dev -w @gac/liff

# Python（bot）
cd apps/bot
uv sync
uv run ruff check . && uv run ruff format --check . && uv run pytest
uv run uvicorn app.main:app --reload --port 8081
```

## 部署

GCP 基礎設施、CI/CD 與 Neon 設定步驟見 [infra/README.md](infra/README.md)。
