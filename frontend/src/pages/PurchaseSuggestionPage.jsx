import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useConfirm } from '../components/ConfirmModal';
import { exportToExcel } from '../utils/export';

const urgencyConfig = {
  critical: { label: '紧急', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', icon: 'fa-exclamation-circle' },
  high:     { label: '较高', color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300', icon: 'fa-exclamation-triangle' },
  medium:   { label: '一般', color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300', icon: 'fa-info-circle' },
  normal:   { label: '正常', color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-300', icon: 'fa-check-circle' },
};

const PurchaseSuggestionPage = () => {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('both'); // safety|order|both
  const [selected, setSelected] = useState(new Set());
  const [confirm, ConfirmDialog] = useConfirm();
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get(`/purchase/suggestions?threshold=${filter}`);
    if (res.success) {
      setData(res.data || []);
      setSummary(res.summary || {});
      setSelected(new Set());
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(d => d.product_id)));
  };

  // 按供应商分组生成采购单
  const createOrders = async () => {
    const items = data.filter(d => selected.has(d.product_id));
    if (items.length === 0) { window.__toast?.error('请先勾选需要采购的物料'); return; }

    // 按默认供应商分组
    const groups = {};
    const noSupplier = [];
    items.forEach(item => {
      const supplier = item.default_supplier;
      if (supplier) {
        if (!groups[supplier.id]) groups[supplier.id] = { supplier, items: [] };
        groups[supplier.id].items.push(item);
      } else {
        noSupplier.push(item);
      }
    });

    if (noSupplier.length > 0) {
      window.__toast?.error(`${noSupplier.map(i => i.product_name).join('、')} 未绑定供应商，请先到产品档案中设置`);
      return;
    }

    const groupList = Object.values(groups);
    const msg = groupList.map(g =>
      `${g.supplier.name}：${g.items.length} 项物料，约 ¥${g.items.reduce((s, i) => s + Number(i.estimated_amount || 0), 0).toFixed(2)}`
    ).join('\n');

    if (!await confirm(`将生成 ${groupList.length} 张采购单：\n\n${msg}\n\n确认生成？`)) return;

    setCreating(true);
    let successCount = 0;
    const orderNos = [];
    for (const group of groupList) {
      const res = await api.post('/purchase/suggestions/create-order', {
        supplier_id: group.supplier.id,
        items: group.items.map(i => ({
          product_id: i.product_id,
          quantity: i.suggested_quantity,
          unit_price: i.unit_price,
        }))
      });
      if (res.success) {
        successCount++;
        orderNos.push(res.data.order_no);
      }
    }
    setCreating(false);

    if (successCount > 0) {
      window.__toast?.success(`成功生成 ${successCount} 张采购单：${orderNos.join('、')}`);
      load(); // 刷新列表
    }
  };

  const selectedItems = data.filter(d => selected.has(d.product_id));
  const selectedAmount = selectedItems.reduce((s, i) => s + i.estimated_amount, 0);

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-lightbulb text-amber-500"></i>
            智能采购建议
          </h2>
          <p className="text-sm text-gray-500 mt-1">根据安全库存和订单需求自动推荐采购物料及数量</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="both">全部缺口</option>
            <option value="safety">仅安全库存不足</option>
            <option value="order">仅订单需求缺口</option>
          </select>
          <button onClick={load} className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm">
            <i className="fas fa-sync-alt mr-1"></i>刷新
          </button>
          <button onClick={() => exportToExcel({
            filename: `采购建议_${new Date().toISOString().slice(0,10)}`,
            columns: [
              { header: '紧急度', key: r => ({ critical: '紧急', high: '较高', medium: '一般', normal: '正常' }[r.urgency]), width: 8 },
              { header: '物料编码', key: 'product_code', width: 15 },
              { header: '物料名称', key: 'product_name', width: 20 },
              { header: '规格', key: r => r.specification || '', width: 15 },
              { header: '当前库存', key: 'current_stock', width: 10 },
              { header: '安全库存', key: r => r.min_stock || '', width: 10 },
              { header: '订单缺口', key: 'order_shortage', width: 10 },
              { header: '在途采购', key: 'in_transit', width: 10 },
              { header: '建议采购量', key: 'suggested_quantity', width: 12 },
              { header: '参考单价', key: 'unit_price', width: 10 },
              { header: '预计金额', key: 'estimated_amount', width: 12 },
              { header: '首选供应商', key: r => r.default_supplier?.name || '未绑定', width: 15 },
            ],
            data, sheetName: '采购建议'
          })} disabled={data.length === 0}
            className="px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-1">
            <i className="fas fa-file-excel text-green-600"></i>导出Excel
          </button>
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: '建议采购项', value: summary.total_items || 0, icon: 'fa-clipboard-list', color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '紧急项', value: summary.critical_count || 0, icon: 'fa-exclamation-circle', color: 'text-red-600', bg: 'bg-red-50' },
          { label: '较高项', value: summary.high_count || 0, icon: 'fa-exclamation-triangle', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: '预计总金额', value: `¥${(summary.total_estimated_amount || 0).toLocaleString()}`, icon: 'fa-yen-sign', color: 'text-teal-600', bg: 'bg-teal-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
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

      {/* 建议列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 操作栏 */}
        {selected.size > 0 && (
          <div className="px-4 py-3 bg-teal-50 border-b border-teal-100 flex items-center justify-between">
            <span className="text-sm text-teal-700">
              <i className="fas fa-check-circle mr-1"></i>
              已选 <strong>{selected.size}</strong> 项，预计金额 <strong>¥{Number(selectedAmount || 0).toFixed(2)}</strong>
            </span>
            <button
              onClick={createOrders}
              disabled={creating}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-invoice"></i>}
              一键生成采购单
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check-circle text-2xl text-green-400"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-700 mb-1">库存充足</h3>
            <p className="text-sm text-gray-400">当前无需采购的物料，所有库存均满足安全库存和订单需求</p>
          </div>
        ) : (
          <div className="w-full">
            {/* 桌面端：标准表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left w-10">
                      <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll}
                        className="w-4 h-4 text-teal-600 rounded border-gray-300" />
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500">紧急度</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500">物料编码</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500">物料名称</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">当前库存</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">安全库存</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">订单缺口</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">在途采购</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500 text-teal-600">建议采购</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">参考单价</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">预计金额</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-500">首选供应商</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.map(item => {
                    const cfg = urgencyConfig[item.urgency] || urgencyConfig.normal;
                    return (
                      <tr key={item.product_id} className={`hover:bg-gray-50 ${selected.has(item.product_id) ? 'bg-teal-50/30' : ''}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={selected.has(item.product_id)} onChange={() => toggleSelect(item.product_id)}
                            className="w-4 h-4 text-teal-600 rounded border-gray-300" />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                            <i className={`fas ${cfg.icon}`}></i>{cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs">{item.product_code}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{item.product_name}</div>
                          {item.specification && <div className="text-xs text-gray-400">{item.specification}</div>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={item.current_stock === 0 ? 'text-red-600 font-bold' : ''}>{item.current_stock}</span>
                          <span className="text-gray-400 text-xs ml-0.5">{item.unit}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500">{item.min_stock || '-'}</td>
                        <td className="px-3 py-3 text-right">
                          {item.order_shortage > 0 ? (
                            <span className="text-amber-600 font-medium">{item.order_shortage}</span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.in_transit > 0 ? (
                            <span className="text-blue-600">{item.in_transit}</span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-bold text-teal-700 text-base">{item.suggested_quantity}</span>
                          <span className="text-gray-400 text-xs ml-0.5">{item.unit}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-600">¥{Number(item.unit_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-3 text-right font-medium">¥{Number(item.estimated_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-3">
                          {item.default_supplier ? (
                            <span className="text-sm">{item.default_supplier.name}</span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">未绑定</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端/PDA：触碰友好的大卡片流 */}
            <div className="block md:hidden space-y-3 p-2 bg-gray-50/30">
              <div className="flex items-center justify-between mb-3 px-1">
                <label className="flex items-center gap-2 text-sm text-gray-600 font-medium bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm active:bg-gray-50 transition-colors w-full justify-center">
                  <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll} className="w-5 h-5 text-teal-600 rounded border-gray-300" />
                  全选本页所有缺口
                </label>
              </div>
              
              {data.map(item => {
                const cfg = urgencyConfig[item.urgency] || urgencyConfig.normal;
                const isSelected = selected.has(item.product_id);
                return (
                  <div 
                    key={item.product_id} 
                    onClick={() => toggleSelect(item.product_id)} 
                    className={`relative bg-white rounded-2xl shadow-sm border p-4 transition-all active:scale-[0.98] ${isSelected ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50/5' : 'border-gray-100'}`}
                  >
                    {/* 右上角定制大触碰区 Checkbox（视觉居中，实际点击响应整张卡片） */}
                    <div className="absolute right-4 top-4">
                      <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-teal-600 border-teal-600' : 'border-gray-300 bg-gray-50'}`}>
                        {isSelected && <i className="fas fa-check text-white text-sm"></i>}
                      </div>
                    </div>
                    
                    {/* 首部标识：名称、规格与紧急度 */}
                    <div className="flex flex-col items-start gap-1 mb-4 pr-10">
                       <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                          <i className={`fas ${cfg.icon}`}></i>{cfg.label}
                       </span>
                       <div className="font-bold text-gray-800 text-lg leading-snug mt-1">{item.product_name}</div>
                       <div className="text-xs text-gray-500 font-mono flex gap-2 w-full truncate">
                         <span>{item.product_code}</span>
                         {item.specification && <span className="text-gray-400">· {item.specification}</span>}
                       </div>
                    </div>
                    
                    {/* 核心数据网格对比 */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-sm mt-2 border-t border-gray-50 pt-3">
                       <div className="bg-gray-50/80 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                         <span className="text-xs text-gray-400 mb-1">当前存量</span>
                         <span className={`text-xl font-bold ${item.current_stock === 0 ? 'text-red-500' : 'text-gray-700'}`}>{item.current_stock}<span className="text-xs font-normal ml-0.5">{item.unit}</span></span>
                       </div>
                       <div className="bg-orange-50/50 rounded-lg p-2 flex flex-col items-center justify-center text-center border border-orange-100/50">
                         <span className="text-xs text-orange-400 mb-1">订单挂起缺口</span>
                         <span className="text-xl font-bold text-orange-600">{item.order_shortage > 0 ? item.order_shortage : '-'}<span className="text-xs font-normal ml-0.5 hidden">{item.unit}</span></span>
                       </div>
                       
                       <div className="col-span-2 flex justify-between items-center bg-teal-50 rounded-xl p-3 border border-teal-100">
                         <div className="flex flex-col">
                           <span className="text-xs text-teal-600 mb-0.5 font-medium"><i className="fas fa-shopping-cart mr-1"></i>建议系统生成采购量</span>
                           <span className="text-teal-700 font-black text-2xl tracking-tight">{item.suggested_quantity} <span className="text-sm font-medium tracking-normal text-teal-600">{item.unit}</span></span>
                         </div>
                         <div className="text-right flex flex-col justify-end">
                           <span className="text-xs text-gray-400 mb-1">参考: ¥{Number(item.unit_price || 0).toFixed(2)} / {item.unit}</span>
                           <span className="font-bold text-teal-800 text-sm">预估 <span className="text-base text-gray-900">¥{Number(item.estimated_amount || 0).toFixed(2)}</span></span>
                         </div>
                       </div>
                    </div>
                    
                    {/* 特性与供应商 */}
                    <div className="flex justify-between items-center text-xs border-t border-gray-50 pt-3">
                       <div className="text-gray-500 flex items-center gap-1.5"><i className="fas fa-truck-loading text-blue-400"></i> 在途待收: {item.in_transit > 0 ? <strong className="text-blue-600">{item.in_transit}</strong> : '无'}</div>
                       <div className={`px-2 py-1.5 rounded-lg truncate max-w-[50%] font-medium ${item.default_supplier ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-gray-100 text-gray-400 italic'}`}>
                         {item.default_supplier ? item.default_supplier.name : '⚠ 未绑定供应商'}
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {ConfirmDialog}
    </div>
  );
};

export default PurchaseSuggestionPage;
