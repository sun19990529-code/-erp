import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useConfirm } from '../components/ConfirmModal';
import { exportToExcel } from '../utils/export';
import ActionToolbar from '../components/PurchaseSuggestion/ActionToolbar';
import StatCards from '../components/PurchaseSuggestion/StatCards';
import SuggestionTable from '../components/PurchaseSuggestion/SuggestionTable';

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

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(prev => {
      if (prev.size === data.length && data.length > 0) return new Set();
      return new Set(data.map(d => d.product_id));
    });
  }, [data]);

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
        })),
        remark: (() => {
          const sources = group.items.map(i => {
            if (!i.demand_sources || i.demand_sources.length === 0) return null;
            return `[${i.product_name}] ${i.demand_sources.map(d => `${d.order_no}(${d.shortage}${i.unit})`).join(', ')}`;
          }).filter(Boolean);
          return sources.length > 0 ? `基于智能建议。\n🔗需求溯源：\n${sources.join('\n')}` : '由智能采购建议自动生成';
        })()
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
    <div className="fade-in max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 px-1">
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
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF]"
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
            className="apple-btn-secondary px-3 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1">
            <i className="fas fa-file-excel text-green-600"></i>导出Excel
          </button>
        </div>
      </div>

      <StatCards summary={summary} />

      {/* 建议列表 */}
      <div className="bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-200/60 rounded-2xl overflow-hidden relative">
        {/* 操作栏 */}
        <ActionToolbar 
          selectedSize={selected.size} 
          selectedAmount={selectedAmount} 
          createOrders={createOrders} 
          creating={creating} 
        />

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
          <SuggestionTable 
            data={data}
            selected={selected}
            toggleSelect={toggleSelect}
            selectAll={selectAll}
          />
        )}
      </div>

      {ConfirmDialog}
    </div>
  );
};

export default PurchaseSuggestionPage;
