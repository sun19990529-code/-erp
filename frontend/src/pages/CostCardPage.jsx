import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { exportToExcel } from '../utils/export';

const CostCardPage = () => {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 20 });
    if (statusFilter) params.set('status', statusFilter);
    const res = await api.get(`/tracking/cost-summary?${params}`);
    if (res.success) {
      setData(res.data || []);
      setSummary(res.summary || {});
      setPagination(res.pagination || {});
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    setDetail(null);
    setActiveTab('summary');
    setScrapInput('');
    const res = await api.get(`/tracking/production/${id}/cost`);
    if (res.success) setDetail(res.data);
    setDetailLoading(false);
  };

  const [scrapInput, setScrapInput] = useState('');
  const [savingScrap, setSavingScrap] = useState(false);

  const saveScrapValue = async () => {
    if (!detail) return;
    setSavingScrap(true);
    const res = await api.put(`/tracking/production/${detail.production.id}/scrap-value`, {
      scrap_value: parseFloat(scrapInput) || 0
    });
    if (res.success) {
      window.__toast?.success('残值保存成功！');
      openDetail(detail.production.id);
      load();
    } else {
      window.__toast?.error(res.message);
    }
    setSavingScrap(false);
  };

  const formatMoney = (v) => `¥${(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatTime = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const profitColor = (rate) => rate > 20 ? 'text-green-600' : rate > 0 ? 'text-blue-600' : rate === 0 ? 'text-gray-500' : 'text-red-600';

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-calculator text-indigo-500"></i>
            工单成本卡
          </h2>
          <p className="text-sm text-gray-500 mt-1">每张生产工单的物料成本、委外成本及利润分析</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => exportToExcel({
            filename: `工单成本分析_${new Date().toISOString().slice(0,10)}`,
            columns: [
              { header: '工单号', key: 'order_no', width: 18 },
              { header: '产品', key: 'product_name', width: 20 },
              { header: '规格', key: 'specification', width: 15 },
              { header: '客户', key: r => r.customer_name || '', width: 15 },
              { header: '计划数量', key: 'quantity', width: 10 },
              { header: '完成数量', key: r => r.completed_quantity || 0, width: 10 },
              { header: '物料成本', key: 'material_cost', width: 12 },
              { header: '委外成本', key: 'outsourcing_cost', width: 12 },
              { header: '总成本', key: 'total_cost', width: 12 },
              { header: '单位成本', key: 'unit_cost', width: 12 },
              { header: '利润', key: 'profit', width: 12 },
              { header: '利润率%', key: 'profit_rate', width: 10 },
              { header: '状态', key: 'status', width: 10 },
            ],
            data, sheetName: '工单成本'
          })} disabled={data.length === 0}
            className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-1">
            <i className="fas fa-file-excel text-green-600"></i>导出Excel
          </button>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="">全部状态</option>
            <option value="completed">已完成</option>
            <option value="processing">生产中</option>
            <option value="pending">待生产</option>
          </select>
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: '物料成本', value: formatMoney(summary.total_material_cost), icon: 'fa-cubes', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '委外成本', value: formatMoney(summary.total_outsourcing_cost), icon: 'fa-truck', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: '总成本', value: formatMoney(summary.total_cost), icon: 'fa-coins', color: 'text-red-600', bg: 'bg-red-50' },
          { label: '总产值', value: formatMoney(summary.total_revenue), icon: 'fa-chart-line', color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '总利润', value: formatMoney(summary.total_profit), icon: 'fa-hand-holding-usd', color: 'text-green-600', bg: 'bg-green-50' },
          { label: '平均利润率', value: `${summary.avg_profit_rate || 0}%`, icon: 'fa-percentage', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
              <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                <i className={`fas ${card.icon} ${card.color} text-xs`}></i>
              </div>
            </div>
            <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* 工单列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div>
            {/* 桌面端表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">工单号</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">产品</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">客户</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500">完成/计划</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500">物料成本</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500">委外成本</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500 text-red-500">总成本</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500">单位成本</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-500">利润率</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">状态</th>
                  <th className="px-3 py-3 text-center font-medium text-gray-500">操作</th>
                </tr></thead>
                <tbody className="divide-y">
                  {data.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-indigo-600">{row.order_no}</td>
                      <td className="px-3 py-3">
                        <div>{row.product_name}</div>
                        {row.specification && <div className="text-xs text-gray-400">{row.specification}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-600">{row.customer_name || '-'}</td>
                      <td className="px-3 py-3 text-right">{row.completed_quantity || 0}/{row.quantity} {row.unit}</td>
                      <td className="px-3 py-3 text-right text-amber-600">{formatMoney(row.material_cost)}</td>
                      <td className="px-3 py-3 text-right text-purple-600">{formatMoney(row.outsourcing_cost)}</td>
                      <td className="px-3 py-3 text-right font-bold text-red-600">{formatMoney(row.total_cost)}</td>
                      <td className="px-3 py-3 text-right">{formatMoney(row.unit_cost)}/{row.unit}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={`font-bold ${profitColor(row.profit_rate)}`}>
                          {row.profit_rate > 0 ? '+' : ''}{row.profit_rate}%
                        </span>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => openDetail(row.id)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                          <i className="fas fa-file-invoice-dollar mr-1"></i>成本卡
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr><td colSpan="11" className="px-3 py-12 text-center text-gray-400">暂无工单数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* 移动端卡片流 */}
            <div className="block md:hidden space-y-3 p-2">
              {data.map(row => (
                <div key={row.id} onClick={() => openDetail(row.id)} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm active:scale-[0.98] transition-transform cursor-pointer">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-indigo-600 text-sm">{row.order_no}</div>
                      <div className="text-base font-medium text-gray-800 mt-0.5">{row.product_name}</div>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="bg-amber-50 rounded-lg p-2">
                      <div className="text-[10px] text-amber-500">物料</div>
                      <div className="text-sm font-bold text-amber-700">{formatMoney(row.material_cost)}</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2">
                      <div className="text-[10px] text-red-500">总成本</div>
                      <div className="text-sm font-bold text-red-700">{formatMoney(row.total_cost)}</div>
                    </div>
                    <div className={`rounded-lg p-2 ${row.profit_rate >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <div className="text-[10px] text-gray-500">利润率</div>
                      <div className={`text-sm font-bold ${profitColor(row.profit_rate)}`}>{row.profit_rate > 0 ? '+' : ''}{row.profit_rate}%</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
                    <span>完成 {row.completed_quantity || 0}/{row.quantity} {row.unit}</span>
                    <span>{row.customer_name || ''}</span>
                  </div>
                </div>
              ))}
              {data.length === 0 && <div className="text-center py-12 text-gray-400">暂无工单数据</div>}
            </div>
          </div>
        )}

        {/* 分页 */}
        {pagination.totalPages > 1 && (() => {
          const totalPages = pagination.totalPages;
          const windowSize = 5;
          let startP = Math.max(1, page - Math.floor(windowSize / 2));
          let endP = Math.min(totalPages, startP + windowSize - 1);
          if (endP - startP + 1 < windowSize) startP = Math.max(1, endP - windowSize + 1);
          const pages = Array.from({ length: endP - startP + 1 }, (_, i) => startP + i);
          return (
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <span className="text-sm text-gray-500">共 {pagination.total} 条，第 {page}/{totalPages} 页</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">‹</button>
                {startP > 1 && <><button onClick={() => setPage(1)} className="px-3 py-1 text-sm rounded hover:bg-gray-100">1</button><span className="px-1 text-gray-400">…</span></>}
                {pages.map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1 text-sm rounded ${p === page ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100'}`}>{p}</button>
                ))}
                {endP < totalPages && <><span className="px-1 text-gray-400">…</span><button onClick={() => setPage(totalPages)} className="px-3 py-1 text-sm rounded hover:bg-gray-100">{totalPages}</button></>}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30">›</button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 成本卡详情弹窗 */}
      <Modal isOpen={!!detail || detailLoading} onClose={() => setDetail(null)} title="工单成本卡明细" size="max-w-4xl">
        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : detail && (
          <div className="space-y-4">
            {/* 工单信息 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-lg text-sm">
              <div><strong>工单号：</strong>{detail.production.order_no}</div>
              <div><strong>产品：</strong>{detail.production.product_name}</div>
              <div><strong>客户：</strong>{detail.production.customer_name || '-'}</div>
              <div><strong>完成量：</strong>{detail.cost.completed_quantity} {detail.production.unit}</div>
            </div>

            {/* 成本汇总 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-600 mb-1">物料成本</div>
                <div className="text-xl font-bold text-amber-700">{formatMoney(detail.cost.material_cost)}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-xs text-purple-600 mb-1">委外成本</div>
                <div className="text-xl font-bold text-purple-700">{formatMoney(detail.cost.outsourcing_cost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors" onClick={() => { setActiveTab('scrap'); setScrapInput(detail.cost.scrap_value || ''); }}>
                <div className="text-xs text-emerald-600 mb-1 flex justify-between items-center">
                  废料冲抵 <i className="fas fa-edit text-emerald-400"></i>
                </div>
                <div className="text-xl font-bold text-emerald-700">-{formatMoney(detail.cost.scrap_value)}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <div className="text-xs text-red-600 mb-1">净总成本 / 单位成本</div>
                <div className="text-xl font-bold text-red-700">{formatMoney(detail.cost.total_cost)}</div>
                <div className="text-xs text-red-500">{formatMoney(detail.cost.unit_cost)}/{detail.production.unit}</div>
              </div>
              <div className={`rounded-lg p-3 border ${detail.cost.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="text-xs text-gray-600 mb-1">利润 / 利润率</div>
                <div className={`text-xl font-bold ${profitColor(detail.cost.profit_rate)}`}>{formatMoney(detail.cost.profit)}</div>
                <div className={`text-xs ${profitColor(detail.cost.profit_rate)}`}>{detail.cost.profit_rate > 0 ? '+' : ''}{detail.cost.profit_rate}%</div>
              </div>
            </div>

            {/* Tab */}
            <div className="flex border-b overflow-x-auto no-scrollbar">
              {[
                { key: 'summary', label: '用料对比', count: detail.material.summary.length },
                { key: 'material', label: '领料明细', count: detail.material.items.length },
                { key: 'outsourcing', label: '委外明细', count: detail.outsourcing.items.length },
                { key: 'funnel', label: '工序漏斗', count: detail.funnel?.length || 0 },
                { key: 'scrap', label: '回收录入', count: detail.cost.scrap_value > 0 ? 1 : 0 },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key ? 'text-indigo-600 border-indigo-600' : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}>
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {/* 物料汇总 */}
            {activeTab === 'summary' && (
              <div>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">物料编码</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">物料名称</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">理论耗量</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">实际下发</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">单价</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">金额</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">占比</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.material.summary.map((m, i) => {
                        const required = m.required_qty || 0;
                        const actual = m.total_qty || 0;
                        const safeRatio = required === 0 ? 0 : (actual / required);
                        const progressColor = safeRatio > 1.2 ? 'bg-red-500' : safeRatio > 1.02 ? 'bg-amber-500' : 'bg-green-500';
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{m.code}</td>
                            <td className="px-3 py-2">{m.name}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{required} {m.unit}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-between items-center text-xs w-28">
                                <span className={safeRatio > 1.2 ? 'text-red-600 font-bold' : ''}>{actual} {m.unit}</span>
                                {safeRatio > 0 && <span className="text-gray-400 ml-2">{(safeRatio*100).toFixed(0)}%</span>}
                              </div>
                              <div className="w-28 bg-gray-200 rounded-full h-1 mt-1">
                                <div className={`h-1 rounded-full ${progressColor}`} style={{width: `${Math.min(100, safeRatio * 100)}%`}}></div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">{formatMoney(m.unit_price)}</td>
                            <td className="px-3 py-2 text-right font-medium text-amber-600">{formatMoney(m.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-gray-400">
                              {detail.cost.total_cost > 0 ? (m.total_amount / detail.cost.total_cost * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        );
                      })}
                      {detail.material.summary.length === 0 && (
                        <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-400">暂无物料消耗记录</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="block md:hidden space-y-2">
                  {detail.material.summary.map((m, i) => (
                    <div key={i} className="bg-amber-50/30 rounded-lg p-3 border border-amber-100/50">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{m.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{m.code}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-amber-700">{formatMoney(m.total_amount)}</div>
                          <div className="text-[10px] text-gray-400">{detail.cost.total_cost > 0 ? (m.total_amount / detail.cost.total_cost * 100).toFixed(1) : 0}%</div>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-1 pt-1 border-t border-amber-100/50">
                        <span>用量: {m.total_qty} {m.unit}</span>
                        <span>单价: {formatMoney(m.unit_price)}</span>
                      </div>
                    </div>
                  ))}
                  {detail.material.summary.length === 0 && (
                    <div className="text-center py-6 text-gray-400">暂无物料消耗记录</div>
                  )}
                </div>
              </div>
            )}

            {/* 领料明细 */}
            {activeTab === 'material' && (
              <div>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">领料单号</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">物料</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">数量</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">单价</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">金额</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.material.items.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{m.pick_order_no}</td>
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2 text-right">{m.quantity} {m.unit}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(m.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-amber-600">{formatMoney(m.amount)}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{formatTime(m.pick_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="block md:hidden space-y-2">
                  {detail.material.items.map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{m.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{m.pick_order_no}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-amber-700">{formatMoney(m.amount)}</div>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-1 pt-1 border-t border-gray-100">
                        <span>{m.quantity} {m.unit}</span>
                        <span>单价: {formatMoney(m.unit_price)}</span>
                        <span className="ml-auto">{formatTime(m.pick_time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 委外明细 */}
            {activeTab === 'outsourcing' && (
              <div>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">委外单号</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">工序</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">供应商</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">金额</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">状态</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.outsourcing.items.map((o, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{o.order_no}</td>
                          <td className="px-3 py-2">{o.process_name || '-'}</td>
                          <td className="px-3 py-2">{o.supplier_name || '-'}</td>
                          <td className="px-3 py-2 text-right font-medium text-purple-600">{formatMoney(o.total_amount)}</td>
                          <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{formatTime(o.created_at)}</td>
                        </tr>
                      ))}
                      {detail.outsourcing.items.length === 0 && (
                        <tr><td colSpan="6" className="px-3 py-6 text-center text-gray-400">暂无委外记录</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="block md:hidden space-y-2">
                  {detail.outsourcing.items.map((o, i) => (
                    <div key={i} className="bg-purple-50/30 rounded-lg p-3 border border-purple-100/50">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{o.order_no}</div>
                          <div className="text-xs text-gray-500">{o.process_name || '-'} · {o.supplier_name || '-'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-purple-700">{formatMoney(o.total_amount)}</div>
                          <StatusBadge status={o.status} />
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-purple-100/50">{formatTime(o.created_at)}</div>
                    </div>
                  ))}
                  {detail.outsourcing.items.length === 0 && (
                    <div className="text-center py-6 text-gray-400">暂无委外记录</div>
                  )}
                </div>
              </div>
            )}

            {/* 工序漏斗 */}
            {activeTab === 'funnel' && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-4 flex items-center">
                  <i className="fas fa-filter text-indigo-500 mr-2"></i> 物流损耗漏斗 (数量逐级降落)
                </div>
                {detail.funnel && detail.funnel.length > 0 ? (
                  <div className="bg-white p-4 rounded border border-gray-100 shadow-sm">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={detail.funnel} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 5 }} barSize={24}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="process_name" type="category" width={80} tick={{fontSize: 12}} />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px'}} />
                        <Legend wrapperStyle={{fontSize: '12px'}} />
                        <Bar dataKey="output_qty" stackId="a" name="良品落入下道" fill="#10b981" animationDuration={1000} />
                        <Bar dataKey="defect_qty" stackId="a" name="可拾取废料/不良" fill="#f59e0b" animationDuration={1000} />
                        <Bar dataKey="invisible_loss" stackId="a" name="隐性蒸发/彻底损毁" fill="#ef4444" animationDuration={1000} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">尚无完成的报工记录以聚合漏斗</div>
                )}
              </div>
            )}

            {/* 残值回收录入 */}
            {activeTab === 'scrap' && (
              <div className="p-6 bg-emerald-50/50 rounded-lg border border-emerald-100">
                <div className="max-w-md mx-auto">
                  <div className="text-center mb-6">
                    <div className="inline-flex w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full items-center justify-center text-xl mb-3">
                      <i className="fas fa-recycle"></i>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">工单边角料 / 废品残值变卖回收</h3>
                    <p className="text-sm text-gray-500 mt-1">录入变卖废料获得的回款，将直接冲减该生产批次的总成本</p>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">回收变现金额 (¥)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 sm:text-sm">¥</span>
                      </div>
                      <input 
                        type="number" 
                        value={scrapInput} 
                        onChange={e => setScrapInput(e.target.value)}
                        placeholder="0.00"
                        className="pl-7 block w-full border border-gray-300 rounded-lg shadow-sm py-3 focus:ring-emerald-500 focus:border-emerald-500" 
                      />
                    </div>
                  </div>
                  
                  <button 
                    onClick={saveScrapValue} 
                    disabled={savingScrap}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium shadow-sm active:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {savingScrap ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-check mr-2"></i>}
                    确认登记冲抵
                  </button>
                </div>
              </div>
            )}
            
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CostCardPage;
