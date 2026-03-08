# VIP Membership Monorepo

VIP 会员状态管理系统 Monorepo，包含管理员后台、用户状态页、Cloudflare Worker API 与 D1 数据库迁移脚本。

当前仓库面向首次上线交付，目标是让开发、部署、运维都能在根 README 中快速找到入口。

## 项目概览

- 管理端：管理员登录、用户管理、充值、补录、Token 重置、流水审计
- 用户端：通过专属链接查看会员状态、剩余天数、到期时间与历史记录
- 邀请返利：邀请绑定、奖励流水、提现流水、奖励解锁
- 稳定性能力：退款修复任务、告警中心、定时巡检

## 技术架构

- 前端：React 18 + Vite + TypeScript + Ant Design
- 后端：Cloudflare Workers + Hono
- 数据库：Cloudflare D1
- Monorepo：pnpm workspace

推荐部署形态：

- 前端部署到 Cloudflare Pages
- 后端部署到 Cloudflare Workers
- 数据持久化使用 Cloudflare D1

## 仓库结构

```text
.
├── docs
│   ├── vip-membership-dev-plan.md
│   ├── vip-membership-prd.md
│   └── vip-membership-tech-stack.md
├── packages
│   ├── backend   # Worker API、D1 migrations、管理员导入脚本
│   ├── frontend  # 管理端与用户端页面
│   └── shared    # 前后端共享类型、常量与 DTO
├── package.json
└── pnpm-workspace.yaml
```

## 访问入口

- 管理后台：`/admin`
- 管理员登录页：`/admin/login`
- 用户状态页：`/status/:token`
- 健康检查：`/api/health`

本地默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/api/health`

## 环境要求

- Node.js 18+
- pnpm 10+
- Cloudflare 账号与 D1 数据库权限
- Wrangler CLI（已作为 workspace 依赖安装）

## 本地开发

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备本地环境变量

后端：

```bash
cp packages/backend/.dev.vars.example packages/backend/.dev.vars
```

前端如需自定义接口地址，可复制 `.env.example` 自行扩展。

### 3. 初始化本地 D1

```bash
pnpm db:migrate:local
```

### 4. 启动前后端

```bash
pnpm dev
```

如需分别启动：

```bash
pnpm dev:backend
pnpm dev:frontend
```

### 5. 初始化管理员账号

默认只打印 SQL，不直接执行：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123"
```

直接写入本地 D1：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123" --target local
```

## 环境变量

### 后端 `packages/backend/.dev.vars`

- `JWT_SECRET`：管理员登录态签名密钥，生产环境必须使用长度足够的随机字符串
- `USER_TOKEN_SECRET`：用户 Token 相关签名或派生密钥，建议与 `JWT_SECRET` 不同
- `ADMIN_SESSION_TTL_SECONDS`：管理员会话有效期，单位秒
- `INVITE_REWARD_MODE`：邀请奖励模式，当前支持 `allowlist` 或 `public`

### 后端 `packages/backend/wrangler.toml`

- `APP_ENV`：运行环境标记，生产环境应设置为 `production`
- `database_name` / `database_id`：D1 绑定信息
- `crons`：当前配置为每 10 分钟运行一次定时任务

### 前端 `packages/frontend/.env`

- `VITE_API_BASE_URL`：前端接口基地址
- 本地开发默认使用 `/api`，通过 Vite 代理转发到 `http://127.0.0.1:8787`

## 生产部署

首次上线建议按以下顺序执行。

### 1. 创建 D1 数据库

在 Cloudflare 创建生产 D1 数据库，并记录真实的 `database_id`。

### 2. 更新 Worker 配置

修改 `packages/backend/wrangler.toml`：

- 将 `database_id` 替换为真实值
- 将 `APP_ENV` 调整为生产环境值
- 确认 `crons` 配置符合预期

### 3. 配置生产密钥

至少需要配置：

- `JWT_SECRET`
- `USER_TOKEN_SECRET`
- `ADMIN_SESSION_TTL_SECONDS`
- `INVITE_REWARD_MODE`

### 4. 执行远程 migration

```bash
pnpm db:migrate:remote
```

### 5. 导入首个管理员账号

先生成 SQL 进行确认：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123"
```

确认后直接写入远程 D1：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123" --target remote
```

### 6. 部署后端 Worker

```bash
pnpm --filter @vip/backend deploy
```

### 7. 构建并部署前端

```bash
pnpm --filter @vip/frontend build
```

前端静态产物位于 `packages/frontend/dist`，推荐接入 Cloudflare Pages。

## 上线检查清单

- `GET /api/health` 返回 `code = 0`
- 管理员可以正常登录 `/admin/login`
- `/admin` 未登录访问会被拦截
- 可以新增用户并复制状态页链接
- 用户状态页 `/status/:token` 可正常打开
- 充值后到期时间与流水记录正确
- 重置 Token 后旧链接失效、新链接生效
- 定时任务与告警相关链路已完成基础验证

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm --filter @vip/backend deploy
```

## 版本历史

<details open>
<summary><strong>V1.0</strong> - 首次上线版本</summary>

- 完成 Monorepo 基础工程、共享类型与本地开发链路
- 完成 Cloudflare Worker + D1 基础设施与 migration 流程
- 完成管理员登录、路由守卫与后台会话鉴权
- 完成用户管理、状态查询、充值、补录、Token 重置与审计流水
</details>

<details>
<summary><strong>V1.1</strong> - 运营能力增强</summary>

- 增加邀请关系绑定与邀请码能力
- 增加返利奖励流水、奖励解锁与提现流水
- 增加用户资料字段扩展与资料变更日志
</details>

<details>
<summary><strong>V1.2</strong> - 稳定性与风控增强</summary>

- 增加退款补偿链路与补偿任务管理
- 增加告警中心与异常事件处理
- 增加定时任务、巡检逻辑与更多运行期兜底
</details>

## 版本规划

<details>
<summary><strong>Next</strong> - 后续迭代方向</summary>

- 补充更完整的生产部署文档与回滚说明
- 补充自动化测试、回归清单与上线前检查流程
- 完善监控、告警、风控与运维工具链
</details>

## 相关文档

- `docs/vip-membership-prd.md`：需求文档
- `docs/vip-membership-tech-stack.md`：技术栈与架构设计
- `docs/vip-membership-dev-plan.md`：开发计划与阶段划分
