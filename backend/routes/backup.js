const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requirePermission } = require('../middleware/permission');

// ==================== PG 工具路径自动发现 ====================
let _pgBinPath = undefined;

/**
 * 自动查找 pg_dump / pg_restore 的所在目录
 * 优先级：PG_BIN_PATH 环境变量 > 常见安装目录 > 系统 PATH
 * 结果会被缓存（含空字符串），只扫描一次磁盘
 */
function getPgBinPath() {
  if (_pgBinPath !== undefined) return _pgBinPath;

  // 1. 优先使用 .env 中的 PG_BIN_PATH
  if (process.env.PG_BIN_PATH && fs.existsSync(path.join(process.env.PG_BIN_PATH, 'pg_dump.exe'))) {
    _pgBinPath = process.env.PG_BIN_PATH;
    return _pgBinPath;
  }

  // 2. 自动扫描常见安装目录
  const drives = ['C', 'D', 'E', 'F'];
  const patterns = [
    'PostgreSQL/18/bin', 'PostgreSQL/17/bin', 'PostgreSQL/16/bin', 'PostgreSQL/15/bin',
    'Program Files/PostgreSQL/18/bin', 'Program Files/PostgreSQL/17/bin',
    'Program Files/PostgreSQL/16/bin', 'Program Files/PostgreSQL/15/bin',
    'pgsql/bin',
  ];
  for (const drive of drives) {
    for (const pattern of patterns) {
      const candidate = `${drive}:/${pattern}`;
      const pgDumpPath = path.join(candidate, 'pg_dump.exe');
      if (fs.existsSync(pgDumpPath)) {
        _pgBinPath = candidate;
        console.log(`[backup] 自动发现 PostgreSQL 工具路径: ${_pgBinPath}`);
        return _pgBinPath;
      }
    }
  }

  // 3. 兜底：假定 pg_dump 在系统 PATH 中
  _pgBinPath = '';
  return _pgBinPath;
}

/** 获取 pg_dump 完整路径 */
function getPgDumpCmd() {
  const binPath = getPgBinPath();
  return binPath ? path.join(binPath, 'pg_dump') : 'pg_dump';
}

/** 获取 pg_restore 完整路径 */
function getPgRestoreCmd() {
  const binPath = getPgBinPath();
  return binPath ? path.join(binPath, 'pg_restore') : 'pg_restore';
}

// 管理员专用中间件
const requireAdmin = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: '未授权访问' });
  if (req.user.role_code !== 'admin') return res.status(403).json({ success: false, message: '仅管理员可执行此操作' });
  next();
};

// 【F4】文件名合法性校验，防止路径穿越
function isValidBackupFilename(filename) {
  return /^mes-backup-[\w-]+\.(db|sql|dump)$/.test(filename);
}
const BACKUP_CONFIG_PATH = path.join(__dirname, '..', 'backup-config.json');
let backupTimer = null;

function getBackupConfig() {
  try {
    if (fs.existsSync(BACKUP_CONFIG_PATH)) return JSON.parse(fs.readFileSync(BACKUP_CONFIG_PATH, 'utf-8'));
  } catch (error) { console.warn('[backup] 读取配置失败:', error.message); }
  return { enabled: true, autoBackup: true, interval: 'daily', intervalHours: 24, backupPath: path.join(__dirname, '../../backups'), maxBackups: 30, lastBackup: null, nextBackup: null };
}

