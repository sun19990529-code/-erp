import React, { useState, useEffect } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import Table from '../components/Table';

/**
 * 损耗率颜色：≤5% 绿色, 5~15% 橙色, >15% 红色
 */
const LossRateBadge = ({ rate }) => {
  if (rate === null || rate === undefined) return <span className="text-gray-400">-</span>;
  const color = rate <= 5 ? 'text-green-600 bg-green-50 border-green-200' 
    : rate <= 15 ? 'text-orange-600 bg-orange-50 border-orange-200' 
    : 'text-red-600 bg-red-50 border-red-200';
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${color}`}>{rate.toFixed(2)}%</span>;
};

/**
 * 进度条组件
 */
const ProgressBar = ({ current, total, unit = '公斤', label }) => {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const color = pct >= 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : pct > 0 ? 'bg-orange-500' : 'bg-gray-300';
  return (
    <div>
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }}></div>
        </div>
        <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{current}/{total} {unit} ({pct.toFixed(0)}%)</span>
      </div>
    </div>
  );
};

/**
 * 统计卡片
 */
const colorStyles = {
  teal:   { bg: 'bg-teal-50', border: 'border-teal-200', icon: 'text-teal-500', value: 'text-teal-700' },
  blue:   { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500', value: 'text-blue-700' },
  green:  { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-500', value: 'text-green-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500', value: 'text-orange-700' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-500', value: 'text-indigo-700' },
  red:    { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500', value: 'text-red-700' },
  gray:   { bg: 'bg-gray-50', border: 'border-gray-200', icon: 'text-gray-500', value: 'text-gray-700' },
};

const StatCard = ({ icon, label, value, unit = '公斤', color = 'teal', sub }) => {
  const c = colorStyles[color] || colorStyles.teal;
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <i className={`fas ${icon} ${c.icon}`}></i>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className={`text-xl font-bold ${c.value}`}>{typeof value === 'number' ? value.toFixed(2) : value} <span className="text-sm font-normal">{unit}</span></div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
};

// ==================== 工单追踪面板 ====================
const ProductionTrackingPanel = ({ productionId, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productionId) return;
    setLoading(true);
    api.get(`/tracking/production/${productionId}/tracking`).then(res => {
      if (res.success) setData(res.data);
      setLoading(false);
    });
  }, [productionId]);

  if (loading) return <div className="p-8 text-center text-gray-500"><i className="fas fa-spinner fa-spin mr-2"></i>加载中...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">数据加载失败</div>;

  const { production, materials, output, process, loss } = data;

  return (
    <div className="space-y-6">
      {/* 工单信息 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><span className="text-gray-500">工单号：</span><span className="font-mono font-medium">{production.order_no}</span></div>
        <div><span className="text-gray-500">产品：</span><span className="font-medium">{production.product_name}</span></div>
        <div><span className="text-gray-500">目标产量：</span><span className="font-medium">{production.quantity} {production.unit}</span></div>
        <div><span className="text-gray-500">状态：</span><StatusBadge status={production.status} /></div>
        {production.sales_order_no && <div><span className="text-gray-500">销售订单：</span><span className="font-mono">{production.sales_order_no}</span></div>}
        {production.customer_name && <div><span className="text-gray-500">客户：</span>{production.customer_name}</div>}
      </div>

      {/* 核心统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="fa-boxes" label="总领料量" value={materials.total_picked} color="blue" />
        <StatCard icon="fa-industry" label="成品产出" value={output.finished_quantity} color="green" />
        <StatCard icon="fa-fire" label="损耗量" value={loss.loss_quantity} color="orange" />
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <i className="fas fa-chart-pie text-gray-500"></i>
            <span className="text-sm text-gray-600">损耗率</span>
          </div>
          <div className="text-xl font-bold"><LossRateBadge rate={loss.loss_rate} /></div>
          <div className="text-xs text-gray-500 mt-1">投入 {loss.total_input} → 产出 {loss.total_output}</div>
        </div>
      </div>

      {/* 生产进度 */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3"><i className="fas fa-tasks text-teal-500 mr-2"></i>生产进度</h4>
        <ProgressBar current={output.finished_quantity} total={production.quantity} unit={production.unit} label="成品完成进度" />
        {output.semi_quantity > 0 && (
          <div className="mt-2">
            <ProgressBar current={output.semi_quantity} total={production.quantity} unit={production.unit} label="半成品进度" />
          </div>
        )}
      </div>

      {/* 工序进度 */}
      {process.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3"><i className="fas fa-cogs text-indigo-500 mr-2"></i>工序进度</h4>
          <div className="flex flex-wrap gap-2">
            {process.map((p, i) => (
              <div key={i} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm ${
                p.status === 'completed' ? 'bg-green-50 border-green-200 text-green-700' 
                : p.status === 'processing' ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
                <i className={`fas ${p.status === 'completed' ? 'fa-check-circle' : p.status === 'processing' ? 'fa-spinner fa-spin' : 'fa-circle'} text-xs`}></i>
                {p.process_name}
                {i < process.length - 1 && <i className="fas fa-arrow-right text-gray-300 ml-2"></i>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 物料领用汇总 */}
      {materials.summary.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3"><i className="fas fa-cubes text-blue-500 mr-2"></i>物料领用汇总</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料编码</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">已领量</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">领料次数</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {materials.summary.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{m.code}</td>
                    <td className="px-3 py-2">{m.name}</td>
                    <td className="px-3 py-2 text-right font-medium">{m.picked_qty}</td>
                    <td className="px-3 py-2 text-right">{m.pick_count}次</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 领料单记录 */}
      {materials.pick_orders.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3"><i className="fas fa-clipboard-list text-orange-500 mr-2"></i>领料记录 ({materials.pick_orders.length}批次)</h4>
          <div className="space-y-2">
            {materials.pick_orders.map(pk => (
              <div key={pk.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{pk.order_no}</span>
                    <StatusBadge status={pk.status} type="pick" />
                    <span className="text-xs text-gray-500">{pk.warehouse_name}</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{pk.total_kg} {production.unit || '公斤'}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pk.items.map((it, i) => (
                    <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{it.name}: {it.quantity} {it.unit || '公斤'}</span>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-1">{pk.created_at?.slice(0, 16)} · {pk.operator || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 订单追踪面板 ====================
const OrderTrackingPanel = ({ orderId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    api.get(`/tracking/orders/${orderId}/tracking`).then(res => {
      if (res.success) setData(res.data);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) return <div className="p-8 text-center text-gray-500"><i className="fas fa-spinner fa-spin mr-2"></i>加载中...</div>;
  if (!data) return <div className="p-8 text-center text-gray-500">数据加载失败</div>;

  const { order, production_orders, summary } = data;

  return (
    <div className="space-y-6">
      {/* 订单信息 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><span className="text-gray-500">订单号：</span><span className="font-mono font-medium">{order.order_no}</span></div>
        <div><span className="text-gray-500">客户：</span><span className="font-medium">{order.customer_name}</span></div>
        <div><span className="text-gray-500">状态：</span><StatusBadge status={order.status} /></div>
        <div><span className="text-gray-500">进度：</span><span className="font-medium">{order.progress || 0}%</span></div>
      </div>

      {/* 订单汇总 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon="fa-shopping-cart" label="订单需求" value={summary.total_ordered} color="blue" />
        <StatCard icon="fa-industry" label="已完成" value={summary.total_produced} color="green" />
        <StatCard icon="fa-hourglass-half" label="剩余" value={summary.remaining} color="orange" />
        <StatCard icon="fa-boxes" label="总领料" value={summary.total_picked} color="indigo" />
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <i className="fas fa-chart-pie text-gray-500"></i>
            <span className="text-sm text-gray-600">总损耗率</span>
          </div>
          <div className="text-xl font-bold"><LossRateBadge rate={summary.overall_loss_rate} /></div>
        </div>
      </div>

      {/* 完成进度 */}
      <div className="bg-white border rounded-xl p-4">
        <ProgressBar current={summary.total_produced} total={summary.total_ordered} label="订单完成进度" />
      </div>

      {/* 各工单明细 */}
      {production_orders.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3"><i className="fas fa-list-ol text-teal-500 mr-2"></i>生产工单明细 ({production_orders.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">工单号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">目标</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">已领料</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">已产出</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">损耗率</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {production_orders.map(po => (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{po.order_no}</td>
                    <td className="px-3 py-2">{po.product_name}</td>
                    <td className="px-3 py-2 text-right">{po.quantity}</td>
                    <td className="px-3 py-2 text-right font-medium text-blue-600">{po.picked_total}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-600">{po.output_total}</td>
                    <td className="px-3 py-2 text-center"><LossRateBadge rate={po.loss_rate} /></td>
                    <td className="px-3 py-2 text-center"><StatusBadge status={po.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 订单产品明细 */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3"><i className="fas fa-box text-blue-500 mr-2"></i>订单产品</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品编码</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品名称</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">订单数量</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">单位</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items?.map((it, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{it.code}</td>
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right font-medium">{it.quantity}</td>
                  <td className="px-3 py-2">{it.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export { ProductionTrackingPanel, OrderTrackingPanel, LossRateBadge };
