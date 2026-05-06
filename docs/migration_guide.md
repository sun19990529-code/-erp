# 服务机迁移操作指南（SQLite → PostgreSQL）

> 基于当前代码库状态和服务器配置（`msgy.asia` / `F:\erp-mes-system`）

---

## 概述

系统已从 SQLite 迁移到 PostgreSQL，服务机（Windows Server）目前仍在使用旧的 SQLite 版本。迁移需要完成 **3 件核心事情** + **4 件配套更新**。

```mermaid
flowchart LR
    A[服务机安装 PG] --> B[导出开发机数据]
    B --> C[导入服务机 PG]
    C --> D[更新 .env]
    D --> E[部署新代码]
    E --> F[验证]
```

---

## 一、服务机安装 PostgreSQL（约 10 分钟）

### 1.1 下载安装

- 下载 [PostgreSQL Windows 安装包](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)（推荐 16.x）
- 安装时记住设置的：
  - **端口号**：建议与开发机保持一致 `54321`（或使用默认 `5432`）
  - **超级用户密码**：设一个强密码，记好

> [!IMPORTANT]  
> 安装完成后确认 `pg_dump` 和 `pg_restore` 已在系统 PATH 中（安装器默认会添加）

### 1.2 创建数据库

安装完成后，用 pgAdmin 或 psql 创建数据库：

```sql
CREATE DATABASE "msgy-erp" ENCODING 'UTF8';
```

---

## 二、数据迁移（约 5 分钟）

### 方案 A：从开发机 pg_dump 导出（推荐）

在 **开发机** 上执行：

```powershell
# 导出开发机数据库（自定义格式，含索引和约束）
$env:PGPASSWORD = "sqm17709021"
pg_dump -h localhost -p 54321 -U postgres -F c -f "D:\erp-export.dump" msgy-erp
```

将 `erp-export.dump` 拷贝到服务机，然后在 **服务机** 上执行：

```powershell
# 导入到服务机 PostgreSQL
$env:PGPASSWORD = "你的服务机PG密码"
pg_restore -h localhost -p 54321 -U postgres -d msgy-erp --clean --if-exists "F:\erp-export.dump"
```

### 方案 B：如果服务机原本有生产数据（需要从 SQLite 迁入）

> 如果服务机上的 `mes.db` 有独立的生产数据且还没迁移到 PG，则需要跑迁移脚本

```powershell
cd F:\erp-mes-system\backend
# 确保 scripts/migrate-data.js 存在
node scripts/migrate-data.js
```

> [!WARNING]  
> 如果开发机和服务机的数据不同步（服务机有独立的生产业务数据），建议用方案 B 而非方案 A。方案 A 会覆盖服务机数据。

---

## 三、更新服务机代码 + 配置

### 3.1 推送新代码

```powershell
# 方法一：用现有 deploy.ps1 同步（如果 SSH 通道正常）
.\deploy\deploy.ps1

# 方法二：手动拷贝整个项目（排除 node_modules/.git/.env/数据库文件）
```

### 3.2 创建服务机 `.env` 文件

在服务机 `F:\erp-mes-system\backend\` 下创建 `.env`：

```ini
# PostgreSQL 数据库连接配置（服务机）
DB_HOST=localhost
DB_PORT=54321
DB_USER=postgres
DB_PASSWORD=你的服务机PG密码
DB_NAME=msgy-erp

# 生产环境标识
NODE_ENV=production

# JWT 密钥（生产环境必须设置！）
JWT_SECRET=一个足够复杂的随机字符串_至少32位
JWT_REFRESH_SECRET=另一个不同的随机字符串_至少32位

# 服务端口
PORT=3198
```

> [!CAUTION]  
> `JWT_SECRET` 和 `JWT_REFRESH_SECRET` 在生产环境下 **必须设置且不能相同**，否则服务会拒绝启动。

### 3.3 安装依赖

```powershell
cd F:\erp-mes-system\backend
npm install --production
```

> `better-sqlite3` 已从 `package.json` 移除，不会再安装。

### 3.4 重启服务

```powershell
pm2 restart erp
# 或
pm2 stop erp && cd F:\erp-mes-system\backend && pm2 start server.js --name erp && pm2 save
```

---

## 四、配套文件更新清单

以下文件仍包含 SQLite 相关内容，需要在部署前更新：

| 文件 | 需要更新的内容 | 紧急程度 |
|------|---------------|---------|
| `部署操作文档.md` | 第 84 行 `node -e "require('./database')"` 不再需要；第 122 行 SQLite 安全保障说明；第 136-159 行备份恢复命令全部过时 | 🔴 必须 |
| `install.bat` | 功能正常，无需改动 | ✅ 无需 |
| `start.bat` | 功能正常，无需改动 | ✅ 无需 |
| `server-start.ps1` | 版本号显示过旧 `v1.7.0` → `v1.8.1` | 🟡 建议 |
| `server-sync.ps1` | 检查是否有 SQLite 相关排除规则需要更新 | 🟡 建议 |
| `deploy/` 目录 | 当前为空目录，`deploy.ps1` 缺失，需要重新创建或从版本管理恢复 | 🟡 建议 |

---

## 五、验证检查清单

部署完成后逐项验证：

```
□ 访问 http://服务机IP:3198 能打开登录页
□ admin/admin123 能正常登录
□ 仪表盘数据正常加载
□ 库存预警页面不报错
□ 创建一条测试入库单 → 审核通过 → 库存正确增加
□ 生产工单报工 → 工序正常流转
□ 备份功能正常（系统管理 → 备份）
□ PM2 状态正常：pm2 status → online
```

---

## 六、回滚方案

如果迁移出现严重问题需要回滚：

1. `pm2 stop erp`
2. 使用 Git 切回 PostgreSQL 迁移前的版本
3. 将服务机 `.env` 删除（让代码走 SQLite 默认路径）
4. `pm2 start server.js --name erp`

> 前提：服务机上保留了原始 `mes.db` 文件
