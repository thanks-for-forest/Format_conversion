# 项目状态（PROJECT_STATE）

> 更新日期：2026-09-07

## 当前阶段

- 阶段：**实现阶段（切片 10c 完成：批量转换）**
- 状态：切片 10c 已跑通——首页多选自适应（1 个文件原单文件流程、≥2 个同类文件进入批量队列），全类别批量（逐文件按自身类别路由本地/服务端）；批量队列逐个串行、429 中断整队、同格式跳过、单项失败不阻断；完成后一键打包 ZIP（复用切片 8 前端打包）。后端零改动（复用 /api/convert 与配额口径：N 文件 = N 次计数）
- 结构：Converter 薄壳化（选择/校验/分发）+ SingleConverter（原状态机迁出）+ BatchQueue（队列 UI/打包）+ lib/batch.ts（runner）；api.ts 错误升级 ApiStatusError（带 HTTP 状态码）
- 质量闸门：eslint/next build 全绿（后端无改动，pytest 基线不变）
- 浏览器验证：3 图批量本地转 JPG（3 条下载链接 + batch-converted.zip 打包 + 计次 3/5）+ 单文件回归（docx→PDF 服务端正常，计次 4/5）
- 本片教训：拆核心组件必须带单文件回归；「转换中禁换文件」防孤儿请求行为需显式保留（运行态上抛）；跨天 WSL 关机连锁（Redis 断连/转发失效）——keepalive 用长驻 wsl sleep infinity，Redis 连接可切 WSL IP 直连

## 安全审计（2026-09-07，standard 模式，10/10 维度覆盖）

- 发现 8 项（1 High / 2 Medium / 5 Low），**已修复 6 项**：
  - **H1 已修**：`client_ip` 取 XFF 首段可被伪造 → 匿名配额无限刷新；改取最后一跳（反代追加位），+伪造专项测试
  - **M1 已修**：send-code 缺 IP 级限流可刷爆 SMTP 发信配额；新增 `fc:sendip:{ip}` 小时限流（默认 10/h）
  - **L1 已修**：production + 弱默认 SECRET_KEY 启动即 RuntimeError
  - **L3 已修**：ZIP 路径校验统一为「含 .. 即拒 + basename」
  - **L5 已修**：CI 前端 job 加 pnpm audit
  - **M2 部分修**（文档强化）：生产部署必须设 `ENV=production`——Cookie Secure 标志与弱密钥拒启都依赖它（见「部署」章节）
- 接受不改（已声明口径）：L2 logout 无服务端令牌作废；L4 配额 check-then-incr 轻微竞态
- 全量复核确认无问题面：SQL 全 ORM 参数化、无命令注入/SSRF/反序列化面、上传路径 task_id 派生、ZIP 逐条内存读无 extractall、Celery JSON 序列化、Pillow 12.3 + 自带 DecompressionBomb 防护、JWT 显式 HS256 算法白名单
- 审计后基线：pytest **57 passed**（+2 加固专项）
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

1. 切片 10d：内容安全审核（PRD 合规硬门槛，fail-closed；需先定审核服务商）——公开上线前必须完成
2. 切片 10e：视频互转 + 提取音轨（服务端 ffmpeg，CPU 重需独立超时/进度策略）；ffmpeg.wasm 本地另评估
3. 上线：域名购买 → DNS → 服务器部署 compose 栈（生产清单：ENV=production / 强 SECRET_KEY / 域名 HTTPS）
4. i18n（zh/en）建议降级或后置（55+ 落地页文案抽取工作量大）

## 部署（Docker Compose，切片 7）

- 前置：根目录 `.env` 至少配 `SECRET_KEY`（发信再配 `SMTP_*`）；参照 `.env.example`
- **生产清单（必做）**：`ENV=production`（Cookie Secure 标志 + 弱密钥拒启依赖它）、强随机 `SECRET_KEY`、`SITE_ADDRESS` 设域名、`FRONTEND_ORIGIN` 设正式地址
- 构建启动：`docker compose up -d --build`（六服务：caddy/api/worker/beat/redis/web）
- 冒烟：`curl http://localhost/api/quota/summary` 返回匿名档即通；首页 200
- 访问：`SITE_ADDRESS=:80` 默认纯 HTTP；生产设为域名（DNS 指向服务器、放通 80/443）后 Caddy 自动签发 HTTPS
- 数据：命名卷 `app_data`（SQLite 库 + 临时文件）；清扫由 beat 每 10 分钟兜底（超时未下载文件 / 卡死任务 / 过期记录）
- 停止：`docker compose down`（数据卷保留）；升级：`git pull && docker compose up -d --build`

## 本地运行（开发）

- 前置：本机 Redis 经 WSL docker（`wsl -d Ubuntu -u root -e bash -lc "docker start fc-redis"`）；**WSL 空闲会自动关机**，需挂常驻进程（如 `wsl -d Ubuntu -u root -e bash -lc "while true; do sleep 3600; done"` 后台运行）
- API：`cd backend && uv run uvicorn app.main:app --port 8000`（须用 8000 或设 `NEXT_PUBLIC_API_BASE`——前端默认指向 `localhost:8000`；首次需 `uv run alembic upgrade head` 建表；无 Redis worker 时加 `$env:CELERY_TASK_ALWAYS_EAGER="1"` 同步执行）
- Worker：`cd backend && uv run celery -A app.workers.celery_app worker -P solo -l info`（Windows 需 `-P solo`，prefork 不支持）
- 前端：`cd frontend && pnpm dev`（WSL grafana 占用 3000 时用 `$env:PORT="3100"`，后端同步设 `FRONTEND_ORIGIN=http://localhost:3100`）
- 测试：需 Redis 在线（conftest 用 REDIS_URL/1 库；本地转发不稳可设 `TEST_REDIS_URL` 指向 WSL IP）
- 文档转换：需本机 LibreOffice（默认路径自动探测，特殊安装位置设 `SOFFICE_PATH`；未装时文档真转测试自动跳过）