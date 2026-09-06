# 项目状态（PROJECT_STATE）

> 更新日期：2026-09-06

## 当前阶段

- 阶段：**实现阶段（切片 3b 完成）**
- 状态：切片 3b 已跑通——Celery + Redis（broker）异步队列替换进程内线程 worker；上传后 `run_conversion.delay(task_id)` 投递，任务状态落库跨进程一致；API 投递失败标记 failed 并返回 503；质量闸门全绿（ruff/mypy/pytest）
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

1. 切片 4：更多格式与本地 Wasm 转换引擎
2. docker-compose 部署切片：含 sweeper 定时清扫（超时未下载的临时文件与过期记录）

## 本地运行（开发）

- API：`cd backend && uv run uvicorn app.main:app --port 8010`（需先 `uv run alembic upgrade head` 建表；`.env` 或环境变量设 DATABASE_URL / REDIS_URL）
- Worker：`cd backend && uv run celery -A app.workers.celery_app worker -P solo -l info`（Windows 需 `-P solo`，prefork 不支持）
- 测试：无需 Redis（conftest 设 `CELERY_TASK_ALWAYS_EAGER=1` 同步执行）