import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { api } from '../api';

const WorkshopMonitor = ({ onExit }) => {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchData = async () => {
    try {
      const [resStats, resCharts] = await Promise.all([
        api.get('/dashboard'),
        api.get('/dashboard/charts')
      ]);
      if (resStats.success) setStats(resStats.data);
      if (resCharts.success) setChartData(resCharts.data);
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    }
  };

  useEffect(() => {
    fetchData();
    // 大屏定时刷新逻辑 (每 30 秒)
    const interval = setInterval(fetchData, 30000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  if (!stats || !chartData) {
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
              系统运行正常 | 数据实时同步中
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
          <button 
            onClick={onExit}
            className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="退出大屏"
          >
            <i className="fas fa-compress-arrows-alt"></i>
          </button>
        </div>
      </header>

      {/* 核心内容区 */}
      <main className="flex-1 p-4 grid grid-cols-12 gap-4 min-h-0">
        
        {/* 左侧：生产总览与工单管线 */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <i className="fas fa-bolt text-4xl text-blue-500"></i>
              </div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">正在执行工单</div>
              <div className="text-4xl font-mono font-bold text-blue-400 shadow-blue-500/20 drop-shadow-md">
                {stats.processingOrders}
              </div>
            </div>
            <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <i className="fas fa-box text-4xl text-teal-500"></i>
              </div>
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">待处理业务</div>
              <div className="text-4xl font-mono font-bold text-teal-400 shadow-teal-500/20 drop-shadow-md">
                {stats.pendingOrders}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 flex-1 flex flex-col min-h-0 relative">
            <div className="absolute left-0 top-0 w-1 h-full bg-blue-600 rounded-l-xl"></div>
            <h3 className="text-sm font-bold text-gray-200 mb-4 flex items-center">
              <i className="fas fa-tasks text-blue-500 mr-2"></i>订单状态看板
            </h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.orderStatus} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} width={70} />
                  <Tooltip 
                    cursor={{fill: '#1e293b'}} 
                    contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc'}}
                    itemStyle={{color: '#60a5fa'}}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {chartData.orderStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 中间：主图表（高反差 AreaChart） */}
        <div className="col-span-6 bg-gray-800 border border-gray-700/50 rounded-xl p-4 flex flex-col min-h-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          <h3 className="text-sm font-bold text-gray-200 mb-6 flex items-center z-10">
            <i className="fas fa-chart-area text-blue-500 mr-2"></i>7 日业务流转全景侦测
          </h3>
          <div className="flex-1 min-h-0 z-10 w-full">
            <ResponsiveContainer width="99%" aspect={2}>
              <AreaChart data={chartData.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrdersDark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProdDark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3b82f6', borderRadius: '8px', boxShadow: '0 0 15px rgba(59,130,246,0.3)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}
                />
                <Area type="monotone" name="新接销售订单" dataKey="orders" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorOrdersDark)" style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.5))' }} />
                <Area type="monotone" name="下达生产工单" dataKey="productions" stroke="#14b8a6" strokeWidth={4} fillOpacity={1} fill="url(#colorProdDark)" style={{ filter: 'drop-shadow(0 0 8px rgba(20,184,166,0.5))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 右侧：预警中枢 */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          {/* 质检拦截 */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4 shrink-0 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
              <i className="fas fa-shield-alt text-4xl text-orange-500"></i>
            </div>
            <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">待质检验收 (Hold)</div>
            <div className="text-4xl font-mono font-bold text-orange-400 shadow-orange-500/20 drop-shadow-md">
              {stats.pendingInspections}
            </div>
          </div>

          {/* 低水位料件滚动栏 */}
          <div className="bg-gray-800 border-t-2 border-red-500/80 rounded-xl p-4 flex-1 flex flex-col min-h-0 relative shadow-[0_-2px_15px_rgba(239,68,68,0.15)]">
            <h3 className="text-sm font-bold text-red-400 mb-4 flex items-center justify-between">
              <span><i className="fas fa-exclamation-triangle mr-2"></i>低水位物料告警</span>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-md border border-red-500/30">
                {stats.lowStock?.length || 0} 项
              </span>
            </h3>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {stats.lowStock && stats.lowStock.length > 0 ? (
                stats.lowStock.map((item, i) => (
                  <div key={i} className="bg-gray-900 border border-red-900/50 rounded-lg p-3 flex justify-between items-center group hover:border-red-500/50 transition-colors">
                    <div>
                      <div className="font-bold text-gray-200 text-sm group-hover:text-red-400 transition-colors">{item.name}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{item.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-red-500 font-mono font-bold text-lg">{item.quantity}</div>
                      <div className="text-[10px] text-gray-500">基线: {item.alert_threshold}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600">
                  <i className="fas fa-check-circle text-green-500/50 text-4xl mb-3"></i>
                  <p className="text-sm">当前物料库存充足</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default WorkshopMonitor;
