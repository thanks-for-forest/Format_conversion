# 项目状态（PROJECT_STATE）

> 更新日期：2026-09-06

## 当前阶段

- 阶段：**实现阶段（端到端切片 1 完成）**
- 状态：切片 1 已跑通——Next.js 页面 → FastAPI 上传 → Pillow PNG→JPG → pass_key 下载（下载即删）；质量闸门全绿（ruff/mypy/pytest/tsc/eslint）

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

1. 切片 2：任务状态机 + Celery/Redis 异步化（pending→queued→running→succeeded/failed）
2. 切片 3：SQLite + SQLAlchemy/Alembic 落库（User/QuotaUsage/ConversionTask），替换内存 TaskStore
3. 切片 4：更多格式与本地 Wasm 转换引擎