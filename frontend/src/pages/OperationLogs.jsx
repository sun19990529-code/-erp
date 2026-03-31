import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Pagination from '../components/Pagination';

const moduleLabels = {
  product: '产品档案',
  supplier: '供应商',
  customer: '客户',
  orders: '销售订单',
  production: '生产工单',
  purchase: '采购管理',
  outsourcing: '委外管理',
  warehouse: '仓库管理',
  inbound: '入库管理',
  outbound: '出库管理',
  transfer: '调拨管理',
  inspection: '质量检验',
  workstation: '工位管理',
  system: '系统管理',
};

const moduleColors = {
  product: 'bg-blue-100 text-blue-700',
  supplier: 'bg-purple-100 text-purple-700',
  customer: 'bg-pink-100 text-pink-700',
  orders: 'bg-orange-100 text-orange-700',
  production: 'bg-teal-100 text-teal-700',
  purchase: 'bg-amber-100 text-amber-700',
  outsourcing: 'bg-indigo-100 text-indigo-700',
  warehouse: 'bg-emerald-100 text-emerald-700',
  inbound: 'bg-green-100 text-green-700',
  outbound: 'bg-red-100 text-red-700',
  transfer: 'bg-cyan-100 text-cyan-700',
  inspection: 'bg-yellow-100 text-yellow-700',
  workstation: 'bg-slate-100 text-slate-700',
  system: 'bg-gray-100 text-gray-700',
};

const OperationLogs = () => {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pageSize: 30 });
  const [filters, setFilters] = useState({ module: '', user_id: '', keyword: '', start_date: '', end_date: '' });
  const [filterOptions, setFilterOptions] = useState({ modules: [], users: [] });
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({ page, pageSize: pagination.pageSize });
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const res = await api.get(`/logs?${qs}`);
    if (res.success) {
      setData(res.data);
      if (res.pagination) setPagination(res.pagination);
      if (res.stats) setStats(res.stats);
    }
    setLoading(false);
  }, [filters, pagination.pageSize]);

  const loadFilters = async () => {
    const res = await api.get('/logs/filters');
    if (res.success) setFilterOptions(res.data);
  };

  useEffect(() => { load(); loadFilters(); }, []);

  const handleSearch = () => load(1);
  const handleReset = () => {
    setFilters({ module: '', user_id: '', keyword: '', start_date: '', end_date: '' });
    setTimeout(() => load(1), 0);
  };

  const formatTime = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const relativeTime = (t) => {
    if (!t) return '';
    const diff = Date.now() - new Date(t).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return '';
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-history text-teal-600"></i>
            操作日志
          </h2>
          <p className="text-sm text-gray-500 mt-1">查看系统操作记录，追踪数据变更历史</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: '总操作次数', value: stats.total?.toLocaleString(), icon: 'fa-list-alt', color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '今日操作', value: stats.today, icon: 'fa-calendar-day', color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: '涉及模块', value: filterOptions.modules?.length || 0, icon: 'fa-cubes', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: '活跃用户', value: filterOptions.users?.length || 0, icon: 'fa-users', color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
              <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                <i className={`fas ${card.icon} ${card.color} text-xs`}></i>
              </div>
            </div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* 筛选条件 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-gray-500 mb-1">关键字</label>
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                value={filters.keyword}
                onChange={e => setFilters(p => ({ ...p, keyword: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索操作内容..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              />
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">模块</label>
            <select value={filters.module} onChange={e => setFilters(p => ({ ...p, module: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20">
              <option value="">全部模块</option>
              {filterOptions.modules.map(m => (
                <option key={m} value={m}>{moduleLabels[m] || m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-gray-500 mb-1">操作人</label>
            <select value={filters.user_id} onChange={e => setFilters(p => ({ ...p, user_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20">
              <option value="">全部用户</option>
              {filterOptions.users.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.real_name || `用户#${u.user_id}`}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-gray-500 mb-1">开始日期</label>
            <input type="date" value={filters.start_date} onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-gray-500 mb-1">结束日期</label>
            <input type="date" value={filters.end_date} onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSearch} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium">
              <i className="fas fa-search mr-1"></i>查询
            </button>
            <button onClick={handleReset} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
              <i className="fas fa-undo mr-1"></i>重置
            </button>
          </div>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
          </div>
        ) : data.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <i className="fas fa-clipboard-list text-4xl mb-3 block opacity-30"></i>
            暂无操作日志记录
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.map((log, i) => (
              <div key={log.id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-colors flex items-start gap-4 group"
                style={{ animationDelay: `${i * 20}ms` }}>
                {/* 时间线圆点 */}
                <div className="flex-shrink-0 mt-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-400 ring-4 ring-teal-50 group-hover:ring-teal-100 transition-all"></div>
                </div>

                {/* 内容区 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {/* 操作动作 */}
                    <span className="font-medium text-gray-800 text-sm">{log.action}</span>
                    {/* 模块标签 */}
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${moduleColors[log.module] || 'bg-gray-100 text-gray-600'}`}>
                      {moduleLabels[log.module] || log.module}
                    </span>
                  </div>
                  {/* 详情 */}
                  {log.detail && (
                    <div className="text-xs text-gray-500 truncate max-w-xl" title={log.detail}>
                      {log.detail}
                    </div>
                  )}
                </div>

                {/* 操作人 */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs font-medium text-gray-600">
                    {log.user_name || (log.user_id ? `用户#${log.user_id}` : '系统')}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5" title={formatTime(log.created_at)}>
                    {relativeTime(log.created_at) || formatTime(log.created_at)?.slice(5)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {pagination.total > pagination.pageSize && (
          <div className="p-4 border-t border-gray-100">
            <Pagination
              current={pagination.page}
              total={pagination.total}
              pageSize={pagination.pageSize}
              onChange={(p) => load(p)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationLogs;
