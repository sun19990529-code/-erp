const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requirePermission } = require('../middleware/permission');

// 管理员专用中间件
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: '未授权访问' });
  if (req.user.role_code !== 'admin') return res.status(403).json({ success: false, message: '仅管理员可执行此操作' });
  next();
};

// 【F4】文件名合法性校验，防止路径穿越
function isValidBackupFilename(filename) {
  return /^mes-backup-[\w-]+\.db$/.test(filename);
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
  const backupFileName = `mes-backup-${timestamp}.db`;
  const backupFilePath = path.join(backupPath, backupFileName);
  
  await db.backup(backupFilePath);
  
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
      .filter(f => f.startsWith('mes-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupPath, f), time: fs.statSync(path.join(backupPath, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    if (files.length > maxBackups) files.slice(maxBackups).forEach(f => fs.unlinkSync(f.path));
  } catch (error) { console.warn('[backup] 清理旧备份失败:', error.message); }
}

function getBackupList(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) return [];
    return fs.readdirSync(backupPath)
      .filter(f => f.startsWith('mes-backup-') && f.endsWith('.db'))
      .map(f => { const stat = fs.statSync(path.join(backupPath, f)); return { name: f, size: stat.size, created: stat.mtime.toISOString() }; })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
  } catch (error) { return []; }
}

function startAutoBackup(getDb, saveDatabase) {
  const config = getBackupConfig();
  if (backupTimer) { clearInterval(backupTimer); backupTimer = null; }
  if (config.autoBackup && config.enabled) {
    backupTimer = setInterval(async () => {
      const result = await performBackup(getDb(), saveDatabase);
      if (result.success) console.log('自动备份完成:', result.file);
    }, config.intervalHours * 60 * 60 * 1000);
    console.log(`自动备份已启动，间隔: ${config.intervalHours} 小时`);
  }
}

// API 路由
router.get('/config', requireAdmin, (req, res) => {
  res.json({ success: true, data: getBackupConfig() });
});

router.put('/config', requireAdmin, (req, res) => {
  const config = getBackupConfig();
  const { autoBackup, intervalHours, backupPath, maxBackups, enabled } = req.body;
  if (typeof autoBackup === 'boolean') config.autoBackup = autoBackup;
  if (intervalHours && intervalHours > 0) config.intervalHours = intervalHours;
  if (backupPath) config.backupPath = backupPath;
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

router.get('/list', requireAdmin, (req, res) => {
  const config = getBackupConfig();
  const { backupPath } = req.query;
  const bPath = backupPath || config.backupPath;
  res.json({ success: true, data: getBackupList(bPath), backupPath: bPath });
});

router.delete('/file/:filename', requireAdmin, (req, res) => {
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
  try {
    const currentBackup = await performBackup(req.getDb(), req.saveDatabase);
    req.restoreDb(backupFilePath);
    res.json({ success: true, message: '数据库恢复成功', previousBackup: currentBackup.file });
  } catch (error) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = { router, startAutoBackup, performBackup };
