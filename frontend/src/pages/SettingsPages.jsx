import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import SearchFilter from '../components/SearchFilter';
import SearchSelect, { SimpleSearchSelect } from '../components/SearchSelect';
import Table from '../components/Table';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { useDraftForm } from '../hooks/useDraftForm';
import SimpleCRUDManager from '../components/SimpleCRUDManager';

const BackupSettings = () => {
  const [config, setConfig] = useState({
    enabled: true,
    autoBackup: true,
    intervalHours: 24,
    backupPath: '',
    maxBackups: 30,
    lastBackup: null,
    nextBackup: null
  });
  const [backupList, setBackupList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backupNow, setBackupNow] = useState(false);
  const [customPath, setCustomPath] = useState('');

  const loadConfig = () => {
    api.get('/backup/config').then(res => {
      if (res.success) {
        setConfig(res.data);
        setCustomPath(res.data.backupPath);
      }
    });
  };

  const loadBackupList = () => {
    api.get('/backup/list').then(res => {
      if (res.success) {
        setBackupList(res.data);
      }
    });
  };

  useEffect(() => {
    loadConfig();
    loadBackupList();
  }, []);

  const saveConfig = async () => {
    const res = await api.put('/backup/config', {
      ...config,
      backupPath: customPath
    });
    if (res.success) {
      window.__toast?.warning('配置保存成功！');
      loadConfig();
    } else {
      alert(res.message || '保存失败');
    }
  };

  const executeBackup = async () => {
    if (!confirm('确定要立即执行备份吗？')) return;
    setLoading(true);
    const res = await api.post('/backup/execute', { backupPath: customPath });
    setLoading(false);
    if (res.success) {
      window.__toast?.warning(`备份成功！\n文件: ${res.data.file}\n大小: ${(res.data.size / 1024).toFixed(2)} KB`);
      loadBackupList();
      loadConfig();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const deleteBackup = async (filename) => {
    if (!confirm(`确定删除备份文件 ${filename}？`)) return;
    const res = await api.del(`/backup/file/${encodeURIComponent(filename)}`);
    if (res.success) {
      window.__toast?.warning('删除成功');
      loadBackupList();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const restoreBackup = async (filename) => {
    if (!confirm(`确定要从备份 ${filename} 恢复数据库吗？\n当前数据将被备份后覆盖！`)) return;
    const res = await api.post('/backup/restore', { filename });
    if (res.success) {
      window.__toast?.warning(`恢复成功！\n原数据已备份到: ${res.previousBackup}\n请刷新页面重新登录。`);
      window.location.reload();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">数据库备份设置</h2>
      </div>

      {/* 配置区域 */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h3 className="font-bold text-lg mb-4 pb-2 border-b">备份配置</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span>启用备份功能</span>
            </label>
            <label className="flex items-center space-x-2 mb-4">
              <input
                type="checkbox"
                checked={config.autoBackup}
                onChange={e => setConfig({ ...config, autoBackup: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span>启用自动备份</span>
            </label>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">备份间隔（小时）</label>
              <input
                type="number"
                value={config.intervalHours}
                onChange={e => setConfig({ ...config, intervalHours: parseInt(e.target.value) || 24 })}
                className="w-full border rounded-lg px-3 py-2"
                min="1"
                max="168"
                disabled={!config.autoBackup}
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">保留备份数量</label>
              <input
                type="number"
                value={config.maxBackups}
                onChange={e => setConfig({ ...config, maxBackups: parseInt(e.target.value) || 30 })}
                className="w-full border rounded-lg px-3 py-2"
                min="1"
                max="100"
              />
              <p className="text-xs text-gray-500 mt-1">超过此数量将自动删除最旧的备份</p>
            </div>
          </div>
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">备份保存路径</label>
              <input
                type="text"
                value={customPath}
                onChange={e => setCustomPath(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="例如: D:\backups"
              />
              <p className="text-xs text-gray-500 mt-1">请确保路径存在且有写入权限</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-500">上次备份:</span>
                  <span>{formatDate(config.lastBackup)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">下次备份:</span>
                  <span>{config.autoBackup ? formatDate(config.nextBackup) : '未启用自动备份'}</span>
                </div>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={saveConfig}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <i className="fas fa-save mr-2"></i>保存配置
              </button>
              <button
                onClick={executeBackup}
                disabled={loading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {loading ? '备份中...' : <><i className="fas fa-database mr-2"></i>立即备份</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 备份列表 */}
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <h3 className="font-bold text-lg">备份文件列表</h3>
          <button
            onClick={loadBackupList}
            className="text-blue-600 hover:text-blue-800"
          >
            <i className="fas fa-sync-alt mr-1"></i>刷新
          </button>
        </div>
        {backupList.length === 0 ? (
          <div className="text-center text-gray-500 py-8">暂无备份文件</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">文件名</th>
                  <th className="text-left p-3">大小</th>
                  <th className="text-left p-3">创建时间</th>
                  <th className="text-center p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {backupList.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-sm">{item.name}</td>
                    <td className="p-3">{formatSize(item.size)}</td>
                    <td className="p-3">{formatDate(item.created)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => restoreBackup(item.name)}
                        className="text-green-600 hover:text-green-800 mr-3"
                        title="恢复此备份"
                      >
                        <i className="fas fa-undo"></i>
                      </button>
                      <button
                        onClick={() => deleteBackup(item.name)}
                        className="text-red-600 hover:text-red-800"
                        title="删除此备份"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const AboutSystem = () => {
  const [version, setVersion] = useState({ version: 'v1.1.0', date: '2026-03-21' });

  useEffect(() => {
    // 尝试读取VERSION文件
    fetch('/VERSION')
      .then(res => res.text())
      .then(text => {
        const lines = text.split('\n');
        const versionLine = lines.find(l => l.includes('版本:'));
        const dateLine = lines.find(l => l.includes('发布日期:'));
        if (versionLine) {
          const v = versionLine.split(':')[1].trim();
          setVersion(prev => ({ ...prev, version: v }));
        }
        if (dateLine) {
          const d = dateLine.split(':')[1].trim();
          setVersion(prev => ({ ...prev, date: d }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">关于系统</h2>
      </div>
      <div className="bg-white rounded-xl shadow p-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <i className="fas fa-industry text-white text-4xl"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">铭晟管理系统</h1>
          <p className="text-gray-500 mt-2">Mingsheng Management System</p>
        </div>
        
        <div className="border-t border-b py-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">系统版本:</span>
              <span className="font-medium">{version.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">发布日期:</span>
              <span className="font-medium">{version.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">前端框架:</span>
              <span className="font-medium">React 18</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">后端框架:</span>
              <span className="font-medium">Express.js</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">数据库:</span>
              <span className="font-medium">SQLite (sql.js)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">UI框架:</span>
              <span className="font-medium">Tailwind CSS</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-bold mb-3">功能模块</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center"><i className="fas fa-chart-pie text-blue-500 mr-2 w-5"></i>系统概览</div>
            <div className="flex items-center"><i className="fas fa-warehouse text-green-500 mr-2 w-5"></i>仓库管理</div>
            <div className="flex items-center"><i className="fas fa-file-invoice text-purple-500 mr-2 w-5"></i>订单管理</div>
            <div className="flex items-center"><i className="fas fa-cogs text-orange-500 mr-2 w-5"></i>生产管理</div>
            <div className="flex items-center"><i className="fas fa-clipboard-check text-teal-500 mr-2 w-5"></i>质量检验</div>
            <div className="flex items-center"><i className="fas fa-shopping-cart text-pink-500 mr-2 w-5"></i>采购管理</div>
            <div className="flex items-center"><i className="fas fa-handshake text-indigo-500 mr-2 w-5"></i>委外加工</div>
            <div className="flex items-center"><i className="fas fa-database text-gray-500 mr-2 w-5"></i>基础数据</div>
          </div>
        </div>

        <div className="text-center text-gray-400 text-sm">
          <p>© 2026 铭晟管理系统. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export { BackupSettings, AboutSystem };
