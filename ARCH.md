# 架构草案（ARCH）

> 版本：v0.7　关联 PRD v0.3　更新日期：2026-09-06

## 1. 技术栈（定稿）

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | React + **Next.js**（App Router）+ TypeScript | SEO 落地页需 SSG/SSR，纯 SPA 空 HTML 不利于搜索引流 |
| 后端 | Python + FastAPI | REST API，ASGI |
| 图片本地转换 | Canvas + `@jsquash/*`（WebP/AVIF 编解码） | 简单格式 Canvas，高质量/新格式走 wasm |
| 音视频本地转换 | `@ffmpeg/ffmpeg` + `@ffmpeg/core`（WASM） | 小文件浏览器端转，不上传 |
| 压缩包本地 | fflate / JSZip | ZIP/TAR/TAR.GZ |
| 服务端转换 | ffmpeg / LibreOffice（子进程调用） | 大文件与复杂格式 |
| 异步任务 | Celery + Redis | 转换长任务解耦、可重试 |
| 数据库 | SQLite（SQLAlchemy + Alembic，**WAL 模式**） | MVP 单机；WAL 缓解多进程写锁；Alembic 平滑迁 PostgreSQL |
| 缓存 | Redis | 验证码、匿名配额、限流、任务进度（不持久化） |
| 入口 | Nginx | 统一入口，`/api` 反代 FastAPI，其余走 Next.js |
| 部署 | 单机 Docker Compose | 一条命令起全栈 |

## 2. 目录分层

```
Format_conversion/
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # 转换首页
│   │   ├── login/             # 登录
│   │   ├── account/           # 配额/我的
│   │   ├── convert/[a-to-b]/  # SEO 落地页（generateStaticParams 静态生成）
│   │   ├── terms/ privacy/    # 合规页
│   │   ├── components/
│   │   ├── lib/convert/       # 本地转换引擎封装（wasm）
│   │   └── locales/           # i18n（zh/en，locale 前缀路由）
├── backend/
│   ├── app/
│   │   ├── main.py            # 入口、路由挂载、中间件
│   │   ├── api/               # 路由层：auth / convert / tasks / quota
│   │   ├── core/              # 配置、安全、依赖注入
│   │   ├── models/            # SQLAlchemy 模型
│   │   ├── schemas/           # Pydantic 校验
│   │   ├── services/          # 编排、配额、邮件、内容审核、魔数校验
│   │   ├── workers/           # Celery 任务
│   │   └── utils/             # 文件清理、签名 URL、安全
│   ├── alembic/
│   └── tests/
├── nginx/nginx.conf
├── docker-compose.yml
├── PRD.md / ARCH.md / PROJECT_STATE.md
└── README.md
```

## 3. 核心模块

| 模块 | 职责 |
|------|------|
| 本地转换引擎 | 前端按大小/类型本地处理，产出 Blob 直接下载 |
| 上传与路由判断 | 按「类别白名单 + 大小阈值」判定本地 or 服务端 |
| 转换服务 | 服务端调用 ffmpeg / LibreOffice，产出结果文件 |
| Celery Worker | 异步转换、超时、重试、并发限流 |
| 身份与鉴权 | 邮箱验证码登录、JWT 会话、配额归属 |
| 配额服务 | 次数/流量计数（口径见下） |
| 内容安全审核 | 上传文件违规检测，命中即拒绝 |
| 邮件服务 | 验证码下发（密钥走环境变量） |
| 文件生命周期 | 临时目录 → 转换 → 下载 → 立即删除 → 兜底清扫 |

**配额口径**：本地转换不计「流量」（不上传），但计「次数」；服务端转换计「次数 + 流量」（流量=上传体积）。

**路由判定（默认阈值，可调）**：

| 类别 | 默认走本地 | 其余走服务端 |
|------|-----------|--------------|
| 图片 / 压缩包 | 全部本地 | 高分辨率或有损优化 |
| 音频 | ≤ 50MB | > 50MB |
| 视频 | ≤ 20MB | > 20MB |
| 文档 | 纯文本/MD/表格 | Office/PDF（LibreOffice） |

## 4. 数据模型（核心表）

```
User            id, email(唯一), created_at
QuotaUsage      id, user_id, date, conversion_count, traffic_bytes
ConversionTask  id, user_id(nullable), pass_key(匿名任务凭证), task_type, status,
                source_format, target_format, in_size, out_size,
                error_msg, created_at, finished_at
```

