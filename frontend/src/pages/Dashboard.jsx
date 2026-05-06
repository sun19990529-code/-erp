import { useState } from 'react';
import { api } from '../api';
import { useSafeFetch } from '../hooks/useSafeFetch';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend } from 'recharts';

const CHART_STYLES = {
  axisTick: { fontSize: 12, fill: '#64748b' },
  tooltipContent: { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' },
  tooltipLabel: { fontWeight: 'bold', color: '#334155', marginBottom: '4px' },
  legendWrapper: { fontSize: '12px', paddingTop: '10px' }
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [purchaseSuggestions, setPurchaseSuggestions] = useState([]);
  
  useSafeFetch(async (isMounted) => { 
    api.get('/dashboard').then(res => isMounted.current && res.success && setStats(res.data)); 
    api.get('/dashboard/charts').then(res => isMounted.current && res.success && setChartData(res.data)); 
    api.get('/dashboard/purchase-suggestions').then(res => isMounted.current && res.success && setPurchaseSuggestions(res.data));
  }, []);
  
  if (!stats || !chartData) return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-teal-500"></i></div>;
  
  const COLORS = ['#14b8a6', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  return (
    <div className="fade-in">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">系统全景看板</h2>
      
      {/* 顶部数据快照 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover transition-all relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-50 z-0"></div>
          <div className="flex items-center justify-between relative z-10">
            <div><p className="text-sm font-medium text-gray-500 mb-1">待处理订单</p><p className="text-3xl font-bold text-gray-800">{stats.pendingOrders}</p></div>
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <i className="fas fa-shopping-cart text-xl text-blue-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover transition-all relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-50 rounded-full opacity-50 z-0"></div>
          <div className="flex items-center justify-between relative z-10">
            <div><p className="text-sm font-medium text-gray-500 mb-1">生产中单据</p><p className="text-3xl font-bold text-gray-800">{stats.processingOrders}</p></div>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <i className="fas fa-industry text-xl text-green-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover transition-all relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-50 rounded-full opacity-50 z-0"></div>
          <div className="flex items-center justify-between relative z-10">
            <div><p className="text-sm font-medium text-gray-500 mb-1">待检验处理</p><p className="text-3xl font-bold text-gray-800">{stats.pendingInspections}</p></div>
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <i className="fas fa-clipboard-check text-xl text-orange-600"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 card-hover transition-all relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-50 rounded-full opacity-50 z-0"></div>
          <div className="flex items-center justify-between relative z-10">
            <div><p className="text-sm font-medium text-gray-500 mb-1">异常预警节点</p><p className="text-3xl font-bold text-gray-800">{(stats.lowStock?.length || 0) + stats.qualityHoldOrders}</p></div>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <i className="fas fa-exclamation-triangle text-xl text-red-600"></i>
            </div>
          </div>
        </div>
      </div>
      
      {/* 第二行：生产进度 + 交期预警 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 生产进度概览 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 text-lg mb-4"><i className="fas fa-tasks text-teal-500 mr-2"></i>生产进度概览</h3>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {stats.productionProgress?.length > 0 ? stats.productionProgress.map(po => (
              <div key={po.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-800 truncate">{po.order_no}</span>
                    <span className="text-xs text-gray-500">{po.product_name}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${po.progress >= 100 ? 'bg-green-500' : po.progress >= 50 ? 'bg-teal-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(po.progress, 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{po.completed_quantity}/{po.quantity} {po.product_unit}</span>
                    <span className="font-bold">{po.progress}%</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center text-gray-400 py-8"><i className="fas fa-check-circle text-green-400 text-2xl mb-2"></i><p className="text-sm">暂无进行中的工单</p></div>
            )}
          </div>
        </div>

        {/* 交期预警 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 text-lg mb-4 flex items-center justify-between">
            <span><i className="fas fa-clock text-orange-500 mr-2"></i>交期预警</span>
            {stats.deliveryAlerts?.length > 0 && <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full">{stats.deliveryAlerts.length}项</span>}
          </h3>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {stats.deliveryAlerts?.length > 0 ? stats.deliveryAlerts.map(o => (
              <div key={o.id} className={`flex items-center justify-between p-3 rounded-xl border ${o.days_left <= 0 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                <div>
                  <div className="font-medium text-sm text-gray-800">{o.order_no}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.customer_name}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-sm ${o.days_left <= 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {o.days_left <= 0 ? '已逾期' : `剩余 ${o.days_left} 天`}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{o.delivery_date}</div>
                </div>
              </div>
            )) : (
              <div className="text-center text-gray-400 py-8"><i className="fas fa-calendar-check text-green-400 text-2xl mb-2"></i><p className="text-sm">近期无交付压力</p></div>
            )}
          </div>
        </div>
      </div>

      {/* 第三行：趋势图 + 饼图 + 缺料 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 左侧大图区：产能走势全景图 */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-lg"><i className="fas fa-chart-area text-teal-500 mr-2"></i>近 7 天业务产能走势</h3>
            <span className="text-xs px-2 py-1 bg-teal-50 text-teal-600 rounded-full font-medium">新产生业务流转</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={chartData.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={CHART_STYLES.axisTick} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={CHART_STYLES.axisTick} />
                <RechartsTooltip 
                  contentStyle={CHART_STYLES.tooltipContent}
                  labelStyle={CHART_STYLES.tooltipLabel}
                />
                <Legend iconType="circle" wrapperStyle={CHART_STYLES.legendWrapper} />
                <Area type="monotone" name="新接销售订单" dataKey="orders" stroke="#14b8a6" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                <Area type="monotone" name="下达生产工单" dataKey="productions" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorProd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* 订单状态饼图 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1">
            <h3 className="font-bold text-gray-800 text-lg mb-2"><i className="fas fa-chart-pie text-cyan-500 mr-2"></i>订单状态监控池</h3>
            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie data={chartData.orderStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {chartData.orderStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={CHART_STYLES.tooltipContent} />
                  <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 低水位预警 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center justify-between">
              <span><i className="fas fa-bell text-red-500 mr-2"></i>低水位缺料预警</span>
              {stats.lowStock?.length > 0 && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">{stats.lowStock.length}项</span>}
            </h3>
            <div className="overflow-y-auto flex-1 pr-1 space-y-3">
              {stats.lowStock?.length > 0 ? (
                stats.lowStock.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 sm:p-2 bg-red-50 border border-red-50 rounded-xl">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800 text-sm">{item.name} <span className="text-gray-400 text-xs">{item.code}</span></span>
                    </div>
                    <div className="text-right">
                      <div className="text-red-500 font-bold text-sm">{item.quantity} {item.unit || 'kg'}</div>
                      <div className="text-xs text-red-400 mt-1">安全基线: {item.alert_threshold} {item.unit || 'kg'}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                  <i className="fas fa-check-circle text-green-400 text-3xl mb-2"></i>
                  <p className="text-sm">当前库存健康，无料件告急。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 第四行：损耗排行 + 采购建议 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 损耗率排行 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 text-lg mb-4"><i className="fas fa-chart-bar text-purple-500 mr-2"></i>工单损耗排行 TOP5</h3>
          <div className="space-y-3">
            {chartData.wasteTop5?.length > 0 ? chartData.wasteTop5.map((w, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${w.waste_rate > 10 ? 'bg-red-100 text-red-600' : w.waste_rate > 5 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{w.order_no}</div>
                  <div className="text-xs text-gray-500">{w.product_name} · 计划{w.planned} / 实完{w.actual}</div>
                </div>
                <div className={`font-bold text-sm ${w.waste_rate > 10 ? 'text-red-600' : w.waste_rate > 5 ? 'text-orange-600' : 'text-green-600'}`}>
                  {w.waste_rate}%
                </div>
              </div>
            )) : (
              <div className="text-center text-gray-400 py-8"><i className="fas fa-trophy text-gray-300 text-2xl mb-2"></i><p className="text-sm">暂无完工工单数据</p></div>
            )}
          </div>
        </div>

        {/* 采购建议 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 text-lg mb-4"><i className="fas fa-shopping-bag text-blue-500 mr-2"></i>采购建议</h3>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {purchaseSuggestions.length > 0 ? purchaseSuggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div>
                  <div className="font-medium text-sm text-gray-800">{s.name} <span className="text-gray-400 text-xs">{s.code}</span></div>
                  <div className="text-xs text-gray-500 mt-0.5">缺口: {s.shortage} {s.unit} · 当前库存: {s.current_stock} {s.unit}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-blue-600">建议采购</div>
                  <div className="text-lg font-bold text-blue-700">{s.need_purchase} <span className="text-xs font-normal">{s.unit}</span></div>
                </div>
              </div>
            )) : (
              <div className="text-center text-gray-400 py-8"><i className="fas fa-box-check text-green-400 text-2xl mb-2"></i><p className="text-sm">当前库存充足，无需采购</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
