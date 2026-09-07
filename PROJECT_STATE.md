# 项目状态（PROJECT_STATE）

> 更新日期：2026-09-07

## 当前阶段

- 阶段：**实现阶段（切片 5b 完成：每日配额闭环）**
- 状态：切片 5b 已跑通——quota_usage 表（0003 迁移）、`services/quota.py` 分层配额（登录 SQLite 日表 / 匿名 Redis 按 IP）、`/api/convert` 分层单文件限额 + 配额预检扣减（429 带重置时间）、`/api/quota/summary|local-count` 端点、本地转换计次不计流量、前端 useQuota + AuthBar 配额展示 + QuotaHints 超额预检（禁用按钮）；pytest 39 用例全绿；浏览器验证闭环（0/5 → 本地转计次 → 5/5 触发红字提示 + 按钮禁用）
- 本片修复：SQLite `BIGINT PRIMARY KEY` 非行id别名不自增（用 `BigInteger().with_variant(Integer,"sqlite")`）；`.env` FRONTEND_ORIGIN 与前端实际端口不一致 → CORS 拦截但服务端照记 200（易误判前端 bug）
- 验证：已在 WSL2 Ubuntu（docker redis:7 容器）完成真实 broker 端到端验证——uvicorn 上传 → Celery 投递 → 独立 worker 进程消费 → running/succeeded → 下载 JPEG（魔数 ff d8 ff 正确）
- 真实验证暴露并修复 3 处问题：① celery_app 缺 `include=["app.workers.convert_task"]`（worker 不注册任务，消息积压不执行）；② pillow / python-multipart 未在 pyproject 声明（本地靠 venv 遗留，CI 全新安装必失败）；③ tests/conftest.py 在设 env 前 import app（config 固化为默认值，测试污染真实 data/app.db）

## 已固化决策

- 产品：公开免费文件格式转换网站
- 格式类别：图片 / 文档 / 音视频 / 压缩包及其他
- 转换方式：混合模式（本地优先 + 服务端兜底）
- 用户系统：邮箱验证码登录 + 配额
- 单文件上限：匿名 ≤50MB、登录 ≤200MB
- 文件保留：处理完即删
- 技术栈：React(Next.js) + FastAPI；本地 Wasm + 服务端 ffmpeg/LibreOffice
- 异步任务：Celery + Redis；数据库：SQLite（Alembic 可迁 PostgreSQL）；部署：单机 Docker Compose

## 下一步

1. 切片 6a：account 页（我的配额）或 SEO 落地页 convert/[a-to-b]
2. docker-compose 部署切片：含 sweeper 定时清扫（超时未下载的临时文件与过期记录）
3. 切片 6+：压缩包（fflate 本地）/ 文档（LibreOffice）/ 音视频（ffmpeg.wasm + 服务端）类别

## 本地运行（开发）

- 前置：本机 Redis 经 WSL docker（`wsl -d Ubuntu -u root -e bash -lc "docker start fc-redis"`）；**WSL 空闲会自动关机**，需挂常驻进程（如 `wsl -d Ubuntu -u root -e bash -lc "while true; do sleep 3600; done"` 后台运行）
- API：`cd backend && uv run uvicorn app.main:app --port 8000`（须用 8000 或设 `NEXT_PUBLIC_API_BASE`——前端默认指向 `localhost:8000`；首次需 `uv run alembic upgrade head` 建表；无 Redis worker 时加 `$env:CELERY_TASK_ALWAYS_EAGER="1"` 同步执行）
- Worker：`cd backend && uv run celery -A app.workers.celery_app worker -P solo -l info`（Windows 需 `-P solo`，prefork 不支持）
- 前端：`cd frontend && pnpm dev`（WSL grafana 占用 3000 时用 `$env:PORT="3100"`，后端同步设 `FRONTEND_ORIGIN=http://localhost:3100`）
- 测试：需 Redis 在线（conftest 用 REDIS_URL/1 库；本地转发不稳可设 `TEST_REDIS_URL` 指向 WSL IP）