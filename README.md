# VIP Membership Monorepo

P1 鉴权闭环已包含：

- `packages/shared`：前后端共享类型和常量
- `packages/backend`：Cloudflare Worker + Hono + D1 migration + 管理员登录鉴权
- `packages/frontend`：React + Vite 壳页面 + 登录页与后台路由守卫

## 1. 安装依赖

```bash
pnpm install
```

## 2. 本地初始化数据库（D1 local）

```bash
pnpm db:migrate:local
```

## 3. 一键启动前后端

```bash
pnpm dev
```

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/api/health`

## 4. 云端 D1 migration

先在 `packages/backend/wrangler.toml` 填入真实 `database_id`，再执行：

```bash
pnpm db:migrate:remote
```

## 5. 环境变量模板

- 后端模板：`packages/backend/.dev.vars.example`
- 前端模板：`packages/frontend/.env.example`

## 6. 初始化管理员账号

先创建本地密钥配置：

```bash
cp packages/backend/.dev.vars.example packages/backend/.dev.vars
```

然后执行管理员导入（默认打印 SQL，不执行）：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123"
```

直接写入 D1（`local` 或 `remote`）：

```bash
pnpm --filter @vip/backend admin:import -- --username admin --password "StrongPassword123" --target local
```
