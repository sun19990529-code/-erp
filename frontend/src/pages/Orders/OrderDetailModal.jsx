import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import NextStepActions from '../../components/NextStepActions';
import DirectShipModal from './DirectShipModal';
import { api } from '../../api';

const OrderDetailModal = ({ isOpen, onClose, item, onUpdateStatus, onCreateProduction, onRefresh }) => {
  const navigate = useNavigate();
  const [directShipItem, setDirectShipItem] = useState(null);

  const updateOrderStatus = (id, status) => {
    if (onUpdateStatus) onUpdateStatus(id, status);
  };

  // 智能下一步跳转 actions
  const nextActions = useMemo(() => {
    const acts = [];
    const hasProduction = item?.productionOrders?.length > 0;
    const allProductionDone = hasProduction && item.productionOrders.every(p => p.status === 'completed');
    
    if (item?.status === 'confirmed' || item?.status === 'pending') {
      if (!hasProduction) acts.push({ icon: '🏭', label: '创建生产工单', _action: 'createProduction' });
      if (hasProduction) acts.push({ icon: '📦', label: '去领料', path: '/production/pick', _action: 'close' });
    }
    if (item?.status === 'processing') {
      acts.push({ icon: '📦', label: '去领料', path: '/production/pick', _action: 'close' });
      acts.push({ icon: '🔧', label: '去车间报工', path: '/process/hub', _action: 'close' });
      if (allProductionDone) acts.push({ icon: '🔍', label: '查看检验', path: '/inspection', _action: 'close' });
    }
    // 将标记转为实际回调（避免闭包捕获过期引用）
    return acts.map(a => ({
      ...a,
      onClick: a._action === 'createProduction' 
        ? () => { if(onCreateProduction) onCreateProduction(item); }
        : a._action === 'close' ? onClose : undefined
    }));
  }, [item?.status, item?.productionOrders, onClose, onCreateProduction, item]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="订单详情" size="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><strong>订单号：</strong>{item?.order_no}</div>
          <div><strong>客户：</strong>{item?.customer_name}</div>
          <div><strong>状态：</strong><StatusBadge status={item?.status} /></div>
          <div><strong>交期：</strong>{item?.delivery_date || '-'}</div>
          <div><strong>优先级：</strong>{item?.priority === 1 ? '普通' : item?.priority === 2 ? '加急' : '特急'}</div>
          <div><strong>进度：</strong>{item?.progress || 0}%</div>
        </div>
        <div>
          <h4 className="font-medium mb-2"><i className="fas fa-clipboard-list mr-2 text-teal-500"></i>履约看板</h4>
          <table className="w-full border">
            <thead className="bg-teal-50"><tr>
              <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
              <th className="px-3 py-2 text-center text-xs">需求数</th>
              <th className="px-3 py-2 text-center text-xs text-green-700">已发数</th>
              <th className="px-3 py-2 text-center text-xs text-blue-700">当前可用库存</th>
              <th className="px-3 py-2 text-center text-xs">操作</th>
            </tr></thead>
            <tbody>
              {(item?.items || []).map((it, i) => {
                const pendingQty = it.quantity - (it.shipped_quantity || 0);
                const canShip = pendingQty > 0 && it.available_stock > 0;
                
                return (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-sm">{it.code}</td>
                    <td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm text-center font-medium">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-sm text-center text-green-600 font-medium">{it.shipped_quantity || 0} {it.unit}</td>
                    <td className="px-3 py-2 text-sm text-center text-blue-600 font-medium">{it.available_stock || 0} {it.unit}</td>
                    <td className="px-3 py-2 text-sm text-center">
                      {item?.status !== 'cancelled' && item?.status !== 'completed' && (
                        <button 
                          onClick={() => setDirectShipItem(it)}
                          disabled={!canShip}
                          className={`px-2 py-1 rounded text-xs transition-colors ${canShip ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        >
                          <i className="fas fa-truck-fast mr-1"></i>直发现货
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* 订单状态操作按钮 - 仅订单状态模块显示 */}
        {item?.status !== 'completed' && item?.status !== 'cancelled' && (
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="font-medium mb-2"><i className="fas fa-tasks mr-2 text-teal-500"></i>状态操作</h4>
            <div className="flex flex-wrap gap-2">
              {item?.status === 'pending' && (
                <>
                  <button onClick={() => updateOrderStatus(item.id, 'confirmed')} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"><i className="fas fa-check mr-1"></i>确认订单</button>
                  <button onClick={() => updateOrderStatus(item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消订单</button>
                </>
              )}
              {item?.status === 'confirmed' && (
                <>
                  <button onClick={() => updateOrderStatus(item.id, 'processing')} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"><i className="fas fa-play mr-1"></i>开始生产</button>
                  <button onClick={() => updateOrderStatus(item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消订单</button>
                </>
              )}
              {item?.status === 'processing' && (
                <span className="text-sm text-gray-500 italic">
                  <i className="fas fa-info-circle mr-1"></i>订单将在所有工单完成后自动标记完成
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* 关联的生产工单 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium"><i className="fas fa-industry mr-2 text-blue-500"></i>关联生产工单</h4>
            {item?.status !== 'completed' && item?.status !== 'cancelled' && (
              <button onClick={() => { if(onCreateProduction) onCreateProduction(item); }} className="text-blue-600 text-sm hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                <i className="fas fa-hammer mr-1"></i>缺口一键排产
              </button>
            )}
          </div>
          {item?.productionOrders && item.productionOrders.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">工单号</th>
                    <th className="px-3 py-2 text-left text-xs">产品</th>
                    <th className="px-3 py-2 text-left text-xs">数量</th>
                    <th className="px-3 py-2 text-left text-xs">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {item.productionOrders.map((po, i) => (
                    <tr key={i} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => { onClose(); navigate('/production/orders'); }}>
                      <td className="px-3 py-2 text-sm font-medium text-blue-600">{po.order_no} <i className="fas fa-external-link-alt text-xs ml-1"></i></td>
                      <td className="px-3 py-2 text-sm">{po.product_name || '-'}</td>
                      <td className="px-3 py-2 text-sm">{po.quantity} {po.unit || '件'}</td>
                      <td className="px-3 py-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          po.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          po.status === 'processing' ? 'bg-blue-100 text-blue-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {po.status === 'completed' ? '已完成' : po.status === 'processing' ? '进行中' : '待处理'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border rounded-lg p-4 text-center text-gray-500 bg-gray-50">
              暂无关联的生产工单
              {item?.status !== 'completed' && item?.status !== 'cancelled' && (
                <button onClick={() => { if(onCreateProduction) onCreateProduction(item); }} className="block mx-auto mt-2 text-blue-600 text-sm hover:text-blue-800">
                  <i className="fas fa-plus mr-1"></i>点击生成生产工单
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* 关联的出库单 */}
        {item?.outboundOrders && item.outboundOrders.length > 0 && (
          <div>
            <h4 className="font-medium mb-2"><i className="fas fa-truck mr-2 text-purple-500"></i>关联出库单</h4>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-purple-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">出库单号</th>
                    <th className="px-3 py-2 text-left text-xs">仓库</th>
                    <th className="px-3 py-2 text-left text-xs">状态</th>
                    <th className="px-3 py-2 text-left text-xs">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {item.outboundOrders.map((oo, i) => (
                    <tr key={i} className="border-t hover:bg-purple-50 cursor-pointer" onClick={() => { onClose(); navigate('/warehouse/outbound'); }}>
                      <td className="px-3 py-2 text-sm font-medium text-purple-600">{oo.order_no} <i className="fas fa-external-link-alt text-xs ml-1"></i></td>
                      <td className="px-3 py-2 text-sm">{oo.warehouse_name || '-'}</td>
                      <td className="px-3 py-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          oo.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          oo.status === 'approved' ? 'bg-green-100 text-green-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {oo.status === 'completed' ? '已完成' : oo.status === 'approved' ? '已出库' : '待审批'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">{oo.created_at?.slice(0, 10) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* 智能下一步跳转 */}
        <NextStepActions actions={nextActions} />
      </div>

      {directShipItem && (
        <DirectShipModal 
          isOpen={!!directShipItem}
          onClose={() => setDirectShipItem(null)}
          orderItem={directShipItem}
          orderId={item?.id}
          onSubmit={async (data) => {
            const res = await api.post(`/orders/${item.id}/direct-ship`, data);
            if (res.success) {
              window.__toast?.success('现货直发成功');
              setDirectShipItem(null);
              if (onRefresh) onRefresh();
            } else {
              window.__toast?.error(res.message || '直发失败');
            }
          }}
        />
      )}
    </Modal>
  );
};

export default OrderDetailModal;