function saveBackupConfig(config) {
  try { fs.writeFileSync(BACKUP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8'); return true; }
  catch (error) { return false; }
}

async function performBackup(db, saveDatabase, customPath = null) {
  const config = getBackupConfig();
  const backupPath = customPath || config.backupPath;
  if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFileName = `mes-backup-${timestamp}.dump`;
  const backupFilePath = path.join(backupPath, backupFileName);
  
  // PostgreSQL 备份：使用 pg_dump（execFileSync 防命令注入）
  const { execFileSync } = require('child_process');
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '54321';
  const user = process.env.DB_USER || 'postgres';
  const dbName = process.env.DB_NAME || 'msgy-erp';
  const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
  try {
    execFileSync(getPgDumpCmd(), ['-h', host, '-p', port, '-U', user, '-F', 'c', '-f', backupFilePath, dbName], { env, timeout: 60000 });
  } catch (e) {
    console.error('[backup] pg_dump 失败:', e.message);
    throw new Error('数据库备份失败');
  }
  
  config.lastBackup = now.toISOString();
  config.nextBackup = config.autoBackup ? new Date(now.getTime() + config.intervalHours * 60 * 60 * 1000).toISOString() : null;
  saveBackupConfig(config);
  cleanOldBackups(backupPath, config.maxBackups);
  
  const stat = fs.statSync(backupFilePath);
  return { success: true, file: backupFileName, path: backupFilePath, size: stat.size, timestamp: now.toISOString() };
}

function cleanOldBackups(backupPath, maxBackups) {
  try {
    const files = fs.readdirSync(backupPath)
      .filter(f => f.startsWith('mes-backup-') && (f.endsWith('.db') || f.endsWith('.sql') || f.endsWith('.dump')))
      .map(f => ({ name: f, path: path.join(backupPath, f), time: fs.statSync(path.join(backupPath, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    if (files.length > maxBackups) files.slice(maxBackups).forEach(f => fs.unlinkSync(f.path));
  } catch (error) { console.warn('[backup] 清理旧备份失败:', error.message); }
}

function getBackupList(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) return [];
    return fs.readdirSync(backupPath)
      .filter(f => f.startsWith('mes-backup-') && (f.endsWith('.db') || f.endsWith('.sql') || f.endsWith('.dump')))
      .map(f => { const stat = fs.statSync(path.join(backupPath, f)); return { name: f, size: stat.size, created: stat.mtime.toISOString() }; })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch (error) { return []; }
}

function startAutoBackup(getDb, saveDatabase) {
  const config = getBackupConfig();
  if (backupTimer) { clearInterval(backupTimer); backupTimer = null; }
  if (config.autoBackup && config.enabled) {
    backupTimer = setInterval(async () => {
      try {
        const result = await performBackup(getDb(), saveDatabase);
        if (result.success) console.log('自动备份完成:', result.file);
      } catch (e) {
        console.error('[backup] 自动备份失败:', e.message);
      }
    }, config.intervalHours * 60 * 60 * 1000);
    console.log(`自动备份已启动，间隔: ${config.intervalHours} 小时`);
  }
}

// API 路由
router.get('/config', requireAdmin, async (req, res) => {
  res.json({ success: true, data: getBackupConfig() });
});

router.put('/config', requireAdmin, async (req, res) => {
  const config = getBackupConfig();
  const { autoBackup, intervalHours, backupPath, maxBackups, enabled } = req.body;
  if (typeof autoBackup === 'boolean') config.autoBackup = autoBackup;
  if (intervalHours && intervalHours > 0) config.intervalHours = intervalHours;
  if (backupPath) {
    // 路径安全：白名单校验，限制在项目目录内
    const resolved = path.resolve(backupPath);
    const projectRoot = path.resolve(__dirname, '../..');
    if (!resolved.startsWith(projectRoot)) {
      return res.status(400).json({ success: false, message: '备份路径必须在项目目录内' });
    }
    config.backupPath = resolved;
  }
  if (maxBackups && maxBackups > 0) config.maxBackups = maxBackups;
  if (typeof enabled === 'boolean') config.enabled = enabled;
  if (saveBackupConfig(config)) {
    startAutoBackup(req.getDb, req.saveDatabase);
    res.json({ success: true, data: config, message: '备份配置已更新' });
  } else {
    res.status(500).json({ success: false, message: '保存配置失败' });
  }
});

router.post('/execute', requireAdmin, async (req, res) => {
  try {
    const { backupPath } = req.body;
    const result = await performBackup(req.getDb(), req.saveDatabase, backupPath);
    res.json({ success: true, data: result, message: '备份成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/list', requireAdmin, async (req, res) => {
  const config = getBackupConfig();
  const { backupPath } = req.query;
  const bPath = backupPath || config.backupPath;
  res.json({ success: true, data: getBackupList(bPath), backupPath: bPath });
});

router.delete('/file/:filename', requireAdmin, async (req, res) => {
  // 【F4】文件名合法性校验
  if (!isValidBackupFilename(req.params.filename)) {
    return res.status(400).json({ success: false, message: '非法文件名' });
  }
  const config = getBackupConfig();
  const filePath = path.join(config.backupPath, req.params.filename);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ success: true, message: '备份文件已删除' }); }
  else res.status(404).json({ success: false, message: '备份文件不存在' });
});

router.post('/restore', requireAdmin, async (req, res) => {
  const { filename } = req.body;
  // 【F4】文件名合法性校验
  if (!isValidBackupFilename(filename)) {
    return res.status(400).json({ success: false, message: '非法文件名' });
  }
  const config = getBackupConfig();
  const backupFilePath = path.join(config.backupPath, filename);
  if (!fs.existsSync(backupFilePath)) return res.status(404).json({ success: false, message: '备份文件不存在' });

  // 恢复前先备份当前数据（分离错误处理）
  let currentBackup;
  try {
    currentBackup = await performBackup(req.getDb(), req.saveDatabase);
  } catch (e) {
    console.error('[backup] 恢复前备份失败:', e.message);
    return res.status(500).json({ success: false, message: '恢复前自动备份失败，已终止操作，当前数据未受影响' });
  }

  // 执行数据库恢复
  try {
    const { execFileSync } = require('child_process');
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '54321';
    const user = process.env.DB_USER || 'postgres';
    const dbName = process.env.DB_NAME || 'msgy-erp';
    const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };
    execFileSync(getPgRestoreCmd(), ['-h', host, '-p', port, '-U', user, '-d', dbName, '--clean', '--if-exists', backupFilePath], { env, timeout: 120000 });
    res.json({ success: true, message: '数据库恢复成功', previousBackup: currentBackup.file });
  } catch (error) {
    console.error('[backup] pg_restore 失败:', error.message);
    res.status(500).json({ success: false, message: `数据库恢复失败，恢复前备份已保存: ${currentBackup.file}` });
  }
});

module.exports = { router, startAutoBackup, performBackup };
