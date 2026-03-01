# VIP 状态查询系统技术栈文档（Cloudflare 生态版）

## 1. 文档目标

基于已确认需求，定义一套可直接开工的技术栈与工程方案，重点覆盖：

- Cloudflare 生态选型
- Monorepo 工程组织
- D1 并发与原子更新策略
- 管理端鉴权与用户端 Token 安全
- 限流与基础防滥用

## 2. 技术栈总览

| 层级 | 选型 | 作用 |
| --- | --- | --- |
| 前端托管 | Cloudflare Pages | 托管 React 前端，自动 CI/CD |
| 后端运行时 | Cloudflare Workers + Hono | 提供 API、鉴权、业务逻辑 |
| 数据库 | Cloudflare D1 (SQLite) | 存储用户、充值流水、审计数据 |
| 前端框架 | React 18 + Vite + TypeScript | 管理端与用户端页面 |
| UI | Ant Design + Tailwind CSS | AntD 负责后台业务组件，Tailwind 负责用户端定制样式 |
| 时间库 | Day.js | 前端时间格式化、倒计时展示 |
| 鉴权 | JWT + HttpOnly Cookie | 管理端登录态 |
| 防滥用 | Workers Rate Limiting + Hono 中间件 | 限制暴力访问和 Token 枚举 |

## 3. 工程结构（Monorepo）

建议使用 `pnpm workspaces`，共享类型与常量，避免前后端重复定义。

```text
/vip-system-monorepo
├── packages
│   ├── shared
│   │   ├── src
│   │   │   ├── types
│   │   │   ├── enums
│   │   │   └── constants
│   │   └── package.json
│   ├── backend
│   │   ├── src
│   │   │   ├── routes
│   │   │   ├── middleware
│   │   │   ├── services
│   │   │   └── db
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── frontend
│       ├── src
│       │   ├── pages
│       │   ├── components
│       │   ├── api
│       │   └── styles
│       └── package.json
├── pnpm-workspace.yaml
└── package.json
```

说明：

- `packages/shared` 供前后端共用 DTO、枚举、接口类型。
- `wrangler.toml` 建议放 `packages/backend`，由 Worker 项目独立管理绑定配置。

## 4. 数据库设计与时间策略

### 4.1 时间字段约定

统一将时间存储为 `INTEGER`（Unix 秒），避免字符串时间计算歧义。

- `expire_at`：用户到期时间（Unix 秒）
- `created_at` / `updated_at`：Unix 秒

展示层再统一转换为北京时间（UTC+8）。

### 4.2 核心表建议

1. `users`
   - `id` (TEXT/UUID)
   - `username` (TEXT)
   - `access_token_hash` (TEXT, UNIQUE)
   - `expire_at` (INTEGER)
   - `created_at` (INTEGER)
   - `updated_at` (INTEGER)
2. `recharge_records`
   - `id`
   - `user_id`
   - `change_days`
   - `reason`
   - `internal_note`
   - `expire_before`
   - `expire_after`
   - `operator_admin_id`
   - `created_at`
3. `admin_users`
   - `id`
   - `username`
   - `password_hash`
   - `created_at`
4. `token_reset_logs`
   - `id`
   - `user_id`
   - `old_token_hash`
   - `new_token_hash`
   - `operator_admin_id`
   - `created_at`

### 4.3 索引建议

- `users(access_token_hash)` 唯一索引
- `users(username)` 普通索引
- `recharge_records(user_id, created_at DESC)` 复合索引
- `recharge_records(created_at)` 普通索引（便于今日统计）

## 5. D1 并发与原子更新方案

D1 无传统行级锁，推荐使用“单 SQL 原子更新 + 事务批处理记录日志”。

充值更新（原子计算）：

```sql
UPDATE users
SET expire_at = MAX(expire_at, unixepoch()) + (? * 86400),
    updated_at = unixepoch()
WHERE id = ?
RETURNING expire_at;
```

建议流程：

1. 查询 `expire_before`。
2. 执行上面的原子更新，拿到 `expire_after`。
3. 插入 `recharge_records`。
4. 用 D1 `batch()` 组织为同一事务提交。

可选兜底（乐观锁）：

```sql
UPDATE users
SET expire_at = ?, updated_at = unixepoch()
WHERE id = ? AND expire_at = ?;
```

若影响行数为 0，说明并发冲突，重试一次。

## 6. 鉴权与安全设计

### 6.1 管理端

- 登录成功后签发 JWT，写入 `HttpOnly` Cookie。
- Cookie 属性：`HttpOnly`、`Secure`、`SameSite=Lax`（或更严格策略）。
- 所有管理写操作接口校验 JWT。
- 管理写操作增加 CSRF 防护（至少校验 `Origin/Referer`）。

### 6.2 用户端 Token

- 推荐路由：`/status/:token`（可兼容 `?t=`）。
- Token 使用高熵随机值（UUID v4 或 32+ 字节随机串）。
- 数据库存储 `token hash`，请求时对入参 hash 后查询，避免明文落库。
- 支持后台“一键重置 Token”，旧 Token 立即失效。

### 6.3 响应头建议

- `Referrer-Policy: no-referrer`
- `Cache-Control: private, no-store`
- `X-Content-Type-Options: nosniff`

## 7. 限流与防滥用

优先使用 Workers 原生 Rate Limiting binding，再接入 Hono 中间件。

建议规则（初版）：

1. `/api/status/*`：每 IP `60 req/min`
2. `/api/admin/login`：每 IP `10 req/10min`
3. 管理写接口：每管理员 `120 req/min`（防误操作脚本）

说明：

- Rate Limit 用于防滥用，不用于精准计费。
- 如需更细粒度统计，可辅以 D1/KV 记录安全事件。

## 8. 前端实现边界

1. 管理端（AntD）
   - 页面：用户管理、充值弹窗、流水审计、Token 重置
   - 组件：Table、Form、Modal、Date/Statistic
2. 用户端（Tailwind + 少量 AntD）
   - 页面：状态卡片、剩余天数高亮、历史时间轴
   - 样式：移动优先，剩余天数 < 3 天变红
3. 公共约束
   - 前后端均使用 `shared` 类型，禁止手写重复接口类型。

## 9. API 约定（MVP）

### 9.1 管理端 API

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/users?query=`
- `POST /api/admin/users`
- `POST /api/admin/users/:id/recharge`
- `POST /api/admin/users/:id/reset-token`
- `GET /api/admin/recharge-records`
- `GET /api/admin/dashboard/today`

### 9.2 用户端 API

- `GET /api/status/:token`

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "..."
}
```

## 10. 开发与部署建议

1. 包管理：`pnpm`
2. 代码质量：ESLint + Prettier + TypeScript strict
3. 测试建议：
   - 后端：充值逻辑单元测试（尤其并发和边界时间）
   - 前端：关键页面渲染与状态展示测试
4. 部署建议：
   - `frontend` 部署到 Cloudflare Pages
   - `backend` 部署到 Cloudflare Workers
   - 生产域名建议分离：`vip.yourdomain.com`（前端）+ `api.yourdomain.com`（API）

## 11. 里程碑建议

1. M1：Monorepo 初始化 + shared 类型包 + D1 schema
2. M2：管理端登录 + 用户管理 + 充值与审计 API
3. M3：用户端状态页 + 历史记录 + Token 重置
4. M4：限流、安全头、日志补全 + UAT
