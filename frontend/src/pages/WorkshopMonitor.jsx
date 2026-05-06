import { useState, useEffect } from 'react';
import { api } from '../api';
import ScaleContainer from '../components/ScaleContainer';

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 轻量级动效数字 Hook
const AnimatedNumber = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  useEffect(() => {
    if (displayValue === value) return;
    let current = displayValue;
    const step = Math.ceil(Math.abs(value - displayValue) / 10) || 1;
    const timer = setInterval(() => {
      current += current < value ? step : -step;
      if ((step > 0 && current >= value) || (step < 0 && current <= value)) {
        clearInterval(timer);
        setDisplayValue(value);
      } else {
        setDisplayValue(current);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [value, displayValue]);
  return <span className="tabular-nums">{displayValue}</span>;
};

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
      if (resStats.success) {
        setStats(prev => deepEqual(prev, resStats.data) ? prev : resStats.data);
      }
      if (resWorkshop.success) {
        setWorkshop(prev => deepEqual(prev, resWorkshop.data) ? prev : resWorkshop.data);
      }
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
    <ScaleContainer designWidth={1920} designHeight={1080}>
      <div className="text-white flex flex-col font-sans relative w-full h-full bg-[#020617]">
        {/* Apple 玻璃质感背景光晕 */}
        <div className="absolute top-0 inset-x-0 h-px bg-white/10"></div>
        <div className="absolute bottom-0 inset-x-0 h-px bg-white/10"></div>
      {/* 顶部状态栏 */}
      <header className="h-[88px] px-8 glass-dark-panel rounded-b-3xl mx-8 flex items-center justify-between shrink-0 mb-6 mt-0 relative z-10 border-t-0 shadow-[0_10px_40px_-10px_rgba(30,58,138,0.3)]">
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
            <div className="text-xs text-slate-300">
              {currentTime.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })}
            </div>
          </div>
          <button onClick={onExit} className="w-12 h-12 rounded-full glass-dark-panel flex items-center justify-center text-blue-400 hover:text-white hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-300" title="退出大屏">
            <i className="fas fa-sign-out-alt text-xl"></i>
          </button>
        </div>
      </header>

      {/* 核心内容区 */}
      <main className="flex-1 p-8 pt-2 grid grid-cols-12 gap-8 min-h-0">
        
        {/* 左侧：实时工单进度 */}
        <div className="col-span-3 flex flex-col gap-8 min-h-0">
          <div className="grid grid-cols-2 gap-6 shrink-0">
            <div className="glass-dark-panel rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                <i className="fas fa-bolt text-5xl text-blue-400"></i>
              </div>
              <div className="text-slate-300 font-semibold uppercase tracking-widest mb-1 text-sm">在制工单</div>
              <div className="text-5xl font-mono font-bold text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]">
                <AnimatedNumber value={workshop.liveOrders?.length || 0} />
              </div>
            </div>
            <div className="glass-dark-panel rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                <i className="fas fa-clipboard-check text-5xl text-teal-400"></i>
              </div>
              <div className="text-slate-300 font-semibold uppercase tracking-widest mb-1 text-sm">待质检</div>
              <div className="text-5xl font-mono font-bold text-teal-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)]">
                <AnimatedNumber value={stats.pendingInspections || 0} />
              </div>
            </div>
          </div>
          
          {/* 工单实时进度列表 */}
          <div className="glass-dark-panel rounded-3xl p-6 flex-1 flex flex-col min-h-0 relative">
            <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-500 rounded-l-3xl shadow-[0_0_15px_rgba(59,130,246,0.6)]"></div>
            <h3 className="text-md font-bold text-white/90 mb-5 flex items-center tracking-wider">
              <i className="fas fa-tasks text-blue-400 mr-2"></i>工单实时进度
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-3">
              {workshop.liveOrders?.length > 0 ? workshop.liveOrders.map(o => (
                <div key={o.id} className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 group hover:border-blue-500/30 transition-colors backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-mono text-blue-300 font-semibold">{o.order_no}</span>
                    <span className="text-xs font-bold text-white/90 bg-white/10 px-2 py-0.5 rounded-full">{o.progress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-2">
                    <div className={`h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-1000 ${o.progress >= 80 ? 'bg-green-400 text-green-400' : o.progress >= 40 ? 'bg-blue-400 text-blue-400' : 'bg-cyan-400 text-cyan-400'}`} style={{ width: `${Math.min(o.progress, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>{o.product_name}</span>
                    <span className="text-slate-200">{o.completed_quantity}/{o.quantity} {o.product_unit}</span>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <i className="fas fa-pause-circle text-slate-400 text-4xl mb-3"></i>
                  <p className="text-sm tracking-widest uppercase">暂无在制工单</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 中间：工序负荷 + 概览 */}
        <div className="col-span-6 flex flex-col gap-4 min-h-0">
          {/* 工序负荷看板 */}
          <div className="glass-dark-panel rounded-3xl p-6 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            <h3 className="text-md font-bold text-white/90 mb-5 flex items-center tracking-wider z-10 relative">
              <i className="fas fa-sitemap text-blue-400 mr-2"></i>工序负荷动态
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-3 custom-scrollbar relative z-10">
              {workshop.processLoad?.length > 0 ? workshop.processLoad.map((pl, i) => (
                <div key={i} className="flex-shrink-0 bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 min-w-[140px] text-center hover:bg-white/5 transition-colors backdrop-blur-md">
                  <div className="w-14 h-14 mx-auto rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
                    <span className="text-3xl font-mono font-bold text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.5)]"><AnimatedNumber value={pl.active_count} /></span>
                  </div>
                  <div className="text-sm text-white font-bold tracking-wide">{pl.name}</div>
                  <div className="text-[11px] text-slate-300 mt-1 uppercase tracking-widest">在制连接数</div>
                </div>
              )) : (
                <div className="w-full text-center py-8 text-slate-300"><p className="text-sm tracking-widest uppercase">暂无负荷数据</p></div>
              )}
            </div>
          </div>

          {/* 今日统计概览 */}
          <div className="glass-dark-panel rounded-3xl p-6 flex-1 flex flex-col min-h-0 mt-4">
            <h3 className="text-md font-bold text-white/90 mb-5 flex items-center tracking-wider">
              <i className="fas fa-chart-line text-teal-400 mr-2"></i>大盘神经中枢
            </h3>
            <div className="grid grid-cols-3 gap-6 mb-6 shrink-0">
              <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 text-center backdrop-blur-sm">
                <div className="text-4xl font-mono font-bold text-teal-300 drop-shadow-[0_0_10px_rgba(94,234,212,0.4)]"><AnimatedNumber value={workshop.todayRecords?.length || 0} /></div>
                <div className="text-xs text-slate-300 mt-2 uppercase tracking-widest">今日报工笔数</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 text-center backdrop-blur-sm">
                <div className="text-4xl font-mono font-bold text-blue-300 drop-shadow-[0_0_10px_rgba(147,197,253,0.4)]"><AnimatedNumber value={stats.processingOrders} /></div>
                <div className="text-xs text-slate-300 mt-2 uppercase tracking-widest">活跃生产链</div>
              </div>
              <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 text-center backdrop-blur-sm">
                <div className="text-4xl font-mono font-bold text-orange-300 drop-shadow-[0_0_10px_rgba(253,186,116,0.4)]"><AnimatedNumber value={stats.pendingOrders} /></div>
                <div className="text-xs text-slate-300 mt-2 uppercase tracking-widest">待处理突发</div>
              </div>
            </div>
            {/* 简要趋势 */}
            <div className="flex-1 min-h-0 text-center flex items-center justify-center">
              <div className="opacity-60 hover:opacity-100 transition-opacity">
                <i className="fas fa-broadcast-tower text-blue-400/50 text-6xl mb-4 drop-shadow-[0_0_20px_rgba(96,165,250,0.5)] animate-pulse"></i>
                <p className="text-xs text-slate-300 tracking-[0.2em] uppercase">全域系统运行监控频段 / 30S 刷新</p>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：今日报工动态 + 预警 */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          {/* 今日报工动态 */}
          <div className="glass-dark-panel rounded-3xl p-6 flex-1 flex flex-col min-h-0 relative">
            <div className="absolute left-0 top-0 w-1.5 h-full bg-teal-500 rounded-l-3xl shadow-[0_0_15px_rgba(20,184,166,0.6)]"></div>
            <h3 className="text-md font-bold text-white mb-5 flex items-center justify-between tracking-wider">
              <span><i className="fas fa-stream text-teal-400 mr-2"></i>今日报工动态</span>
              <span className="text-[10px] text-slate-200 bg-white/10 px-2 py-1 rounded tracking-widest uppercase">实时</span>
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-3">
              {workshop.todayRecords?.length > 0 ? workshop.todayRecords.map(r => (
                <div key={r.id} className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 text-xs backdrop-blur-sm group hover:border-teal-500/30 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-teal-300 font-semibold">{r.order_no}</span>
                    <span className="text-slate-300">{r.created_at?.substring(11, 16)}</span>
                  </div>
                  <div className="text-slate-200">
                    <span className="text-teal-400">{r.process_name}</span>
                    <span className="mx-1 text-slate-400">·</span>
                    <span className="text-white font-bold">{r.output_quantity}</span>
                    <span className="ml-1 text-slate-300">{r.product_unit}</span>
                    <span className="mx-1 text-slate-400">·</span>
                    <span>{r.operator || '操作员'}</span>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                  <i className="fas fa-clock text-slate-400 text-4xl mb-3"></i>
                  <p className="text-sm tracking-widest uppercase">今日暂无报工记录</p>
                </div>
              )}
            </div>
          </div>

          {/* 低水位预警 */}
          <div className="glass-dark-panel border-t-2 border-red-500/80 rounded-3xl p-6 max-h-[300px] flex flex-col shrink-0 shadow-[0_-2px_20px_rgba(239,68,68,0.2)]">
            <h3 className="text-md font-bold text-red-400 mb-5 flex items-center justify-between tracking-wider">
              <span><i className="fas fa-exclamation-triangle mr-2 text-red-500"></i>物料告警</span>
              <span className="bg-red-500/20 text-red-300 text-xs px-2 py-1 rounded-md border border-red-500/30 font-mono font-bold">
                {stats.lowStock?.length || 0} ITEMS
              </span>
            </h3>
            <div className="overflow-y-auto custom-scrollbar pr-3 space-y-3 flex-1">
              {stats.lowStock?.length > 0 ? stats.lowStock.slice(0, 5).map((item, i) => (
                <div key={i} className="bg-red-900/10 border border-red-500/20 rounded-2xl p-3 flex justify-between items-center text-xs backdrop-blur-sm group hover:bg-red-900/30 transition-colors">
                  <span className="font-bold text-white truncate">{item.name}</span>
                  <span className="text-red-400 font-mono font-bold ml-2 shrink-0 bg-red-950/50 px-2 py-1 rounded-full">{item.quantity} <span className="text-red-800">{item.unit || 'kg'}</span></span>
                </div>
              )) : (
                <div className="text-center text-slate-400 py-4"><i className="fas fa-check-circle text-green-500/30 text-3xl mb-2"></i><div className="text-xs tracking-widest uppercase">一切正常</div></div>
              )}
            </div>
          </div>
        </div>
      </main>
      </div>
    </ScaleContainer>
  );
};

export default WorkshopMonitor;
