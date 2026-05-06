import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { api } from '../../api';

const DirectShipModal = ({ isOpen, onClose, orderItem, orderId, onSubmit }) => {
  const [formData, setFormData] = useState({
    warehouse_id: '',
    logistics_company: '',
    logistics_no: '',
    ship_quantity: 0
  });
  const [warehouses, setWarehouses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchAllocations, setBatchAllocations] = useState({});

  // 1. 获取仓库列表
  useEffect(() => {
    if (isOpen) {
      api.get('/warehouse').then(res => {
        if (res.success && res.data) {
          setWarehouses(res.data);
          if (res.data.length > 0 && !formData.warehouse_id) {
            setFormData(prev => ({ ...prev, warehouse_id: res.data[0].id }));
          }
        }
      });
    }
  }, [isOpen]);

  // 2. 初始化发货数量（仅一次）
  useEffect(() => {
    if (isOpen && orderItem) {
      setFormData(prev => ({
        ...prev,
        logistics_company: '',
        logistics_no: '',
        ship_quantity: Math.max(0, orderItem.quantity - (orderItem.shipped_quantity || 0))
      }));
    }
  }, [isOpen, orderItem]);

  // 3. 当仓库或产品变化时，获取库存批次 (后端已经按 updated_at ASC 排列, 即 FIFO)
  useEffect(() => {
    if (isOpen && orderItem?.product_id && formData.warehouse_id) {
      api.get(`/inventory?product_id=${orderItem.product_id}&warehouse_id=${formData.warehouse_id}`).then(res => {
        if (res.success && res.data) {
          setBatches(res.data);
        }
      });
    }
  }, [isOpen, orderItem?.product_id, formData.warehouse_id]);

  // 4. 自动按先进先出 (FIFO) 分配发货数量到各批次
  useEffect(() => {
    let remaining = Number(formData.ship_quantity) || 0;
    const allocations = {};
    
    for (const batch of batches) {
      const available = batch.quantity - (batch.locked_quantity || 0);
      if (available <= 0) continue;
      
      if (remaining >= available) {
        allocations[batch.batch_no] = available;
        remaining -= available;
      } else {
        allocations[batch.batch_no] = remaining;
        remaining = 0;
        break;
      }
    }
    setBatchAllocations(allocations);
  }, [formData.ship_quantity, batches]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.warehouse_id) return window.__toast?.error('请选择发货仓库');
    if (formData.ship_quantity <= 0) return window.__toast?.error('发货数量必须大于0');
    
    let totalAllocated = 0;
    Object.values(batchAllocations).forEach(qty => totalAllocated += qty);
    
    if (totalAllocated < formData.ship_quantity) {
      return window.__toast?.error('该仓库库存不足以满足发货数量，请调小发货数量或更换仓库');
    }

    // 组装提交的 items (按分配好的批次拆分)
    const submitItems = [];
    for (const [batchNo, qty] of Object.entries(batchAllocations)) {
      if (qty > 0) {
        submitItems.push({
          order_item_id: orderItem.id,
          product_id: orderItem.product_id,
          batch_no: batchNo,
          ship_quantity: qty
        });
      }
    }

    onSubmit({
      items: submitItems,
      warehouse_id: formData.warehouse_id,
      logistics_company: formData.logistics_company,
      logistics_no: formData.logistics_no
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="现货直发 (先进先出)" size="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 flex justify-between items-center">
          <div>
            <strong>产品:</strong> {orderItem?.name} ({orderItem?.code})<br/>
            <strong>待发货缺口:</strong> {orderItem ? orderItem.quantity - (orderItem.shipped_quantity || 0) : 0} {orderItem?.unit}
          </div>
          <div className="text-right">
            <strong>当前可用总库存:</strong> <span className="font-bold text-green-600 text-lg">{orderItem?.available_stock || 0}</span> {orderItem?.unit}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">发货仓库 <span className="text-red-500">*</span></label>
            <select required value={formData.warehouse_id} onChange={e => setFormData({...formData, warehouse_id: e.target.value})} className="w-full border rounded px-3 py-2 outline-none focus:border-teal-500 bg-white">
              <option value="">请选择发货仓库...</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">本次发货总数量 <span className="text-red-500">*</span></label>
            <input required type="number" max={orderItem?.available_stock || 0} value={formData.ship_quantity} onChange={e => setFormData({...formData, ship_quantity: e.target.value})} className="w-full border rounded px-3 py-2 outline-none focus:border-teal-500"/>
          </div>
        </div>

        {/* FIFO 批次分配预览面板 */}
        {batches.length > 0 && formData.ship_quantity > 0 && (
          <div className="border rounded-lg overflow-hidden mt-4">
            <div className="bg-gray-50 px-3 py-2 text-sm font-medium border-b flex items-center justify-between">
              <span><i className="fas fa-sitemap mr-2 text-teal-500"></i>智能批次分配 (按入库时间FIFO)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-normal">批次号</th>
                  <th className="px-3 py-1.5 text-left font-normal">可用数量</th>
                  <th className="px-3 py-1.5 text-right font-normal">本次扣减</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map(batch => {
                  const available = batch.quantity - (batch.locked_quantity || 0);
                  const allocated = batchAllocations[batch.batch_no] || 0;
                  if (available <= 0) return null;
                  return (
                    <tr key={batch.id} className={allocated > 0 ? "bg-teal-50/30" : ""}>
                      <td className="px-3 py-2 text-gray-700">{batch.batch_no}</td>
                      <td className="px-3 py-2 text-gray-500">{available}</td>
                      <td className="px-3 py-2 text-right">
                        {allocated > 0 ? (
                          <span className="font-bold text-teal-600">-{allocated}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {batches.length === 0 && formData.warehouse_id && (
          <div className="text-center text-sm text-red-500 py-2 border border-red-100 rounded bg-red-50">
            该仓库下暂无可用库存批次
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">物流公司 (非必填)</label>
            <input type="text" value={formData.logistics_company} onChange={e => setFormData({...formData, logistics_company: e.target.value})} className="w-full border rounded px-3 py-2 outline-none focus:border-teal-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">物流单号 (非必填)</label>
            <input type="text" value={formData.logistics_no} onChange={e => setFormData({...formData, logistics_no: e.target.value})} className="w-full border rounded px-3 py-2 outline-none focus:border-teal-500"/>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
          <button type="submit" disabled={batches.length === 0 || formData.ship_quantity <= 0} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">确认发货</button>
        </div>
      </form>
    </Modal>
  );
};

export default DirectShipModal;