- 验证码、匿名配额、限流计数、任务进度：存 **Redis**（带 TTL）。
- 任务**终态与结果路径落 DB**，Redis 仅做 broker/进度，重启不丢结果。
- **匿名任务防遍历**：登录用户按 `user_id` 归属；匿名用户凭随机 `pass_key`（UUID，随创建返回）反查任务，缺失则凭不可猜 key 拒绝访问。

## 5. 哪些逻辑必须在服务端（不可下沉前端）

- **鉴权与配额校验**：前端只做提示，最终强制校验在后端（防绕过）。
- **密钥与邮件/内容审核**：第三方 API 密钥只用环境变量，仅后端调用。
- **文件类型/魔数强制**：服务端必须再做魔数 + 白名单校验。
- **复杂/大文件转换**：LibreOffice 文档、大视频 ffmpeg 转码。
- **文件清理**：临时文件由服务端定时清扫。

## 6. 任务状态机

```
rejected(审核/配额拦截)  ←─ 上传
                          ↓
        pending → queued → running → succeeded | failed | cancelled
```

- `rejected`：魔数/白名单/配额/内容审核任一不过，不进入队列。
- 进度：Worker 把百分比写 Redis（TTL），前端轮询 `GET /tasks/{id}` 读取。
- 终态：`succeeded/failed` 落 DB，`failed` 带 `error_msg` 可重试。

## 7. REST API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/send-code` | 发邮箱验证码（限流） |
| POST | `/api/auth/verify` | 验证码换 token（httpOnly cookie） |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 + 配额余量 |
| POST | `/api/convert` | 上传文件 + 参数 → 返回 task_id（匿名另返 pass_key） |
| GET | `/api/tasks/{id}` | 状态/进度 |
| POST | `/api/tasks/{id}/cancel` | 取消任务 |
| GET | `/api/tasks/{id}/download` | 短时签名 URL 下载 |

## 8. 鉴权流程

1. 发码：`send-code` 校验邮箱 + 限流 → 验证码存 Redis（TTL 5min）。
2. 校验：`verify` 通过 → 签发 `access`(15min) + `refresh`(7d) JWT。
3. 存储：均 httpOnly + SameSite Cookie，前端不触碰 token；access 过期用 refresh 轮换。
4. CSRF：同源部署 + SameSite 策略，写操作校验 CSRF token/Origin。

## 9. 转换流程（端到端）

1. 用户选文件 + 目标格式 → 前端做大小/类型预检。
2. 判定本地可转 → wasm 转换 → 直接下载，**全程不上传**。
3. 判定需服务端 → 上传（经 Nginx 直连 FastAPI，流式落盘，不全读内存）→ 后端做魔数/白名单/配额/内容审核（fail-closed）。
4. 通过 → 写 ConversionTask → 投递 Celery → Worker 用 ffmpeg/LibreOffice 转换。
5. 前端轮询进度 / 可取消 → 完成后经签名 URL 下载 → 删除该文件；未下载的由定时任务兜底清扫。

## 10. 安全与资源隔离

- **子进程隔离**：ffmpeg/LibreOffice 在 Worker 容器内以子进程运行，设单任务超时 + `kill`。
- **LibreOffice 并发**：每任务独立 `UserInstallation` profile 目录，避免多实例锁冲突。
- **资源上限**：Worker 并发数、单容器 CPU/内存限额（compose `mem_limit`/`cpus`）。
- **文件名安全化**：上传/输出去原始文件名，改用 UUID，防路径穿越。
- **上传流式落盘**：multipart 流式写临时文件，避免 200MB 全载内存。
- **SQLite WAL**：开 WAL + `busy_timeout`，缓解 uvicorn 与 worker 多进程写锁。
- **防 zip bomb**：解压前做解压比、条数/大小上限检查。
- **魔数 + 白名单**：扩展名 + magic number 双重校验；SVG 等文本格式做 XML 消毒（禁外部实体/内联脚本）。
- **内容审核 fail-closed**：审核服务超时/异常 → 拒绝本次转换并提示重试（宁可误拒不漏放）。
- **下载安全**：任务完成生成 HMAC 签名 + 短时过期 URL，不暴露真实路径；匿名任务校验 pass_key。
- **限流**：验证码/上传/转换接口按 IP + 账号限流（Redis 计数）。

