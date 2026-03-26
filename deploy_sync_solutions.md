# 部署文件同步方案对比

> **问题**：当前 [deploy.ps1](file:///d:/%E9%A1%B9%E7%9B%AE/erp-mes-system/deploy.ps1) 使用 tar 解压覆盖，删除的文件不会同步到服务器

---

## 方案 A：Git 部署（推荐）

### 原理
服务器直接 `git pull` 拉取代码，Git 天然处理增、改、删。

### 前提条件
- 服务器已安装 Git
- 服务器能访问 Git 远程仓库（GitHub/Gitee）
- 首次需在服务器 `git clone` 初始化

### 部署流程
```
本地 → git add + commit + push
服务器 → git pull → npm install → npm run build（可选）→ pm2 restart erp
```

### deploy.ps1 改造要点

```powershell
# ========== 方案 A：Git 部署 ==========

$SERVER = "user@server-ip"
$REMOTE_DIR = "F:/erp-mes-system"

# 1. 本地构建前端
Write-Host "构建前端..." -ForegroundColor Cyan
Set-Location frontend
npm run build
Set-Location ..

# 2. 提交变更（含 dist/）
git add -A
$msg = "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $msg
git push origin main

# 3. 服务器拉取 + 重启
ssh $SERVER @"
  cd $REMOTE_DIR
  git pull origin main
  cd backend && npm install --production
  pm2 restart erp
"@

Write-Host "部署完成！" -ForegroundColor Green
```

### 注意事项

> [!IMPORTANT]
> 需要将 `frontend/dist/` 从 `.gitignore` 中移除，或在服务器端构建前端。

> [!WARNING]
> 首次部署需先在服务器执行：
> ```bash
> cd F:/
> git clone <你的仓库地址> erp-mes-system
> cd erp-mes-system/backend && npm install --production
> ```

### 优势
- ✅ 文件删除自动同步
- ✅ 完整版本历史，可 `git revert` 回滚
- ✅ 冲突检测，不会误覆盖服务器改动
- ✅ 无需 tar/scp，部署更快

### 劣势
- ❌ 需服务器安装 Git 并配置仓库访问权限
- ❌ 如果 dist/ 入 Git，仓库体积会增大

---

## 方案 B：解压前清理目录

### 原理
在现有 tar 部署流程中，解压前先删除旧的源码目录（保留数据文件），再解压新包。

### 前提条件
- 无额外依赖，仅修改现有 `deploy.ps1`

### deploy.ps1 改造要点

在现有 SSH 远程命令中，解压前增加清理步骤：

```powershell
# ========== 方案 B：解压前清目录 ==========

# 在远程 SSH 命令中，解压前增加：
ssh $SERVER @"
  cd F:/erp-mes-system

  # 清理旧文件（保留关键目录）
  # 删除后端源码（保留 node_modules 和数据库）
  Get-ChildItem backend -Exclude node_modules,*.db,*.db-shm,*.db-wal,backups,backup-config.json | Remove-Item -Recurse -Force
  
  # 删除前端构建产物
  Remove-Item -Recurse -Force frontend/dist -ErrorAction SilentlyContinue

  # 解压新包（覆盖）
  tar -xzf deploy-package.tar.gz

  # 安装依赖 + 重启
  cd backend && npm install --production
  pm2 restart erp
"@
```

### 保护清单（不删除）

| 路径 | 原因 |
|------|------|
| `backend/node_modules/` | 依赖目录，npm install 会增量更新 |
| `backend/*.db` | 生产数据库 |
| `backend/*.db-shm`, `*.db-wal` | SQLite WAL 文件 |
| `backend/backups/` | 数据库备份 |
| `backend/backup-config.json` | 备份配置 |

### 优势
- ✅ 零额外依赖，改动最小
- ✅ 完全兼容现有流程
- ✅ 文件删除同步生效

### 劣势
- ❌ 无版本历史，回滚需手动
- ❌ 每次全量清理 + 解压，耗时略增

---

## 对比总结

| 维度 | 方案 A：Git 部署 | 方案 B：清理目录 |
|------|-----------------|-----------------|
| 复杂度 | 中（需配置 Git） | 低（改几行脚本） |
| 删除同步 | ✅ 自动 | ✅ 全量清理 |
| 版本回滚 | ✅ `git revert` | ❌ 需手动备份 |
| 冲突检测 | ✅ 有 | ❌ 无 |
| 额外依赖 | Git | 无 |
| 推荐场景 | 长期维护项目 | 快速修复 |
