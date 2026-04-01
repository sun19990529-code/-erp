import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import { exportMultiSheet } from '../utils/export';

const TrackingPage = () => {
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchedBatch, setSearchedBatch] = useState('');
  const [activeTab, setActiveTab] = useState('timeline');

  // 防抖搜索建议
  useEffect(() => {
    if (keyword.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const res = await api.get(`/tracking/batch?keyword=${encodeURIComponent(keyword)}`);
      if (res.success) setSuggestions(res.data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const searchBatch = useCallback(async (batchNo) => {
    if (!batchNo) return;
    setLoading(true);
    setSuggestions([]);
    setKeyword(batchNo);
    setSearchedBatch(batchNo);
    try {
      const res = await api.get(`/tracking/batch/${encodeURIComponent(batchNo)}`);
      setResult(res.success ? res.data : null);
    } catch { setResult(null); }
    setLoading(false);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    searchBatch(keyword.trim());
  };

  const typeConfig = {
    inbound:    { icon: 'fa-arrow-down',     color: 'text-green-600',  bg: 'bg-green-100', border: 'border-green-400', label: '入库' },
    inspection: { icon: 'fa-clipboard-check', color: 'text-blue-600',   bg: 'bg-blue-100',  border: 'border-blue-400',  label: '质检' },
    pick:       { icon: 'fa-hand-holding',    color: 'text-amber-600',  bg: 'bg-amber-100', border: 'border-amber-400', label: '领料' },
    outbound:   { icon: 'fa-arrow-up',        color: 'text-red-600',    bg: 'bg-red-100',   border: 'border-red-400',   label: '出库' },
  };

  const formatTime = (t) => {
    if (!t) return '-';
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-route text-teal-600"></i>
            批次溯源查询
          </h2>
          <p className="text-sm text-gray-500 mt-1">追踪批次从原材料入库到成品出库的完整生命周期</p>
        </div>
        {result && (
          <button onClick={() => exportMultiSheet(
            `批次溯源_${result.batch_no}_${new Date().toISOString().slice(0,10)}`,
            [
              { sheetName: '时间线', columns: [
                { header: '时间', key: 'time', width: 18 },
                { header: '类型', key: 'title', width: 8 },
                { header: '描述', key: 'description', width: 25 },
                { header: '详情', key: 'detail', width: 25 },
                { header: '备注', key: r => r.extra || '', width: 20 },
              ], data: result.timeline },
              { sheetName: '入库记录', columns: [
                { header: '单号', key: 'order_no', width: 18 },
                { header: '仓库', key: 'warehouse_name', width: 12 },
                { header: '产品', key: 'product_name', width: 18 },
                { header: '数量', key: 'quantity', width: 10 },
                { header: '单价', key: 'unit_price', width: 10 },
                { header: '供应商', key: r => r.supplier_name || '', width: 15 },
                { header: '时间', key: 'created_at', width: 18 },
              ], data: result.details.inbound },
              { sheetName: '领料记录', columns: [
                { header: '单号', key: 'order_no', width: 18 },
                { header: '物料', key: 'material_name', width: 18 },
                { header: '数量', key: 'quantity', width: 10 },
                { header: '生产工单', key: r => r.production_order_no || '', width: 18 },
                { header: '时间', key: 'created_at', width: 18 },
              ], data: result.details.pick },
              { sheetName: '出库记录', columns: [
                { header: '单号', key: 'order_no', width: 18 },
                { header: '产品', key: 'product_name', width: 18 },
                { header: '数量', key: 'quantity', width: 10 },
                { header: '客户', key: r => r.customer_name || '', width: 15 },
                { header: '时间', key: 'created_at', width: 18 },
              ], data: result.details.outbound },
            ]
          )} className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1">
            <i className="fas fa-file-excel text-green-600"></i>导出Excel
          </button>
        )}
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="输入批次号、入库单号搜索..."
                className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                autoFocus
              />
              {/* 搜索建议下拉 */}
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 z-20 max-h-60 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => searchBatch(s.batch_no)}
                      className="w-full px-4 py-3 text-left hover:bg-teal-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-gray-800">{s.batch_no}</span>
                        <span className="text-xs text-gray-400 ml-2">{s.product_name}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{s.source}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" disabled={loading} className="px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm flex items-center gap-2 disabled:opacity-50">
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
              溯源查询
            </button>
          </div>
        </form>
      </div>

      {/* 查询结果 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      )}

      {!loading && searchedBatch && !result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <i className="fas fa-box-open text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500">未找到批次号 <strong>{searchedBatch}</strong> 的相关记录</p>
          <p className="text-sm text-gray-400 mt-1">请检查批次号是否正确，或尝试搜索其他批次</p>
        </div>
      )}

      {!loading && result && (
        <>
          {/* 产品信息 + 统计摘要 */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            {/* 产品信息 */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">批次信息</div>
              <div className="font-bold text-lg text-teal-700 mb-2 break-all">{result.batch_no}</div>
              <div className="space-y-1 text-sm text-gray-600">
                <div><i className="fas fa-cube text-gray-400 mr-1.5 w-4"></i>{result.product?.name || '-'}</div>
                <div><i className="fas fa-barcode text-gray-400 mr-1.5 w-4"></i>{result.product?.code || '-'}</div>
                {result.product?.specification && (
                  <div><i className="fas fa-ruler text-gray-400 mr-1.5 w-4"></i>{result.product.specification}</div>
                )}
              </div>
            </div>
            {/* 四个统计卡片 */}
            {[
              { label: '总入库', value: result.summary.total_inbound, unit: result.product?.unit || '件', icon: 'fa-arrow-down', color: 'text-green-600', bg: 'bg-green-50' },
              { label: '已领用', value: result.summary.total_picked, unit: result.product?.unit || '件', icon: 'fa-hand-holding', color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: '已出库', value: result.summary.total_outbound, unit: result.product?.unit || '件', icon: 'fa-arrow-up', color: 'text-red-600', bg: 'bg-red-50' },
              { label: '当前库存', value: result.summary.current_stock, unit: result.product?.unit || '件', icon: 'fa-warehouse', color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <i className={`fas ${card.icon} ${card.color} text-sm`}></i>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs text-gray-400 mt-1">{card.unit}</div>
              </div>
            ))}
          </div>

          {/* Tab 切换 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex border-b">
              {[
                { key: 'timeline', label: '时间线', icon: 'fa-stream' },
                { key: 'inbound', label: `入库 (${result.details.inbound.length})`, icon: 'fa-arrow-down' },
                { key: 'pick', label: `领料 (${result.details.pick.length})`, icon: 'fa-hand-holding' },
                { key: 'outbound', label: `出库 (${result.details.outbound.length})`, icon: 'fa-arrow-up' },
                { key: 'production', label: `生产 (${result.details.production.length})`, icon: 'fa-industry' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium transition-colors flex items-center gap-1.5 border-b-2 ${
                    activeTab === tab.key
                      ? 'text-teal-600 border-teal-600 bg-teal-50/50'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={`fas ${tab.icon} text-xs`}></i>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* 时间线视图 */}
              {activeTab === 'timeline' && (
                <div className="relative">
                  {result.timeline.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">暂无流转记录</div>
                  ) : (
                    <div className="relative pl-8">
                      {/* 竖线 */}
                      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200"></div>
                      {result.timeline.map((item, i) => {
                        const cfg = typeConfig[item.type] || typeConfig.inbound;
                        return (
                          <div key={i} className="relative mb-6 last:mb-0">
                            {/* 圆点 */}
                            <div className={`absolute -left-5 top-1 w-5 h-5 rounded-full ${cfg.bg} border-2 ${cfg.border} flex items-center justify-center`}>
                              <i className={`fas ${cfg.icon} ${cfg.color} text-[8px]`}></i>
                            </div>
                            {/* 内容 */}
                            <div className="bg-gray-50/80 rounded-lg p-4 border border-gray-100 hover:border-gray-200 transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{item.title}</span>
                                  <span className="text-sm font-medium text-gray-700">{item.description}</span>
                                </div>
                                <span className="text-xs text-gray-400">{formatTime(item.time)}</span>
                              </div>
                              <div className="text-sm text-gray-600">{item.detail}</div>
                              {item.extra && <div className="text-xs text-gray-400 mt-1">{item.extra}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 入库明细 */}
              {activeTab === 'inbound' && (
                <div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">入库单号</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">类型</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">仓库</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">供应商</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">产品</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">数量</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">单价</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">时间</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {result.details.inbound.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{r.order_no}</td>
                            <td className="px-4 py-3">{r.type === 'raw' ? '原材料' : r.type === 'semi' ? '半成品' : r.type === 'finished' ? '成品' : r.type}</td>
                            <td className="px-4 py-3">{r.warehouse_name}</td>
                            <td className="px-4 py-3">{r.supplier_name || '-'}</td>
                            <td className="px-4 py-3">{r.product_name}</td>
                            <td className="px-4 py-3 text-right font-medium">{r.quantity} {r.unit || '件'}</td>
                            <td className="px-4 py-3 text-right">¥{(r.unit_price || 0).toFixed(2)}</td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(r.created_at)}</td>
                          </tr>
                        ))}
                        {result.details.inbound.length === 0 && (
                          <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400">暂无入库记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden space-y-3 p-1">
                    {result.details.inbound.map((r, i) => (
                      <div key={i} className="bg-gray-50/80 rounded-xl p-3 border border-gray-100">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-gray-800">{r.order_no}</div>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="text-sm text-gray-700 mb-1">{r.product_name}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                          <div>类型: <span className="text-gray-700">{r.type === 'raw' ? '原材料' : r.type === 'semi' ? '半成品' : '成品'}</span></div>
                          <div>数量: <span className="font-medium text-gray-800">{r.quantity} {r.unit || '件'}</span></div>
                          <div>仓库: <span className="text-gray-700">{r.warehouse_name}</span></div>
                          <div>单价: <span className="text-gray-700">¥{(r.unit_price || 0).toFixed(2)}</span></div>
                          {r.supplier_name && <div className="col-span-2">供应商: <span className="text-gray-700">{r.supplier_name}</span></div>}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-2 text-right">{formatTime(r.created_at)}</div>
                      </div>
                    ))}
                    {result.details.inbound.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">暂无入库记录</div>}
                  </div>
                </div>
              )}

              {/* 领料明细 */}
              {activeTab === 'pick' && (
                <div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">领料单号</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">仓库</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">物料</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">数量</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">生产工单</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">生产产品</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">时间</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {result.details.pick.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{r.order_no}</td>
                            <td className="px-4 py-3">{r.warehouse_name || '-'}</td>
                            <td className="px-4 py-3">{r.material_name}</td>
                            <td className="px-4 py-3 text-right font-medium">{r.quantity} {r.unit || '件'}</td>
                            <td className="px-4 py-3 text-teal-600 font-medium">{r.production_order_no || '-'}</td>
                            <td className="px-4 py-3">{r.production_product_name || '-'}</td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(r.created_at)}</td>
                          </tr>
                        ))}
                        {result.details.pick.length === 0 && (
                          <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">暂无领料记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden space-y-3 p-1">
                    {result.details.pick.map((r, i) => (
                      <div key={i} className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-gray-800">{r.order_no}</div>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="text-sm font-medium text-gray-700 mb-1">{r.material_name} <span className="text-amber-700 font-bold">{r.quantity} {r.unit || '件'}</span></div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                          <div>仓库: <span className="text-gray-700">{r.warehouse_name || '-'}</span></div>
                          <div>工单: <span className="text-teal-600 font-medium">{r.production_order_no || '-'}</span></div>
                          {r.production_product_name && <div className="col-span-2">生产产品: <span className="text-gray-700">{r.production_product_name}</span></div>}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-2 text-right">{formatTime(r.created_at)}</div>
                      </div>
                    ))}
                    {result.details.pick.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">暂无领料记录</div>}
                  </div>
                </div>
              )}

              {/* 出库明细 */}
              {activeTab === 'outbound' && (
                <div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">出库单号</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">仓库</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">产品</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">数量</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">客户</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">销售单号</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">时间</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {result.details.outbound.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{r.order_no}</td>
                            <td className="px-4 py-3">{r.warehouse_name || '-'}</td>
                            <td className="px-4 py-3">{r.product_name}</td>
                            <td className="px-4 py-3 text-right font-medium">{r.quantity} {r.unit || '件'}</td>
                            <td className="px-4 py-3">{r.customer_name || '-'}</td>
                            <td className="px-4 py-3">{r.sales_order_no || '-'}</td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(r.created_at)}</td>
                          </tr>
                        ))}
                        {result.details.outbound.length === 0 && (
                          <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">暂无出库记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden space-y-3 p-1">
                    {result.details.outbound.map((r, i) => (
                      <div key={i} className="bg-red-50/30 rounded-xl p-3 border border-red-100/50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-gray-800">{r.order_no}</div>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="text-sm font-medium text-gray-700 mb-1">{r.product_name} <span className="text-red-600 font-bold">{r.quantity} {r.unit || '件'}</span></div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                          <div>仓库: <span className="text-gray-700">{r.warehouse_name || '-'}</span></div>
                          <div>客户: <span className="text-gray-700">{r.customer_name || '-'}</span></div>
                          {r.sales_order_no && <div className="col-span-2">销售单号: <span className="text-gray-700">{r.sales_order_no}</span></div>}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-2 text-right">{formatTime(r.created_at)}</div>
                      </div>
                    ))}
                    {result.details.outbound.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">暂无出库记录</div>}
                  </div>
                </div>
              )}

              {/* 生产工单 */}
              {activeTab === 'production' && (
                <div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">工单号</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">产品</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">计划数量</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">完成数量</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">当前工序</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">状态</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">开始时间</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">完成时间</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {result.details.production.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-teal-600">{r.order_no}</td>
                            <td className="px-4 py-3">{r.product_name}</td>
                            <td className="px-4 py-3 text-right">{r.quantity} {r.unit || '件'}</td>
                            <td className="px-4 py-3 text-right font-medium">{r.completed_quantity || 0} {r.unit || '件'}</td>
                            <td className="px-4 py-3">{r.current_process || '-'}</td>
                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(r.start_time)}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{formatTime(r.end_time)}</td>
                          </tr>
                        ))}
                        {result.details.production.length === 0 && (
                          <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">暂无关联生产工单</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden space-y-3 p-1">
                    {result.details.production.map((r, i) => {
                      const pct = r.quantity > 0 ? Math.min(100, ((r.completed_quantity || 0) / r.quantity) * 100) : 0;
                      return (
                        <div key={i} className="bg-blue-50/30 rounded-xl p-3 border border-blue-100/50">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-bold text-teal-700">{r.order_no}</div>
                            <StatusBadge status={r.status} />
                          </div>
                          <div className="text-sm font-medium text-gray-700 mb-2">{r.product_name}</div>
                          <div className="bg-gray-100 rounded-full h-2 mb-2"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }}></div></div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                            <div>计划: <span className="text-gray-700">{r.quantity} {r.unit || '件'}</span></div>
                            <div>完成: <span className="font-medium text-teal-700">{r.completed_quantity || 0} {r.unit || '件'}</span></div>
                            <div>当前: <span className="text-gray-700">{r.current_process || '-'}</span></div>
                            <div>开始: <span className="text-gray-400">{formatTime(r.start_time)}</span></div>
                          </div>
                        </div>
                      );
                    })}
                    {result.details.production.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">暂无关联生产工单</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 空状态（初始） */}
      {!loading && !searchedBatch && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
          <div className="w-20 h-20 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-route text-3xl text-teal-400"></i>
          </div>
          <h3 className="text-lg font-bold text-gray-700 mb-2">批次全链路溯源</h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            输入批次号即可追踪该批次从原材料入库 → 领料生产 → 成品出库的完整生命周期，
            包含所有关联的入库单、领料单、生产工单和出库单。
          </p>
          <div className="flex items-center justify-center gap-6 mt-8 text-xs text-gray-400">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-400"></div>入库</div>
            <div className="flex items-center gap-1"><i className="fas fa-arrow-right text-gray-300"></i></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-400"></div>质检</div>
            <div className="flex items-center gap-1"><i className="fas fa-arrow-right text-gray-300"></i></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400"></div>领料</div>
            <div className="flex items-center gap-1"><i className="fas fa-arrow-right text-gray-300"></i></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400"></div>出库</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackingPage;
