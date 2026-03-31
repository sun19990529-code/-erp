import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, Line
} from 'recharts';
import { api } from '../api';

// 提升到模块顶层，避免父组件每次 re-render 产生新引用
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 min-w-[200px]">
        <p className="font-bold text-gray-800 mb-2 border-b border-gray-100 pb-2">{label}</p>
        {payload.map((entry, index) => {
          const val = entry.name === '出库(流出)' ? Math.abs(entry.value) : entry.value;
          return (
            <div key={index} className="flex items-center justify-between gap-4 text-sm mt-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                <span className="text-gray-600">{entry.name}</span>
              </div>
              <span className="font-bold font-mono" style={{ color: entry.color }}>{val}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

const DataCenter = () => {
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return { start: startStr, end: endStr };
  });

  const [financeData, setFinanceData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [productionData, setProductionData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState(30);

  const loadData = useCallback(async () => {
    setLoading(true);
    const qs = `start=${dateRange.start}&end=${dateRange.end}`;
    
    try {
      const [finRes, invRes, prodRes] = await Promise.all([
        api.get(`/report/finance-trend?${qs}`),
        api.get(`/report/inventory-trend?${qs}`),
        api.get(`/report/daily?${qs}`)
      ]);

      if (finRes.success) {
        setFinanceData(finRes.data.map(d => ({
          ...d,
          formattedDate: d.date.substring(5) // MM-DD
        })));
      }
      
      if (invRes.success) {
        // 出库量设为带负好的展示，以便生成中心背对背柱状图
        setInventoryData(invRes.data.map(d => ({
          ...d,
          formattedDate: d.date.substring(5),
          styled_outbound: -d.outbound // 呈现为负值在0轴下方
        })));
      }
      
      if (prodRes.success) {
        // 生产日报接口是倒序(因为是表格用途)，图表需要按时间正序
        const sortedProd = [...prodRes.data].reverse();
        setProductionData(sortedProd.map(d => ({
          ...d,
          formattedDate: d.date.substring(5)
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setPresetRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setActivePreset(days);
    setDateRange({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    });
  };

  const presetBtnClass = (days) =>
    `flex-1 sm:px-5 py-1.5 text-sm rounded-md transition-colors font-medium ${
      activePreset === days
        ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-blue-700 font-bold'
        : 'text-gray-600 hover:bg-white hover:shadow-sm'
    }`;

  return (
    <div className="fade-in max-w-[1600px] mx-auto space-y-6">
      {/* 头部控制器 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-2xl shadow-sm border border-gray-100 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-chart-line text-blue-600"></i> 数据大屏分析
          </h2>
          <p className="text-sm text-gray-500 mt-1">业财走势、库管流水及生产直通率时序透视</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex bg-gray-100/80 p-1 rounded-lg w-full sm:w-auto">
            <button onClick={() => setPresetRange(7)} className={presetBtnClass(7)}>近7天</button>
            <button onClick={() => setPresetRange(30)} className={presetBtnClass(30)}>近30天</button>
            <button onClick={() => setPresetRange(90)} className={presetBtnClass(90)}>近90天</button>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input type="date" value={dateRange.start} onChange={e => { setActivePreset(null); setDateRange(p => ({ ...p, start: e.target.value })); }} className="flex-1 sm:w-[130px] border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-1.5 text-sm outline-none" />
            <span className="text-gray-400 text-sm">至</span>
            <input type="date" value={dateRange.end} onChange={e => { setActivePreset(null); setDateRange(p => ({ ...p, end: e.target.value })); }} className="flex-1 sm:w-[130px] border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-1.5 text-sm outline-none" />
            <button onClick={loadData} disabled={loading} className="bg-blue-600 text-white p-2 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-blue-700 transition-colors shrink-0 disabled:opacity-50 shadow-sm">
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-refresh'}`}></i>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* 全宽度财务走势 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 xl:col-span-2 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
            <i className="fas fa-info-circle"></i> 按单据发生时间统计
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mr-3"><i className="fas fa-money-bill-wave"></i></div>
            财务流水走势 (元)
          </h3>
          <div className="h-80 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={financeData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} angle={financeData.length > 31 ? -45 : 0} textAnchor={financeData.length > 31 ? 'end' : 'middle'} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(value) => `¥${value}`} />
                <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                <Bar name="应收 (营入)" dataKey="receivable" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar name="应付 (支出)" dataKey="payable" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
            {financeData.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[1px] text-gray-400">无数据</div>
            )}
          </div>
        </div>

        {/* 产量与不良率走势 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
          <h3 className="font-bold text-gray-800 text-lg mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mr-3"><i className="fas fa-industry"></i></div>
            产量与制程不良率监控
          </h3>
          <div className="h-72 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <ComposedChart data={productionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc', stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4'}} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="square" />
                <Area yAxisId="left" type="monotone" name="有效产出量" dataKey="good_output" stroke="#8b5cf6" strokeWidth={3} fill="url(#colorOutput)" />
                <Bar yAxisId="left" name="不良查获量" dataKey="total_defect" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={20} />
                <Line yAxisId="right" type="stepAfter" name="不良率(%)" dataKey="defect_rate" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
            {productionData.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[1px] text-gray-400">该区段无报工记录</div>
            )}
          </div>
        </div>

        {/* 库管出入流水 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
          <h3 className="font-bold text-gray-800 text-lg mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3"><i className="fas fa-boxes"></i></div>
            仓储物资吞吐分析
          </h3>
          <div className="h-72 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={inventoryData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
                <Bar name="入库(流入)" dataKey="inbound" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} stackId="stack" />
                <Bar name="出库(流出)" dataKey="styled_outbound" fill="#f59e0b" radius={[0, 0, 4, 4]} maxBarSize={30} stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
            {inventoryData.length === 0 && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[1px] text-gray-400">该区段无出入库流水</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DataCenter;
