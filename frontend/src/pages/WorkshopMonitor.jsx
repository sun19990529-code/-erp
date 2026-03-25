import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { api } from '../api';

const WorkshopMonitor = ({ onExit }) => {
  const [stats, setStats] = useState(null);
  const [workshop, setWorkshop] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = async () => {
    try {
      const [resStats, resWorkshop] = await Promise.all([
        api.get('/dashboard'),
        api.get('/dashboard/workshop')
      ]);
      if (resStats.success) setStats(resStats.data);
      if (resWorkshop.success) setWorkshop(resWorkshop.data);
    } catch (e) {
      console.error('Failed to fetch workshop data', e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, []);

  if (!stats || !workshop) {
    return (
      <div className="theme-dark min-h-screen bg-gray-900 flex items-center justify-center text-blue-500">
        <i className="fas fa-circle-notch fa-spin text-5xl"></i>
      </div>
    );
  }

  return (
    <div className="theme-dark min-h-screen bg-gray-900 text-gray-100 overflow-hidden flex flex-col font-sans">
      {/* 顶部状态栏 */}
      <header className="h-16 px-6 border-b border-gray-800 bg-gray-900 flex items-center justify-between shrink-0 shadow-lg relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <i className="fas fa-industry text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white">数字化车间生产指挥中心</h1>
            <div className="text-xs text-blue-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              系统运行正常 | 数据每30秒刷新
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-white tracking-widest">
              {currentTime.toLocaleTimeString('zh-CN', { hour12: false })}
            </div>
            <div className="text-xs text-gray-400">
              {currentTime.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })}
            </div>
          </div>
          <button onClick={onExit} className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="退出大屏">
            <i className="fas fa-compress-arrows-alt"></i>
          </button>
        </div>
      </header>

      {/* 核心内容区 */}
      <main className="flex-1 p-4 grid grid-cols-12 gap-4 min-h-0">
        
        {/* 左侧：实时工单进度 */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <i className="fas fa-bolt text-4xl text-blue-500"></i>
              </div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">在制工单</div>
              <div className="text-4xl font-mono font-bold text-blue-400 drop-shadow-md">
                {workshop.liveOrders?.length || 0}
              </div>
            </div>
            <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <i className="fas fa-clipboard-check text-4xl text-orange-500"></i>
              </div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">待质检</div>
              <div className="text-4xl font-mono font-bold text-orange-400 drop-shadow-md">
                {stats.pendingInspections}
              </div>
            </div>
          </div>
          
          {/* 工单实时进度列表 */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 flex-1 flex flex-col min-h-0 relative">
            <div className="absolute left-0 top-0 w-1 h-full bg-blue-600 rounded-l-xl"></div>
            <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center">
              <i className="fas fa-tasks text-blue-500 mr-2"></i>工单实时进度
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {workshop.liveOrders?.length > 0 ? workshop.liveOrders.map(o => (
                <div key={o.id} className="bg-gray-900 border border-gray-700/50 rounded-lg p-3 group hover:border-blue-500/50 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono text-blue-400">{o.order_no}</span>
                    <span className="text-xs font-bold text-white">{o.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${o.progress >= 80 ? 'bg-green-500' : o.progress >= 40 ? 'bg-blue-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(o.progress, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>{o.product_name}</span>
                    <span>{o.completed_quantity}/{o.quantity} {o.product_unit}</span>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600">
                  <i className="fas fa-pause-circle text-gray-700 text-3xl mb-2"></i>
                  <p className="text-sm">暂无在制工单</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 中间：工序负荷 + 概览 */}
        <div className="col-span-6 flex flex-col gap-4 min-h-0">
          {/* 工序负荷看板 */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center z-10">
              <i className="fas fa-sitemap text-blue-500 mr-2"></i>工序负荷看板
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {workshop.processLoad?.length > 0 ? workshop.processLoad.map((pl, i) => (
                <div key={i} className="flex-shrink-0 bg-gray-900 border border-gray-700/50 rounded-xl p-4 min-w-[120px] text-center hover:border-blue-500/50 transition-colors">
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center mb-2">
                    <span className="text-2xl font-mono font-bold text-blue-400">{pl.active_count}</span>
                  </div>
                  <div className="text-xs text-gray-400 font-medium">{pl.name}</div>
                  <div className="text-[10px] text-gray-600 mt-1">在制工单数</div>
                </div>
              )) : (
                <div className="w-full text-center py-6 text-gray-600"><p className="text-sm">暂无工序负荷数据</p></div>
              )}
            </div>
          </div>

          {/* 今日统计概览 */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 flex-1 flex flex-col min-h-0">
            <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center">
              <i className="fas fa-chart-line text-teal-500 mr-2"></i>今日报工统计
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-3xl font-mono font-bold text-teal-400">{workshop.todayRecords?.length || 0}</div>
                <div className="text-xs text-gray-500 mt-1">今日报工笔数</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-3xl font-mono font-bold text-blue-400">{stats.processingOrders}</div>
                <div className="text-xs text-gray-500 mt-1">生产中工单</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-3xl font-mono font-bold text-orange-400">{stats.pendingOrders}</div>
                <div className="text-xs text-gray-500 mt-1">待处理业务</div>
              </div>
            </div>
            {/* 简要趋势 */}
            <div className="flex-1 min-h-0 text-center text-gray-600 flex items-center justify-center">
              <div>
                <i className="fas fa-broadcast-tower text-blue-500/30 text-5xl mb-3"></i>
                <p className="text-xs text-gray-600">车间运行实况 · 30秒自动刷新</p>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：今日报工动态 + 预警 */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          {/* 今日报工动态 */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 flex-1 flex flex-col min-h-0 relative">
            <div className="absolute left-0 top-0 w-1 h-full bg-teal-600 rounded-l-xl"></div>
            <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center justify-between">
              <span><i className="fas fa-stream text-teal-500 mr-2"></i>今日报工动态</span>
              <span className="text-[10px] text-gray-500 bg-gray-900 px-2 py-1 rounded">实时</span>
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {workshop.todayRecords?.length > 0 ? workshop.todayRecords.map(r => (
                <div key={r.id} className="bg-gray-900 border border-gray-700/30 rounded-lg p-3 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-blue-400">{r.order_no}</span>
                    <span className="text-gray-600">{r.created_at?.substring(11, 16)}</span>
                  </div>
                  <div className="text-gray-400">
                    <span className="text-teal-400">{r.process_name}</span>
                    <span className="mx-1">·</span>
                    <span className="text-white font-bold">{r.output_quantity}</span>
                    <span className="ml-1">{r.product_unit}</span>
                    <span className="mx-1">·</span>
                    <span>{r.operator || '操作员'}</span>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600">
                  <i className="fas fa-clock text-gray-700 text-3xl mb-2"></i>
                  <p className="text-sm">今日暂无报工记录</p>
                </div>
              )}
            </div>
          </div>

          {/* 低水位预警 */}
          <div className="bg-gray-800 border-t-2 border-red-500/80 rounded-xl p-4 max-h-48 flex flex-col shrink-0 shadow-[0_-2px_15px_rgba(239,68,68,0.15)]">
            <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center justify-between">
              <span><i className="fas fa-exclamation-triangle mr-2"></i>物料告警</span>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-md border border-red-500/30">
                {stats.lowStock?.length || 0} 项
              </span>
            </h3>
            <div className="overflow-y-auto custom-scrollbar pr-2 space-y-2 flex-1">
              {stats.lowStock?.length > 0 ? stats.lowStock.slice(0, 5).map((item, i) => (
                <div key={i} className="bg-gray-900 border border-red-900/50 rounded-lg p-2 flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-300 truncate">{item.name}</span>
                  <span className="text-red-500 font-mono font-bold ml-2 shrink-0">{item.quantity} {item.unit || 'kg'}</span>
                </div>
              )) : (
                <div className="text-center text-gray-600 py-2"><i className="fas fa-check-circle text-green-500/50 text-xl"></i></div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default WorkshopMonitor;
