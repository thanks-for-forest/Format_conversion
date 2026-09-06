# 项目状态（PROJECT_STATE）

> 更新日期：2026-09-06

## 当前阶段

- 阶段：**开发规范**
- 状态：PRD v0.3 定稿；ARCH v0.3 定稿；CONVENTIONS v0.1 已产出

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

1. 定开发规范（命名、文件大小上限、质量闸门）
2. 初始化仓库 + CI（lint/typecheck/测试）
3. 实现第一个端到端切片：页面打开 → 上传 → 服务端转换 → 下载