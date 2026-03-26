# 铭晟 ERP-MES 管理系统

> 面向中小型制造企业的一体化 ERP + MES 管理平台 · **v1.5.4**

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Tailwind CSS + React Router |
| 后端 | Node.js + Express + Helmet |
| 数据库 | SQLite (better-sqlite3) |
| 图表 | Recharts |
| 认证 | JWT 双 Token（access + refresh） |
| 校验 | Zod Schema |
| 测试 | Vitest（48 用例） |
| CI/CD | GitHub Actions |
| 文档 | Swagger UI（/api-docs） |

## 功能模块

- **仪表盘** — 经营数据可视化、趋势图表、库存预警
- **订单管理** — 销售订单 CRUD、自动生成生产工单
- **生产管理** — 生产工单、排程甘特图、工序报工、领料管理
- **仓库管理** — 入库/出库调度、库存台账、批次追踪
- **质量检验** — 来料/巡检/委外/成品四类检验
- **采购管理** — 采购单据、供应商管理
- **委外加工** — 委外工单、自动入库联动
- **基础数据** — 产品档案、供应商/客户/部门管理、材质分类（树形）
- **系统管理** — 角色权限、用户管理、数据备份与恢复
- **扫码工站** — 条码扫描快速跳转
- **车间大屏** — 生产状态全景监控

## 快速启动

```bash
# 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 启动后端 (默认 3198 端口)
cd backend && node server.js

# 启动前端开发服务
cd frontend && npm run dev

# 生产构建
cd frontend && npm run build

# 运行测试
cd backend && npm test

# 代码检查
cd backend && npm run lint

# API 文档
# 启动后端后访问 http://localhost:3198/api-docs
```

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端端口 | `3198` |
| `JWT_SECRET` | JWT 签名密钥 | 内置默认值（⚠️ 生产环境务必修改） |
| `JWT_REFRESH_SECRET` | Refresh Token 密钥 | 自动派生 |
| `JWT_EXPIRES_IN` | Access Token 有效期 | `2h` |

## 项目结构

```
erp-mes-system/
├── frontend/
│   └── src/
│       ├── components/     # 通用组件 (Table, Modal, ProcessConfigPanel...)
│       ├── pages/          # 页面模块 (Dashboard, Sidebar, *Pages...)
│       ├── context/        # React Context (Auth, Toast)
│       ├── hooks/          # 自定义 Hook (useDraftForm)
│       └── api/            # API 请求层（含缓存）
├── backend/
│   ├── server.js           # Express 入口
│   ├── database.js         # SQLite 初始化 & DDL
│   ├── config/             # jwt.js, security.js, swagger.js
│   ├── middleware/         # permission.js, validate.js, pagination.js
│   ├── validators/         # Zod Schema (schemas.js)
│   ├── routes/             # 12 个业务路由模块
│   ├── tests/              # Vitest 测试用例 (48 个)
│   └── utils/              # order-number, unit-convert
├── .github/workflows/      # GitHub Actions CI
├── .prettierrc             # 代码格式化配置
└── README.md
```

## 默认账号

