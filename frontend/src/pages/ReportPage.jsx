import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { exportMultiSheet } from '../utils/export';

const ReportPage = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  });
  const [dailyData, setDailyData] = useState({ data: [], summary: {} });
  const [productData, setProductData] = useState([]);
  const [materialData, setMaterialData] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const qs = `start=${dateRange.start}&end=${dateRange.end}`;
    const [d, p, m] = await Promise.all([
      api.get(`/report/daily?${qs}`),
      api.get(`/report/by-product?${qs}`),
      api.get(`/report/material-consumption?${qs}`)
    ]);
    if (d.success) setDailyData({ data: d.data, summary: d.summary });
    if (p.success) setProductData(p.data);
    if (m.success) setMaterialData(m.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    const sheets = [];
    if (dailyData.data.length > 0) {
      sheets.push({
        sheetName: '生产日报',
        columns: [
          { header: '日期', key: 'date', width: 14 },
          { header: '工单数', key: 'order_count', width: 10 },
          { header: '总产出', key: 'total_output', width: 12 },
          { header: '不良数', key: 'total_defect', width: 10 },
          { header: '良品数', key: 'good_output', width: 12 },
          { header: '不良率(%)', key: 'defect_rate', width: 12 },
          { header: '报工次数', key: 'record_count', width: 10 }
        ],
        data: dailyData.data
      });
    }
    if (productData.length > 0) {
      sheets.push({
        sheetName: '按产品统计',
        columns: [
          { header: '产品编码', key: 'code', width: 15 },
          { header: '产品名称', key: 'name', width: 20 },
          { header: '规格', key: 'specification', width: 15 },
          { header: '工单数', key: 'order_count', width: 10 },
          { header: '计划数', key: 'planned_qty', width: 12 },
          { header: '完成数', key: 'completed_qty', width: 12 },
          { header: '完成率(%)', key: 'completion_rate', width: 12 },
          { header: '不良率(%)', key: 'defect_rate', width: 12 }
        ],
        data: productData
      });
    }
    if (materialData.length > 0) {
      sheets.push({
        sheetName: '物料消耗',
        columns: [
          { header: '物料编码', key: 'code', width: 15 },
          { header: '物料名称', key: 'name', width: 20 },
          { header: '单位', key: 'unit', width: 10 },
          { header: '计划用量', key: 'total_planned', width: 12 },
          { header: '实际用量', key: 'total_actual', width: 12 },
          { header: '超耗率(%)', key: 'waste_rate', width: 12 },
          { header: '使用次数', key: 'usage_count', width: 10 }
        ],
        data: materialData
      });
    }
    exportMultiSheet(`生产报表_${dateRange.start}_${dateRange.end}`, sheets);
  };

  const s = dailyData.summary;
  const tabs = [
    { id: 'daily', label: '生产日报', icon: 'fa-calendar-day' },
    { id: 'product', label: '按产品统计', icon: 'fa-boxes' },
    { id: 'material', label: '物料消耗', icon: 'fa-cubes' }
  ];

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">生产报表</h2>
          <p className="text-sm text-gray-500 mt-1">按日期区间汇总产量、不良率、物料消耗</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <span className="text-gray-400">至</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={load} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors text-sm">
            <i className="fas fa-search mr-1"></i>查询
          </button>
          <button onClick={handleExport} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
            <i className="fas fa-file-excel mr-1 text-green-600"></i>导出
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {[
          { label: '统计天数', value: s.days || 0, color: 'text-gray-800', icon: 'fa-calendar' },
          { label: '总产出', value: s.total_output || 0, color: 'text-blue-600', icon: 'fa-boxes' },
          { label: '良品数', value: s.total_good || 0, color: 'text-green-600', icon: 'fa-check-circle' },
          { label: '不良数', value: s.total_defect || 0, color: 'text-red-600', icon: 'fa-times-circle' },
          { label: '平均不良率', value: `${s.avg_defect_rate || 0}%`, color: s.avg_defect_rate > 5 ? 'text-red-600' : 'text-green-600', icon: 'fa-chart-line' }
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase mb-2">
              <i className={`fas ${c.icon} text-sm`}></i>{c.label}
            </div>
            <div className={`text-2xl font-bold ${c.color}`}>{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</div>
          </div>
        ))}
      </div>

      {/* Tab 切换 */}
      <div className="bg-gray-100/80 p-1 rounded-xl flex gap-1 border border-gray-200/50 mb-4 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === t.id ? 'bg-white text-teal-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-gray-500 hover:text-gray-800'}`}>
            <i className={`fas ${t.icon} mr-2`}></i>{t.label}
          </button>
        ))}
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <i className="fas fa-spinner fa-spin text-3xl mb-3 block"></i>加载中...
          </div>
        ) : activeTab === 'daily' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">日期</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">工单数</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">总产出</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">良品</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">不良</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">不良率</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">报工次数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dailyData.data.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                  <i className="fas fa-chart-bar text-4xl mb-3 block opacity-30"></i>该时段无生产数据
                </td></tr>
              ) : dailyData.data.map(d => (
                <tr key={d.date} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{d.date}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{d.order_count}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold text-blue-600">{d.total_output}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-green-600">{d.good_output}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-red-600">{d.total_defect}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${d.defect_rate > 5 ? 'bg-red-100 text-red-700' : d.defect_rate > 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {d.defect_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{d.record_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : activeTab === 'product' ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">产品编码</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">产品名称</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">工单数</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">计划数</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">完成数</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">完成率</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">不良率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {productData.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                  <i className="fas fa-boxes text-4xl mb-3 block opacity-30"></i>该时段无数据
                </td></tr>
              ) : productData.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-teal-600">{d.code}</td>
                  <td className="px-4 py-3 text-sm font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{d.order_count}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{d.planned_qty}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold text-blue-600">{d.completed_qty}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${Math.min(d.completion_rate, 100)}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-gray-600 w-12 text-right">{d.completion_rate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${d.defect_rate > 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {d.defect_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">物料编码</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">物料名称</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">单位</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">计划用量</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">实际用量</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">超耗率</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">使用次数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {materialData.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                  <i className="fas fa-cubes text-4xl mb-3 block opacity-30"></i>该时段无消耗数据
                </td></tr>
              ) : materialData.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-teal-600">{d.code}</td>
                  <td className="px-4 py-3 text-sm font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.unit}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{d.total_planned?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold">{d.total_actual?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${d.waste_rate > 10 ? 'bg-red-100 text-red-700' : d.waste_rate > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {d.waste_rate > 0 ? '+' : ''}{d.waste_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-gray-500">{d.usage_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
