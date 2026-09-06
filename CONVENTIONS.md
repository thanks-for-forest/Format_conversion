# 开发规范（CONVENTIONS）

> 版本：v0.4　关联 ARCH v0.3　更新日期：2026-09-06

## 1. 语言与工具链

| 端 | 语言/框架 | 包管理 | 环境 |
|----|-----------|--------|------|
| 后端 | Python 3.12+ / FastAPI / SQLAlchemy / Celery | uv（pyproject.toml） | venv 隔离 |
| 前端 | TypeScript / React / Next.js | pnpm | Node 20+ |

## 2. 命名规范

### 后端 Python
| 对象 | 规则 | 示例 |
|------|------|------|
| 文件/模块 | snake_case | `convert_service.py` |
| 函数/变量 | snake_case | `create_task()` |
| 类 | PascalCase | `ConversionService` |
| 常量 | UPPER_SNAKE | `MAX_FILE_SIZE` |
| DB 字段 | snake_case | `created_at` |

### 前端 TypeScript
| 对象 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `FileUploader.tsx` |
| 组件名 | PascalCase | `FileUploader` |
| 函数/变量/hooks | camelCase | `useConvert()` |
| 常量 | UPPER_SNAKE | `MAX_FILE_MB` |
| 页面路由 | kebab-case | `convert/[a-to-b]` |

### 通用
- REST 端点用 kebab-case 名词复数（如 `/api/tasks`）。
- 未引用代码、空 import 一律删除，不留死代码。

## 3. 文件大小与结构上限

| 项 | 上限 |
|----|------|
| 后端单文件 | ≤ 400 行 |
| 后端单函数 | ≤ 50 行 |
| 前端组件 | ≤ 250 行 |
| 单模块职责 | 单一，禁止「一坨代码」 |

- 超出上限必须拆分（子组件 / hooks / 服务类）。
- 每次端到端切片可独立跑通、可测试、可提交。

## 4. 代码风格

- **Python**：Ruff（line-length=88，import 自动排序），必须类型注解，公开函数写 docstring。
- **TypeScript**：ESLint + Prettier，`strict: true`，禁止裸 `any`（确需时显式注释说明）。
- **注释语言**：中文（与用户一致）。
- **禁止残留**：调试 `print` / `console.log` / 注释掉的死代码不得提交。

## 5. Git 规范

- 分支：`main`（受保护）+ `feat/xxx` + `fix/xxx`。
- Commit：Conventional Commits（`feat` / `fix` / `refactor` / `docs` / `chore`）。
- 每完成一个可跑通的切片就提交，小步提交。

## 6. 质量闸门（写代码前先拉 git）

- 开工前：`git pull` 拉最新 + 新建分支。
- **pre-commit**：Ruff check/format、Mypy（增量）、ESLint、Prettier。
- **CI**：后端 Ruff + Mypy + Pytest；前端 ESLint + `tsc` + build。
- **依赖锁定**：`uv.lock` / `pnpm-lock.yaml` 必须提交，禁止裸安装导致版本漂移。
- **漏洞扫描**：CI 跑 `pip-audit` / `npm audit`（或 Dependabot），高危依赖阻断合并。
- 合并到 `main` 前必须全绿，禁止跳过钩子。

## 7. 安全底线（写代码时）

- 密钥/邮箱/内容审核配置只用环境变量，不进前端、不进仓库（`.env` 入 `.gitignore`，提供 `.env.example`）。
- 所有接口做鉴权/授权；配额、登录、内容审核等敏感校验**必须在服务端**。
- 用户输入、上传文件名、路径一律不信任，服务端做白名单/魔数/签名校验。

## 8. 测试规范

- 必测：鉴权、配额、魔数/白名单校验、任务状态流转、内容审核拦截。
- 核心逻辑（转换编配、配额计算、签名 URL、文件清理）单测覆盖。

## 9. 提交与 PR

- 提交前本地自测；PR 保持小步、单职责，附变更说明与验证方式。
- 报错先定位再修：做最小复现、打印关键变量锁住行为，再基于证据修复；修不好就回滚到上一个稳定提交，不盲目重试。

## 10. 日志与错误处理

- 结构化日志，转换任务日志统一带 `task_id`，便于排障。
- 不吞异常、不用裸 `except`；任务失败写入 `error_msg` 并落库。
- 对外错误信息不暴露堆栈/内部路径。

## 11. 数据与文档同步

- 数据库变更必须用 **Alembic 迁移**随代码提交，禁止手改运行库 schema。
- 新增密钥/配置须同步 `.env.example`，`.env` 永不提交。
- 需求或架构变更时，同步更新 PRD / ARCH / PROJECT_STATE，并记录迭代原因。

## 12. API 契约与响应格式

- 接口以 Pydantic schema 为准，FastAPI 生成 OpenAPI；前端类型与之一致，改接口须同步。
- 统一响应信封：`{ code, data, message }`；错误码枚举化，禁止各接口自行发挥。

## 13. 前端专项

- WASM（ffmpeg 等）体积大，必须**惰性加载**，不得进入首屏 bundle。
- 文案不硬编码，统一走 i18n key（zh/en），key 命名用 `snake_case` 语义分组。