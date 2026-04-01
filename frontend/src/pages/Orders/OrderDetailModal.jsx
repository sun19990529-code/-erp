import React from 'react';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';

const OrderDetailModal = ({ isOpen, onClose, item, onUpdateStatus, onCreateProduction }) => {

  const updateOrderStatus = (id, status) => {
    if (onUpdateStatus) onUpdateStatus(id, status);
  };

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
        <table className="w-full border">
          <thead className="bg-gray-50"><tr>
            <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
            <th className="px-3 py-2 text-left text-xs">数量</th><th className="px-3 py-2 text-left text-xs">单位</th>
          </tr></thead>
          <tbody>
            {(item?.items || []).map((it, i) => (
              <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                <td className="px-3 py-2 text-sm font-medium">{it.quantity}</td>
                <td className="px-3 py-2 text-sm">{it.unit || '支'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
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
              <button onClick={() => { if(onCreateProduction) onCreateProduction(item); }} className="text-blue-600 text-sm hover:text-blue-800">
                <i className="fas fa-plus mr-1"></i>生成生产工单
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
                    <tr key={i} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => { onClose(); window.location.hash = 'production-orders'; }}>
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
                    <tr key={i} className="border-t hover:bg-purple-50 cursor-pointer" onClick={() => { onClose(); window.location.hash = 'outbound-finished'; }}>
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
      </div>
    </Modal>
  );
};

export default OrderDetailModal;