| 账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123` | 管理员 |
| `user` | `123456` | 普通用户 |

## v1.5.0 新特性

### 安全增强
- 🔐 **双 Token 认证** — access token 2h + refresh token 30d，独立密钥签发
- 🛡️ **Helmet 安全头** — 防 XSS、点击劫持、MIME 嗅探
- ✅ **Zod Schema 校验** — 8 个 Schema 覆盖全部创建接口
- 🚦 **状态白名单** — 6 个模块防止非法状态转换

### 性能优化
- ⚡ **Table 虚拟滚动** — 超过 100 行自动启用，仅渲染可视区
- 📦 **请求缓存层** — GET 请求 30s TTL 缓存，写操作自动清除
- 🔍 **SQL 优化** — 委外 N+1 查询改为批量 SQL + 搜索索引

### 工程化
- 🧪 **48 个测试用例** — Vitest 覆盖工具函数、业务逻辑、集成流程
- 📚 **Swagger API 文档** — 访问 `/api-docs`
- 🔄 **GitHub Actions CI** — 推送自动运行 lint → test → build
- 🗺️ **React Router** — 30 个 URL 路由，支持浏览器前进后退

### v1.5.4 安全加固与代码重构
- 🔒 **Dashboard 权限补全** — 4 个仪表盘路由添加 `requirePermission('dashboard_view')`
- 🛡️ **Backup 路径注入修复** — `backupPath` 参数增加 `path.resolve()` + 穿越检测
- ♻️ **outsourcing.js 拆分** — PUT /:id/status 107 行 God Function → 4 个独立辅助函数
- 🎨 **confirm() → ConfirmModal** — 10 个文件 29 处原生 `confirm()` 替换为统一样式 `useConfirm` Hook
- 🗄️ **权限迁移机制** — `ensurePermissionExists()` 确保新增权限自动补充到现有数据库

### v1.5.3 代码审查与部署自动化
- 🧹 **全系统 import 清理** — 12 个页面共清理 93 个未使用 import
- ⚡ **load() 拆分优化** — PurchasePages/OrderPages/OutsourcingPages/BasicDataPages 初始化数据与动态刷新分离，减少重复请求
- 🔧 **API 路径修复** — `/processes` → `/production/processes`，修复委外/生产/质检页面 API 异常
- 🛡️ **错误守卫** — openView/openEdit 添加 API 异常捕获，防止白屏
- 🌐 **CORS 多域名** — 支持 `suncraft.site` 和 `msgy.asia` 双域名访问
- 📦 **Patch 依赖更新** — react-router-dom/recharts/vite/vitest 更新至最新 patch
- 🚀 **一键部署脚本** — `deploy/deploy.ps1` 支持 Windows→Windows 自动同步（构建→打包→上传→重启）
- 📄 **部署文档更新** — 新增远程服务器部署、PM2 管理、数据库备份恢复指南

### v1.5.2 代码质量优化
- 🧩 **ProcessConfigPanel 组件抽取** — 三处工序配置 UI 统一为共享组件，减少 260+ 行代码
- 🔒 **CSP 安全策略** — 从 `contentSecurityPolicy: false` 改为合理的指令配置
- 🛡️ **产品编码唯一性校验** — POST 创建时前置检查，防止重复编码
- ⚡ **buildTree O(n) 优化** — 材质分类树构建从 O(n²) 递归改为 HashMap 单次遍历
- 🔧 **竞态修复** — 原材料/半成品加载改为 `Promise.all` 消除状态覆盖
- 📦 **版本号自动注入** — Vite 构建时从 `package.json` 注入，"关于系统"页面自动同步

## 数据库关系图

```mermaid
erDiagram
    orders ||--o{ order_items : "包含"
    orders ||--o{ production_orders : "生成"
    orders ||--o{ outbound_orders : "出库"
    orders ||--o{ order_materials : "需求物料"

    production_orders ||--o{ production_process_records : "工序记录"
    production_orders ||--o{ outsourcing_orders : "委外"
    production_orders ||--o{ pick_orders : "领料"

    purchase_orders ||--o{ purchase_items : "明细"
    purchase_orders ||--o{ inbound_orders : "入库"

    outsourcing_orders ||--o{ outsourcing_items : "明细"
    outsourcing_orders ||--o{ outsourcing_inspections : "检验"

    inbound_orders ||--o{ inbound_items : "明细"
    inbound_orders ||--o{ inbound_inspections : "检验"
    outbound_orders ||--o{ outbound_items : "明细"
    pick_orders ||--o{ pick_items : "明细"

    warehouses ||--o{ inventory : "存放"
    products ||--o{ inventory : "库存"
    products ||--o{ product_processes : "工艺"
    product_processes ||--o{ process_materials : "物料"

    customers ||--o{ orders : "下单"
    suppliers ||--o{ purchase_orders : "供货"
    suppliers ||--o{ outsourcing_orders : "加工"

    roles ||--o{ users : "归属"
    roles ||--o{ role_permissions : "拥有"
    permissions ||--o{ role_permissions : "授予"
    departments ||--o{ users : "归属"
```

## 许可证

内部系统，仅限授权使用。
