import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  
  useEffect(() => { 
    api.get('/dashboard').then(res => res.success && setStats(res.data)); 
    api.get('/dashboard/charts').then(res => res.success && setChartData(res.data)); 
  }, []);
  
  if (!stats || !chartData) return <div className="flex items-center justify-center h-64"><i className="fas fa-spinner fa-spin text-3xl text-teal-500"></i></div>;
  
  const COLORS = ['#14b8a6', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];
  const RADIAN = Math.PI / 180;
  
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 左侧大图区：产能走势全景图 */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-lg"><i className="fas fa-chart-area text-teal-500 mr-2"></i>近 7 天业务产能走势</h3>
            <span className="text-xs px-2 py-1 bg-teal-50 text-teal-600 rounded-full font-medium">新产生业务流转</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
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
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area type="monotone" name="新接销售订单" dataKey="orders" stroke="#14b8a6" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                <Area type="monotone" name="下达生产工单" dataKey="productions" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorProd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* 右侧上层：大盘全管态监控 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1">
            <h3 className="font-bold text-gray-800 text-lg mb-2"><i className="fas fa-chart-pie text-cyan-500 mr-2"></i>订单状态监控池</h3>
            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.orderStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.orderStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 右侧下层：低水位预警带 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-bold text-gray-800 text-lg mb-3 flex items-center justify-between">
              <span><i className="fas fa-bell text-red-500 mr-2"></i>低水位缺料预警带</span>
              {stats.lowStock?.length > 0 && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">{stats.lowStock.length}项告警</span>}
            </h3>
            <div className="overflow-y-auto flex-1 pr-1 space-y-3">
              {stats.lowStock?.length > 0 ? (
                stats.lowStock.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-3 sm:p-2 bg-red-50 border border-red-50 rounded-xl">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800 text-sm">{item.name} <span className="text-gray-400 text-xs">{item.code}</span></span>
                      <span className="text-xs text-gray-500 mt-1"><i className="fas fa-cubes text-gray-400 mr-1"></i>全盘口汇总库存</span>
                    </div>
                    <div className="text-right">
                      <div className="text-red-500 font-bold text-sm">{item.quantity} kg</div>
                      <div className="text-xs text-red-400 mt-1">安全基线: {item.alert_threshold} kg</div>
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
    </div>
  );
};

export default Dashboard;
