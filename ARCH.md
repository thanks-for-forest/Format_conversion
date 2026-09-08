# 架构草案（ARCH）

> 版本：v0.23.7　关联 PRD v0.3.1　更新日期：2026-09-08

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
| POST | `/api/auth/verify` | 验证码换 token（httpOnly cookie），验证码即注册 |
| POST | `/api/auth/refresh` | refresh 轮换 access（滑动续期） |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/quota/summary` | 配额摘要（已用/限额/重置时刻），前端预检用 |
| POST | `/api/quota/local-count` | 本地转换成功上报计次（不计流量），超限 429 |
| POST | `/api/convert` | 上传文件 + 参数 → 返回 task_id（匿名另返 pass_key）；配额预检并扣减 |
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
| v0.8 | 切片4b：新增 `app/lib/convert.ts` 本地 Canvas 引擎（createImageBitmap + OffscreenCanvas，JPEG 白底压平，quality 85）；路由判定 `canConvertLocally`（源可解码 + 目标可编码 + ≤25MB）本地优先，失败自动回退服务端；完成区显示「转换方式：本地（文件未上传）/服务端」；下载用 blob: URL（重置时 revoke）。浏览器自动化验证：小文件零 /api/convert 请求 + WebP 魔数正确；29MB 大图自动走服务端。教训：`next build` 与 `next dev` 共用 `.next` 会使 dev 路由注册失效（404），切换前需清缓存 | 兑现 PRD「本地优先不上传」核心卖点；Canvas 原生编解码覆盖五进三出无需 wasm 依赖（@jsquash 留给 AVIF）；25MB 阈值防大图撑爆标签页内存 |
| v0.9 | 切片5a：邮箱验证码登录。users 表（0002 迁移）+ `core/security.py`（PyJWT access 15min/refresh 7d，httpOnly+SameSite=Lax Cookie）+ `services/code_store.py`（Redis：验证码 TTL 5min、发送冷却 60s、错误 5 次作废防爆破）+ `services/mailer.py`（开发假发送进日志，生产 smtplib）+ `/api/auth/*` 五端点；前端登录页 + AuthBar 登录态条；CI 后端 job 加 redis service。浏览器验证全链路（未登录→发码→验码→已登录→退出） | 按用户决策坚持 Redis（与 ARCH/生产同构，CI 用 service 容器）；验证码即注册免密码管理；本机教训：WSL 空闲自动关机导致转发「抖动」，需常驻进程占住 VM；WSL grafana 占 3000 端口与 next dev 冲突，可用 PORT=3100 避让 |
| v0.9.1 | 接入真实发信（163 SMTP 授权码）：mailer 按端口自动 SSL(465)/STARTTLS；**发信开关与 ENV 解耦**（配了 SMTP_HOST 即真发，否则假发送）——避免本地为真发切 production 触发 secure-cookie 断掉 HTTP 登录；config 自动加载根目录 `.env`（python-dotenv，不进仓库）；conftest 强制清空 SMTP_HOST 保证测试永不真发 | 163/阿里云推荐 465 SSL 而 STARTTLS 代码连不上；ENV 耦合使本地真发自测不可行；.env 配置后测试会真发邮件（防滥用底线） |
| v0.10 | 切片5b：每日配额。`services/quota.py` 分层配额（登录档走 SQLite quota_usage 日表 + ON CONFLICT 原子累加；匿名档走 Redis `fc:quota:{yyyymmdd}:{ip}` 键含日期当日过期、支持 X-Forwarded-For）；429 文案带 UTC 重置倒计时；`/api/convert` 接入分层单文件限额（匿名 50MB/登录 200MB）与配额预检扣减（413/415 预检不落盘不计次，配额不过不落盘）；`/api/quota/summary|local-count` 两端点；本地转换计次不计流量（前端成功后上报）；前端 useQuota 会话态 hook + AuthBar 配额展示 + QuotaHints 超额提示（预检禁用按钮）与后端 429 双保险。浏览器验证闭环：0/5 → 本地转 1/5 → 连转 5/5 → 红字提示 + 按钮禁用。修复：SQLite 下 `BIGINT PRIMARY KEY` 不作 rowid 别名致自增失败（`BigInteger().with_variant(Integer,"sqlite")`）；同文件并行编辑互相覆盖（改串行）；.env FRONTEND_ORIGIN 与实际前端端口不一致被 CORS 拦截（服务端仍记 200，易误判为前端 bug） | 兑现 PRD 3.4 配额口径；预检 + 429 双保险按用户决策；本地计次不计流量因服务端无流量成本；共享 Redis 客户端抽 `services/redis_client.py` 供 code_store/quota 复用 |
| v0.11 | 切片6a：SEO 落地页 `/convert/[a-to-b]`。`lib/formats.ts` 前端格式单一来源（五进三出 12 组合 + jpeg 别名 + parseCombo）；`generateStaticParams` 预渲染 12 页 + `dynamicParams=false`（非法 slug 直接 404）；`generateMetadata` 按组合生成标题/描述；页面含介绍、转换步骤、其余 11 组合互链（内链 SEO）。组件重构：转换逻辑从 page.tsx 抽出为 `components/Converter.tsx`（支持 lockedSource/lockedTarget 锁定格式：隐藏目标下拉、仅收该来源、提示「本页仅支持 X」）；`components/SiteFrame.tsx` 客户端骨架持有 useQuota 单实例并传 AuthBar/Converter，页面只传可序列化 JSX（heading/below） | 兑现 PRD SEO 引流核心：每组合一页静态 HTML 利于收录；跨服务端/客户端边界不能传函数（render-prop 首选方案 build 失败），改为骨架组件直持 Converter；useQuota 必须单实例否则 AuthBar 与转换器配额状态脱节（5b 教训的泛化） |
| v0.12 | 切片6b：SEO 收尾。`app/sitemap.ts`（构建期静态生成 14 条 URL：首页 1.0 / 12 落地页 0.8 / 登录 0.3）+ `app/robots.txt`（全站允许 + 指向 sitemap）；站点地址走 `lib/site.ts` 的 `SITE_URL`（构建期 env，默认 localhost:3100，生产设正式域名），同步补 `frontend/.env.example`。本地测试素材库 `testdata/`（images/audio/video/docs/archives 12 个真实样例文件，魔数逐一验证，.gitignore 忽略不入库） | sitemap/robots 与落地页配套才能被搜索引擎收录；SITE_URL 用构建期 env 而非 NEXT_PUBLIC_（sitemap 在构建期生成，无需进客户端包）；沙箱 DNS 部分域名不可达，素材源改用 Pillow 测试图库 / MDN / w3.org / calibre / codeload |
| v0.13 | 切片6c：账户与配额页 `/account`。纯前端页复用 useQuota + 既有 `/api/quota/summary`（无后端改动）：次数/流量进度条、单文件上限、本地转换口径、重置时刻（reset_at UTC 转本地时区展示）；匿名态展示当前用量 + 登录引导与两档额度对比；AuthBar 增加「配额」入口、登录后邮箱链接到 /account；400ms 会话探测窗口防未登录闪烁 | 账户页是用户自查配额的必备入口（PRD 配额透明度）；页面不入 sitemap（用户相关页无收录价值）；登录态视图与匿名态共用 QuotaPanel，档位差异全部来自 summary 接口（pytest 已覆盖两档），无需为页面加后端测试 |
| v0.14 | 切片7：docker-compose 部署 + sweeper。后端 `services/sweeper.py`（三类清理：终态超时未下载文件 / 活动态卡死任务标 failed+清残留 / 过期记录删行，全部 UTC 判定）+ `workers/sweep_task.py`（maintenance.sweep）+ celery beat 每 10 分钟调度（SWEEP_INTERVAL_MIN 可配）；pytest +7 用例（46 全绿）。镜像：backend Dockerfile（uv --frozen 装依赖，启动先 alembic upgrade head 再 uvicorn，alembic 移入主依赖）；frontend Dockerfile 三段式（standalone 产物 node server.js，NEXT_PUBLIC_API_BASE 构建期传空串走同源）；next.config 开 output:"standalone"。编排：caddy（/api/*→api:8000，其余→web:3000，SITE_ADDRESS=:80 冒烟/域名自动 HTTPS）+ api/worker/beat（共用 app_data 卷：SQLite+临时文件）+ redis，健康检查 /health | 兑现 PRD 单机 Docker Compose 部署；清扫三条路径补上「下载即删」之外的超时兜底（磁盘安全底线）；pnpm 12 非交互环境对未批准构建脚本直接 ERR_PNPM_IGNORED_BUILDS（onlyBuiltDependencies/ignoredBuiltDependencies 写 pnpm-workspace.yaml 均无效，最后 --ignore-scripts 解决——unrs-resolver 为 napi 预编译包 postinstall 非必需）；冒烟 E2E：上传 30.6KB→worker 转换→下载 6032B 真 JPEG（ffd8ff），summary 匿名档 5 次/100MB 正确 |
| v0.15 | 切片8：压缩包类别（打包+解压双向）。服务端 `services/archive_service.py` + `/api/archive/pack`（多文件→ZIP）与 `/api/archive/extract`（ZIP/TAR.GZ→统一重打包 ZIP 交付）：**同步端点、全程内存、不落盘**（轻 CPU 不必 Celery，任务模型/sweeper 零改动）；防 zip bomb 三重上限（条目≤1000/单条≤128MB/总量≤256MB）+ 路径穿越拒绝 + 同名去重 + 配额同口径（计次+上传字节计流量）。前端 `lib/archive.ts` **零依赖手写**：zip 打包（store+CRC32 表）、zip 解压（EOCD 回扫+central directory+DecompressionStream('deflate-raw')）、tar.gz 解压（gzip 流+512 块解析）——不用 fflate（pnpm 安装受沙箱限制且原生 API 覆盖现代浏览器）；页面 `/archive`（本地优先 >25MB 回退服务端 + 计次/预检）+ 首页入口；pytest +9（55 全绿）；浏览器实测打包/ZIP 138 条目/TAR.GZ 107 条目全部本地完成 | 打包解压轻 CPU，同步端点省掉整套异步链路（架构减法）；解压统一输出 ZIP 让「多文件交付」不破坏单输出任务模型——TAR.GZ→ZIP 是真转换，ZIP→ZIP 为透传重打包；浏览器 zip 解析必须经 central directory 而非顺序扫 local header（local nameLen/extraLen 与 central 可能不一致，须以 local 为准定位数据）；零依赖方案规避了 pnpm 沙箱安装问题，防御逻辑与后端同口径便于测试对照 |
| v0.16 | 安全审计（standard 模式，10/10 维度全覆盖，8 项发现：1H/2M/5L）并修复 6 项。**H1**：`deps.client_ip` 取 XFF 首段（客户端可伪造）→ 匿名配额可用伪造 XFF 无限刷新；改取**最后一跳**（自家反代追加的最可信值）+ 伪造测试（三个不同伪造首段须累计同桶）。**M1**：send-code 仅按邮箱冷却，攻击者换邮箱刷码可耗尽 163 每日发信配额；新增 IP 级小时限流 `fc:sendip:{ip}`（SEND_IP_HOURLY_LIMIT 默认 10/h，先查 IP 桶再占邮箱冷却坑）。**L1**：ENV=production 且 SECRET_KEY 为弱默认值时启动直接 RuntimeError（防公开默认值伪造 JWT）。**L3**：ZIP 路径校验统一为「含 .. 即拒 + basename 白名单」。**L5**：CI frontend job 加 `pnpm audit --prod --audit-level high`。**M2**（部分，文档强化）：部署清单强调生产必设 ENV=production（compose 保持 development 默认便利本地）。接受不改：L2（logout 无服务端令牌作废，免费站口径）、L4（配额 check-then-incr 竞态，代码已声明）。pytest +2 = 57 全绿 | XFF「取首段」是反代部署的经典陷阱——Caddy 追加真实 IP 到**末尾**，取首段等于信任客户端自报；IP 限流必须放邮箱冷却**之前**（否则攻击者不付成本就占坑）；测试设计时「换 IP」要换 XFF 尾段而非首段——首测误把伪造首段当 IP 变量，恰好反向验证了 H1 修复生效；安全加固类改动全部配专项测试锁行为，防回归 |
| v0.17 | 切片9：SEO 落地页扩展至压缩包类别。组件化：`components/ArchivePanel.tsx`（从 archive/page.tsx 抽出功能主体，页面壳只留 main/标题）；两个新落地页 `/convert/files-to-zip`（文件打包成 ZIP）与 `/convert/zip-to-files`（在线解压 ZIP/TAR.GZ）——URL 语义与图片页 X-to-Y 一致，generateMetadata 按关键词定制 + 步骤文案 + 双向互链 + 指向图片转换页；图片落地页「其他格式转换」区补压缩包工具互链；sitemap 14→16 条。闸门 eslint/build 全绿（两新页 Static 预渲染）；浏览器实测：两页 title/H1/面板挂载、落地页解压真实文件计次 2→3、sitemap 16 条含新页 | URL 放 /convert/ 前缀与图片组合页同组（内链权重集中），静态段路由与 [a-to-b] 动态段共存（静态优先）；落地页复用 ArchivePanel 而非复制代码——功能页与 SEO 页永远同步演进；dev 模式首次编译窗口内点击可能撞上页面重载致 UI 瞬态消息丢失，属开发期现象非缺陷（生产 build 预编译无此窗口），验证以持久化证据（配额计数）为准 |
| v0.18 | 切片10a：文档类别上线（文档 → PDF 优先）。后端 `core/doc_formats.py` 文档注册表（12 进 1 出：doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp/html/csv/txt → pdf；OOXML/ODF=PK 魔数、旧 Office=OLE2 魔数，纯文本走「UTF-8 可解码 + 头部无 NUL」弱校验）+ `services/doc_service.py`（soffice 子进程：每任务独立 UserInstallation profile 预置 xcu 禁宏+禁外链更新、`--convert-to pdf`、SOFFICE_TIMEOUT_SEC 硬超时、退出码 0 但无输出文件也判失败）；`/api/convert` 按目标格式路由图片/文档双分支，下载 MIME 走双注册表；Dockerfile 装 libreoffice-writer/calc/impress + fonts-noto-cjk（api/worker 共用镜像），CI backend job 装 LibreOffice 使真转用例在 CI 真跑（本机缺失自动跳过）；前端 formats.ts 加 category 字段（图片 12 + 文档 12 + md-to-html = 25 组合，落地页/sitemap 自动扩至 29 条）、`lib/doc.ts` 本地 MD→HTML 渲染器（转义优先 + href scheme 白名单）、convert.ts 增加 md→html 本地分支（localOnly 失败不回退服务端）、FileDrop 抽组件（Converter 240 行合规）、首页目标下拉按源类别自适应；pytest +7 = 65 全过（真转用例本机 LibreOffice 就绪后实跑通过，含浏览器 docx→PDF 端到端：%PDF 魔数 + 计次） | LibreOffice 不支持 md 直接进 PDF——md 只做本地 md→html（md→pdf 留作 md→html→pdf 组合的后终权衡）；html 源存在转换期外联（SSRF 类）风险，用 profile xcu 关闭链接更新做纵深防御并记录残留风险；GBK 文本本期拒绝（只收 UTF-8）避免编码探测复杂度；转义优先导致行首 `>` 变 `&gt;` 使 blockquote 规则失配——浏览器验证抓出，按转义形态匹配修复；soffice 对损坏文档可能静默成功退出，必须以「输出文件存在」为成功判据 |
| v0.19 | 切片10b：音频类别上线（6 格式互转，服务端 ffmpeg）。后端 `core/audio_formats.py`（mp3/wav/flac/aac/ogg/m4a 进出互转；魔数：ID3 或 MPEG 帧同步 0xFFEx/Fx、RIFF+WAVE、fLaC、OggS、ftyp 盒不限 brand 兼容 M4A/isom、ADTS 同步字 0xFFF1/F9）+ `services/audio_service.py`（ffmpeg 子进程：-nostdin 防交互挂起、-vn 丢封面流、按目标选编码器 libmp3lame/pcm_s16le/flac/aac-192k/libvorbis、FFMPEG_TIMEOUT_SEC 硬超时、输出存在判成功；find_ffmpeg 探测链含 winget Packages glob 兜底——portable 包版本目录不定、PATH/Links 未生效时仍可定位）+ worker/api 三分支路由（音频/文档/图片）+ 下载 MIME 三注册表；CI/Dockerfile 装 ffmpeg；前端 Category 加 audio（30 个互转组合落地页，组合页 25→55，sitemap 59 条）+ 首页音频互转目标排除同格式；pytest +9 全过（wave 标准库造 wav 源，不依赖 ffmpeg 造数据；无 ffmpeg 自动跳过）；浏览器 mp3→wav 端到端（worker 日志 0.39s 转换成功 + 下载链接 + 计次 0→1） | 10b 首刀只做音频互转——视频 CPU 重需独立超时/进度策略，ffmpeg.wasm 本地有三坑（30MB core CDN 依赖、跨域隔离头、worker 集成）各留独立切片；测试源用标准库 wave 生成使「无 ffmpeg 环境仍可测拒绝分支、有 ffmpeg 即真转」；mp3 魔数必须兼容无 ID3 标签的裸 MPEG 帧；老坑复现：改后端代码后运行中的 uvicorn/worker 不自动重载，浏览器 E2E 撞 400 老文案——重启进程后即通，验证前先确认服务为新代码 |
| v0.20 | 切片10c：批量转换（多选自适应，全类别）。交互：Converter 薄壳化——FileDrop 加 multiple（拖拽/点选收集 File[]），选 1 个走 SingleConverter（原单文件状态机整体迁出）、选 ≥2 个进入 BatchQueue；批量校验「同类文件」（落地页须同锁定源；doc 类禁止 md 与 Office 混选——两者路由不同），不合规整体拒绝并提示；目标下拉单一（批量统一转同一目标，源=目标的文件自动跳过）。`lib/batch.ts` 队列 runner：逐个串行、本地优先、单项失败不阻断、ApiStatusError 429 中断整队（剩余标「配额不足」）、同格式跳过；完成后一键打包：逐个 fetch 结果 URL → 复用切片 8 `packFiles` 前端打 ZIP（batch-converted.zip）。api.ts 错误升级为 ApiStatusError（携带 HTTP 状态码，Error 子类向后兼容）；子组件运行态经 onBusyChange 上抛，转换中禁换文件防孤儿请求白扣配额；React key=pickSeq 变更重建子组件天然重置结果。后端零改动。闸门 eslint/build 全绿；浏览器 E2E：3 图批量本地转 JPG（3 条下载链接 + 打包 ZIP 链接 + 计次 3/5）+ 单文件回归（docx→PDF 服务端 + 计次 4/5） | 首页多选自适应而非独立 /batch 页：入口零学习成本、组件单一来源；拆分动核心组件，必须带单文件回归验证（重构后 docx→PDF 服务端链路正常）；「转换中禁换文件」是原有行为——多选化时若丢失会产生孤儿请求白扣配额，用运行态上抛显式保住；配额语义沿用既有口径（N 文件 = N 次计数，本地计次不计流量），无需后端改动；环境坑连发：跨天机器睡眠致 WSL 关机 → fc-redis 断连（uvicorn 启动即崩）→ localhost 转发失效需用 WSL IP 直连，keepalive 改用长驻 wsl sleep infinity 进程保活 |
| v0.21 | 切片10e：视频类别上线（5 容器互转 + 提取音轨，服务端 ffmpeg）——四类矩阵补齐。后端 `core/video_formats.py`（mp4/mov/mkv/webm/avi；魔数：ISO-BMFT ftyp 盒不限 brand（mp4/mov 容器互通）、EBML 0x1A45DFA3（mkv/webm 同源）、RIFF+AVI ）+ `services/video_service.py`（按目标选编码器：x264 veryfast+crf28 速度优先、webm 用 VP8 libvpx（VP9 慢一个量级）、avi 用 mpeg4 兼容老播放器；VIDEO_FFMPEG_TIMEOUT_SEC=900 独立超时）+ **提取音轨**：视频→mp3 复用 audio_service（其 -vn 天然只留音轨）+ api `_validate_request` 重构为**按源类别校验**（源扩展名定注册表 → 目标须属该类别输出集合；语义更准：「源支持但目标不支持」从 415 改为 400）+ worker 按源类别优先路由；前端 Category 加 video（互转 20 + 提取音轨 5 = 25 组合页，组合页 55→80，sitemap 84 条）；pytest +4 全过（lavfi testsrc+sine 合成 0.5s 测试视频，真转用例与造数据共用 ffmpeg 依赖故一并跳过）；浏览器 E2E：mp4→webm 真转码 + mp4→mp3 提取音轨 + 计次 | 路由改「按源类别」而非「按目标」：mp4→mp3（提取音轨）与 mp3→mp4 之外的目标组合靠 target 分支已无法区分语义；415/400 语义修正（415 留给源类型完全不支持）连带更新 2 个旧断言；webm 编码选 VP8 而非 VP9（免费站速度优先，ARCH 记录可后续按 CPU 预算调整）；视频转码 CPU 重 → 独立 900s 超时；**旧坑连环**：celery worker 不占业务端口，重启验证时残留旧 worker 抢走任务（DuplicateNodenameWarning 是信号）——杀进程须按命令行匹配 celery/uvicorn 全量清，worker 加 `-n` 唯一名便于识别 |
| v0.22 | 切片10d：内容安全审核**骨架**（与产品确认降级：服务商接入后置，PRD 3.6 已标注）。`services/moderation.py`：`moderation_enabled()`（MODERATION_API_KEY+URL 均配置）→ `_call_provider`（骨架占位，直接 NotImplementedError）→ `check_file`（fail-closed：provider 任何异常 → 451「服务暂不可用」；违规 → 451「未通过安全审核」）；接入点 `/api/convert` 落盘后投递前（违规：删文件 + mark_failed + 451，配额已扣不退视为滥用成本）；config 补 `MODERATION_API_KEY/URL` 定义（此前仅在 .env.example 占位、config 从未读取——孤儿配置），KEY 为空 = 未启用 + 启动 WARNING；api.ts 无需改动（451 经统一信封由既有错误展示路径渲染）；pytest +5（未启用跳过/启用未接入 fail-closed/审核异常 451+任务 failed/违规 451/放行正常，服务商行为 monkeypatch 模拟） | fail-closed 的诚实实现：启用即拒绝直到真服务商落地（防止「配置了 KEY 以为有审核」的错觉），文档与启动 WARNING 双重明示；接入点放落盘后投递前（审核需完整文件，违规不进队列）；压缩包内存内容的审核签名留待真服务商接入时一并设计；发现并修复孤儿配置：`.env.example` 占位变量从未进 config.py，配置了也完全不生效 |
| v0.22.1 | 批量模式可用性补强：多选后显示**已选文件清单**（文件名 + 大小，超 3 行滚动），替代原先只有「已选 N 个文件」的一行字（用户反馈：需要能看到选了哪些文件）；配 `formatSize` 小工具（B/KB/MB） | 清单是批量模式的最小信任要素——用户需要确认选对了文件再点转换；只读清单不做单项移除（重选即覆盖，pickSeq 重建机制天然支持） |
| v0.22.2 | 选择改**累积式**（用户反馈：第二次选择覆盖了之前的文件）。`appendPicked` 逐文件校验追加：首个文件定类别，后续同类才收（异类忽略并提示「已忽略 N 个文件」）；同名替换；doc 类 md/Office 混选仍禁。清单升级为可交互：单项 × 移除 + 标题「清空」（转换运行中禁用，防孤儿请求）；FileDrop onChange 后清空 input.value（同一文件可重复触发选择）。移除/追加即时同步目标下拉（syncTarget） | 累积 vs 覆盖：覆盖语义下用户无法分多次凑齐一批文件，累积+移除才符合「凑一批再转」心智；类别校验从「整批拒绝」改为「逐文件忽略」——已选的不被误伤；移除仅在未开始转换时开放（转换中 files 冻结），避免与进行中队列竞态 |
| v0.22.3 | 同名文件从静默替换改为**弹窗决策**（用户反馈）。`DuplicateModal`：检测到同名 → 模态「出现同名文件，请核实」，三选【覆盖旧文件】【自动重命名 a(1).ext 递增】【跳过新文件】，一次策略应用于全部冲突项。实现：File.name 只读 → 重命名用 `new File([原文件], 新名)` 包装（内容零拷贝）；清单 UI 抽 `PickedFiles.tsx`（Converter 回到 230 行）；非冲突文件先入列，冲突项挂起等决策。浏览器实测三路径全过 | 静默替换会让用户丢文件而不自知；三选一覆盖了「我要新版本 / 都要 / 选错了」全部意图；重命名不能直接改 File.name——File 构造器包装是零成本方案；冲突基准（dup.base）与决策后状态解耦，模态期间状态不会被并发操作污染 |
| v0.22.4 | 清单文件名可点击 → **内容预览浮层**（用户需求：点击文件名查看文件内容）。`FilePreviewModal` 按类型渲染：图片 `<img>` / 音频 `<audio>` / 视频 `<video>`（blob URL）/ txt·csv·md·html 源码 `<pre>` / Office 文档占位提示（浏览器无法原生渲染，真预览需转 PDF 链路后置）；浮层含文件名/大小/MIME 头部与关闭。实现要点：blob URL 用 **lazy useState 挂载时创建 + 卸载 revoke**（React 19 lint 禁止 effect 内同步 setState），上层以 `key={name-idx}` 强制换文件重挂载；文本读取带 alive 标志防卸载后 setState；预览浮层全屏遮挡底层，验证时注意先关浮层再操作清单 | File 在内存中，跨路由会丢状态——页内全屏浮层是「另一界面」体验的最低成本实现；Office 真预览（服务端转 PDF 回传）列为候选迭代；浏览器实测图片（blob img）/ 文本（pre 内容）/ Office（占位）三路径全过 |
| v0.22.5 | 两个 dev 期实战 bug 修复 + 环境固化：① 预览浮层图片**破图**（用户实测发现）——blob URL 在 lazy useState 创建、effect cleanup revoke，Next dev 的 React StrictMode（挂载→模拟卸载→重挂载）时序下旧 URL 被撤销而 state 仍指向它 → 创建/撤销都移入同一 effect（重挂载重建，src 始终有效），验证升级为 `naturalWidth > 0` 真渲染断言（此前只查 src 前缀是盲区）；② `removeAt` 移除**最后一个文件**时 `next[0].name` 抛 TypeError（clearPicked 有 `?.` 防护而 removeAt 漏了）→ 补齐 `next[0]?.name ?? ""`；③ `package.json` dev 脚本固化 `-p 3100`（本机 3000 被 WSL Grafana 占用，Next 自动跳端口导致多次连错地址） | StrictMode 下「挂载时创建副作用资源」的模式天然脆弱——effect 内创建+cleanup 撤销才是资源生命周期的正确形状（lint 的 set-state-in-effect 例外需要注释说明理由）；同类空值防护应对齐（一处有防护一处没有就是 bug 温床）；端口冲突属于环境事实，固化进脚本而非依赖记忆 |
| v0.22.6 | 切片11a：**Office 真预览**（点击清单文件名直接看到文档内容，替代原占位提示）。后端新增 `POST /api/preview/office`（`api/preview.py`）：仅收 9 种二进制 Office（doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp，文本类前端已原生渲染）→ 扩展名白名单 415 + 大小上限 413（复用 quota 档位）+ 魔数强校验 415 → 复用 `doc_service.convert_document` 同步转 PDF（宏禁用 profile + 超时 + 输出核对全套沿用）→ FileResponse 流回传 + BackgroundTask 即转即删（pv-* 前缀隔离，task_id 式命名不接触用户文件名）；**不计转换配额、不落任务库、不接审核**（结果仅回传上传者本人，无 UGC 传播面），防滥用用独立 Redis 日计数 `fc:pv:{date}:{ip}`（默认 200/日/IP，Redis 异常 fail-open）。前端 `OfficePreview` 组件：loading/ready/error 三态 + AbortController（StrictMode 双挂载安全）+ blob URL 生命周期全在 effect（v0.22.5 教训直接复用），iframe 内嵌浏览器原生 PDF 查看器；pytest +6（含 soffice 真转端到端，全量 88 过） | 纯前端渲染库（docx-preview/mammoth）覆盖不了 ppt/pptx 且样式还原参差——服务端 soffice 一套链路全覆盖 9 格式、渲染效果与真实转换一致、LibreOffice 依赖现成；预览与转换语义分离（预览不计次不审核但限流）是低成本防 soffice 被刷的平衡点；**踩坑**：后端旧进程无 --reload 导致新路由 404（表现为浮层「Not Found」）——新增后端路由必须重启 uvicorn；且发现旧进程跑在全局 Python（缺依赖）而非 .venv，已改用 .venv 统一启动 |
| v0.23.0 | **前端美化启动（用户选定 TinyPNG 为设计基准）**，切片 12a：设计 token + 全站壳换装。流程：浏览器实抓 tinypng.com 计算样式提取真实参数（Noto Sans 全站字体 / 品牌绿 #00B075 / 标题 #12141D、正文 #40444F / 按钮·卡片 16px 圆角 / 白卡+白色虚线拖拽区+hero 自然场景的版式）→ `globals.css` 重写为完整 CSS 变量体系（色板/字号/圆角/阴影/布局宽度），**亮色单主题**（移除 dark 覆盖）；`SiteFrame` 重排：白底导航条（绿方块 logo + AuthBar）→ 浅绿渐变 hero（heading 居中）→ 中央白色大卡（-40px 悬浮压边 + 阴影）→ footer 隐私声明「文件临时处理即删」——首页与 80 落地页一处生效；`FileDrop`：白色大虚线区 + 大字引导 + 拖入品牌绿高亮，input 改 12px 微型透明层；`AuthBar` 导航化（登录绿色胶囊、退出白底描边）；首页 h1 32px hero 化。eslint/build 全绿 + E2E 复测上传/清单正常 | 设计 token 从真实站点抓取而非凭印象（getComputedStyle 读品牌色/字体/圆角，比截图目测精确）；工具站做亮色单主题（暗色模式是双倍维护成本，TinyPNG 也不做）；FileDrop 的 input 完全隐藏（display:none）会让自动化测试与部分辅助技术无法定位——12px 微型透明层兼顾视觉零干扰与可交互性（label 包裹保证整块点击触发选择器）；footer 隐私声明是免费工具的核心信任要素（TinyPNG「3 小时自动删除」同思路） |
| v0.23.1 | 切片 12b：**全站组件与页面 token 化**——清扫全部旧蓝色硬编码色值，统一映射到 12a 的 token 体系（#2563eb→var(--brand)、#6b7280/#9ca3af→var(--muted)、#111827→var(--ink)、#374151→var(--body-color)、#dc2626→var(--danger)、#c7cdd4→var(--disabled)、#16a34a/#059669→var(--brand)）。组件层：SingleConverter / BatchQueue（主按钮品牌绿胶囊+禁用灰、select 卡片化加粗、状态色、打包按钮描边绿）、PickedFiles（清单浅底、文件名品牌绿加粗、红 ×）、DuplicateModal（三按钮层级：描边白/描边绿/实心绿）、ConvertResult、QuotaHints、FilePreviewModal、OfficePreview、ArchivePanel。页面层：落地页模板 [a-to-b]（80 页共用，h1 28px ink 色、链接品牌绿）、files-to-zip / zip-to-files / archive / login / account 五页独立壳同步 token 化（白卡+阴影+Noto Sans）。grep 终验：组件与页面层旧色值 0 残留（仅 token 定义本身）；落地页浏览器实测 82 个品牌绿链接 + h1 墨色 | 色值映射集中到 token 后，未来调品牌色只改 :root 一处；同文件多个 SearchReplace 并行仍会互相覆盖（v0.10 老坑重演，打包按钮块修改丢失）——**同文件编辑必须串行**，grep 全量扫描是兜底验证手段；archive 系三页不走 SiteFrame（ArchivePanel 自带 useQuota，强迁违反单实例约束），先色值统一、壳布局统一留待后续 |
| v0.23.2 | 切片 12c：**转换结果增强**（借鉴 TinyPNG 两个点子）。① 体积变化数据行：`ConvertResult` 新增 inSize/outSize props，完成后显示「30 KB → 7 KB · 减少 76%」——本地转换取 blob.size、服务端取 TaskInfo.out_size（已有字段）；增大时中性展示「增大 X%」（doc→pdf 场景），不炫耀不隐藏。② 图片前后对比滑块：新组件 `CompareSlider`——结果图垫底、原图绝对定位覆盖 + `clip-path: inset(0 X% 0 0)` 控制露出、透明 range 全覆盖拖动、白色分割线 + 「原图/转换后」角标；仅「无损/可能无损源 → 有损目标（jpg/webp）」组合显示（画质疑虑的真实来源；目标 png 无损转换拖动无变化不显示），文档/音视频无并排可比性不显示。SingleConverter 接线：outSize/beforeUrl state，beforeUrl blob URL 与 downloadUrl 同一套「创建即记录、重置即 revoke」生命周期；E2E：png→jpg 本地转换实测数据行 + 滑块双 img + range 全就位 | 结果数据行是免费工具最有说服力的价值证明（TinyPNG 转化率核心武器），成本仅两个已有字段；对比滑块选 clip-path 双 img 叠加而非 canvas（零 canvas 依赖、跨域 URL 也可显示——服务端结果直接用下载 URL）；beforeUrl 生命周期复用 v0.22.5 的「effect 内创建+cleanup 撤销」思想改为事件内创建+reset 回收（事件驱动场景无 StrictMode 问题） |
| v0.23.3 | 切片 12d：**微交互与 hero 精修**。① 主按钮交互态：globals.css 新增 `.btn-primary` 类（hover 变深绿 var(--brand-hover) / active 缩放 0.98）——内联样式无法表达伪类，交互态统一走全局类，SingleConverter/BatchQueue 主按钮挂类；② 阖页 hero **格式徽章行**：12 个常见格式胶囊（PNG/JPG/WEBP/BMP/PDF/DOCX/XLSX/PPTX/MP4/MP3/MKV/ZIP）一眼看清支持范围，兼作 SEO 关键词展示；③ `FileDrop` 拖拽区新增品牌绿上传 SVG 图标（对标 TinyPNG 3D 盒子引导物）；④ FilePreviewModal 遮罩色与 DuplicateModal 统一 rgba(18,20,29,.45)。截图验证徽章行/图标/整体协调 | 内联样式体系的固有短板是伪类（:hover/:active），交互态集中到全局类是内联方案下的最小代价做法（不引 CSS-in-JS）；格式徽章行是工具站标配的「支持范围自说明」，天然承载 SEO 关键词；上传图标给拖拽区一个视觉锚点，比纯文字引导更有指向性 |
| v0.23.4 | 切片 12e：**hero 插画背景图**。图源为用户提供的二次元简约插画（2848×1600，紫蓝渐变天空 + 女孩坐云端用笔记本 + PDF/Video/Audio/Image/Excel 文件夹环绕——与文件转换主题高度契合）：Pillow 去右下角水印（水印区域用左侧相邻等宽区域**镜像填充**，天空渐变水平均匀故视觉无痕）+ 转 JPG q88 覆盖 `public/hero-bg.jpg`；`SiteFrame` hero 接入 next/image（fill + objectFit cover + **priority** 首屏 LCP 优先）+ 白色渐变遮罩（顶部 .82 → 底部 .92）保证墨色标题/徽章可读。截图验证：插画透出标题后氛围到位、水印无痕、遮罩可读性良好 | 用户自有图优先于 AI 生成（生成 API 当前对自动化请求持续返回占位图不可用）；去水印选「邻近区域镜像填充」而非模糊/裁剪——渐变天空水平均匀，镜像最无痕；next/image fill+priority 是 Next 首屏大图标准做法（自动优化尺寸）；**注意**：dev 模式替换 public 图片后 next/image 优化缓存不失效，需清 .next 重启才见新图（新坑入库） |
| v0.23.5 | 切片 12f：**首页产品描述区**（参考 TinyPNG「OUR PRODUCTS」产品叙事区节奏）。`SiteFrame` 新增 `belowCard` 插槽（白卡外全宽分段，footer 之前）——首页传入：eyebrow「免费 · 无需注册」（品牌绿宽字距）+ 大标题「28 种格式、80+ 种转换组合，一个页面全搞定」+ 副文案（目标人群/本地转换/即删/登录提额）+ 四功能亮点卡（图片互转/文档转 PDF/音视频互转/隐私优先，emoji 图标 + grid auto-fit 自适应列）。文案与真实能力一一对应（不夸大：无客服无 SLA 不写） | TinyPNG 的转化节奏是「工具即 hero → 下方叙事说服」，此前首页工具下方直接 footer 缺少说服层；belowCard 独立于 below（below 在卡内服务于落地页 SEO 正文，belowCard 是首页品牌叙事）；数字（28 种/80+）与格式注册表真实数据一致，既是文案也是事实声明 |
| v0.23.6 | 切片 12g：**hero 布局修正**（用户反馈：文字挡住背景插画）。v0.23.4 的「fill 背景图 + 白遮罩」方案下，居中标题正压在插画主体（女孩+文件图标）上，遮罩只能弱化不能消除遮挡 → 改为**上文下图堆叠布局**：插画不再是背景，而是以完整圆角卡片（width/height 声明原始比例 2848×1600 + radius + 阴影）展示在文字块下方，alt 补充插画语义描述；白卡压边量随 hero 高度调整（-40px → -28px，hero 底 padding 64px）。760px 容器下 flexWrap 自然堆叠，视口宽窄均无遮挡 | 插画类 hero（主体居中且需完整展示）不适合做 cover 背景图——背景必然被文字覆盖；「上文下图」在 760px 单列容器下是最干净的解法（分栏双列需 ~900px 容器，首页工具卡宽度会失衡）；图片从装饰升级为内容后 alt 必须承载语义；**同文件并行 SearchReplace 覆盖问题第三次发生（12f 的 v0.23.5 行曾丢失后补）——ARCH 迭代表追加必须串行执行** |
| v0.23.7 | 切片 12h：**格式徽章环绕舞台**（用户提议：徽章动态围绕插画）。新组件 `HeroOrbit`：12 个格式徽章沿椭圆轨道按角度均分（`x = 50 + 47·cos θ, y = 50 + 45·sin θ`，从顶部起顺时针），百分比定位响应式缩放；中央插画 cover 聚焦主体（inset 16%/17%）；每枚徽章错峰浮动动画（globals.css `@keyframes hero-float` + `animation-delay = i×0.3s`，transform 合并在 keyframes 内避免与定位 translate 冲突）；`prefers-reduced-motion: reduce` 时停用动画。`SiteFrame` 新增 `heroArt` 插槽（覆盖默认右列插画图），首页传入舞台、落地页保持默认图。首页 heading 移除徽章行（职责移入舞台），副文案同步精简。截图验证：环绕均匀无重叠、与插画「文件图标环绕女孩」构图双层呼应 | 轨道用三角函数百分比定位（非 SVG/绝对像素）——天然随容器缩放；浮动动画的 transform 必须把定位 translate 一并写进 keyframes（分离会被动画帧覆盖导致徽章跳回左上角）；reduced-motion 是可达性底线；这个环绕舞台成为首页标志性视觉，与 TinyPNG 的熊猫上传卡同等记忆点 |