## 11. 部署拓扑（docker-compose）

| 服务 | 容器 | 说明 |
|------|------|------|
| nginx | nginx | 统一入口；`/api` 反代 backend（`client_max_body_size 200m`），其余走 frontend |
| web | frontend (Next.js) | SSR/SSG 页面，不做大文件代理 |
| api | backend (uvicorn) | FastAPI 业务 |
| worker | backend-worker | Celery，含 ffmpeg + LibreOffice，设资源限额 |
| redis | redis | 队列 + 缓存 |
| sweeper | backend-cron | 定时清扫超时未下载的临时文件与过期记录 |

- 邮件服务、内容审核、数据库路径等敏感项走 `.env`（不进仓库）。

## 12. CI 与质量闸门

- **后端**：Ruff（lint+format）、Mypy、Pytest；pre-commit 钩子。
- **前端**：ESLint + Prettier + TypeScript `tsc`；构建通过才算成功。
- **CI**：GitHub Actions 跑 lint / typecheck / 单测；SQLite 内存测试。
- **敏感检查**：gitleaks/git-secrets 防密钥入库。

## 13. 迭代记录（每次迭代记录原因）

| 版本 | 决策 | 原因 |
|------|------|------|
| v0.1 | SQLite + Celery/Redis + Docker Compose + Next.js | 轻量起步可验证；Celery 隔离长任务；Next.js 满足 SEO SSR；SQLite 可平滑迁 PostgreSQL |
| v0.2 | 加 Nginx、鉴权/状态机/API/安全隔离/CI | 大文件经 Next.js 代理是坑；安全与质量闸门未落地 |
| v0.3 | 加匿名 pass_key、兜底清扫、fail-closed、配额口径、WAL、流式落盘、SVG 消毒、LibreOffice profile | 二审修正数据正确性与应用安全细节 |
| v0.4 | 切片2 以进程内后台线程实现异步队列（5 态状态机），Celery+Redis+SQLite 合并延后到切片3 | Celery worker 是独立进程，无法读写 API 进程内存 TaskStore；先落库再上 Celery 才能保证状态跨进程一致 |
| v0.5 | 切片3a：SQLite+SQLAlchemy/Alembic 落库 ConversionTask 替换内存 TaskStore（WAL、惰性引擎、session-per-operation DAO），文件路径改为 id+格式派生属性不落库；Celery+Redis 延后到切片3b | 先落库再上 Celery 的中间态；路径可按 `{id}.{format}` 确定性重建，避免冗余路径列 |
| v0.6 | 切片3b：Celery+Redis（broker）替换进程内线程 worker；任务状态仍落 DB（不启用 result backend）；API 投递前 mark_queued，投递失败标记 failed 并 503；测试与 CI 用 `CELERY_TASK_ALWAYS_EAGER=1`，无需真实 Redis | 状态已落库，worker 独立进程可读写同一 DB 保持一致；eager 模式让单测无外部依赖；broker 不可用须显式失败提示用户重试 |
| v0.6.1 | 真实 broker 验证（WSL2 + docker redis:7）修复：Celery 实例加 `include=["app.workers.convert_task"]`；pyproject 补声明 pillow/python-multipart；conftest 先设 env 再 import app | worker 不会自动发现任务模块，缺 include 则消息积压不执行（真实验证暴露）；两依赖本地靠 venv 遗留、CI 全新安装必失败；config 导入期固化导致测试污染真实 DB |
| v0.7 | 切片4a：新增 `core/formats.py` 格式注册表（扩展名/魔数签名/PIL名/MIME 唯一来源），服务端图片互转扩为五进三出（png/jpg/webp/bmp/gif → png/jpg/webp）；魔数签名支持多段偏移（WebP RIFF+WEBP、GIF 双版本）；转换按表驱动（JPG 压平 RGB、WebP/PNG 保留 Alpha）；前端抽 `app/lib/api.ts` 并加目标格式下拉（排除同格式） | 硬编码双 if 白名单不可扩展；签名表可测试且新格式只需加一行注册；JPEG 不支持 Alpha 必须压平；file ≤250 行约束促成了 API 客户端与 UI 分离，为 4b 本地引擎复用做准备 |