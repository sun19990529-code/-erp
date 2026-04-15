import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { api } from '../../api';
import { formatAmount } from '../../utils/format';

const OrderFormModal = ({ isOpen, onClose, item, onSubmitSuccess }) => {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(item?.customer_id || '');
  const [items, setItems] = useState([{ product_id: '', quantity: 1 }]);

  // 初始化加载数据（带竞态保护）
  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      const loadedItems = item?.items?.length 
        ? item.items.map(it => ({
            ...it,
            total_amount: it.total_amount || (typeof it.unit_price === 'number' && typeof it.quantity === 'number' ? parseFloat((it.unit_price * it.quantity).toFixed(2)) : '')
          }))
        : [{ product_id: '', quantity: 1 }];
      setItems(loadedItems);
      setSelectedCustomerId(item?.customer_id || '');
      
      api.get('/customers').then(res => !cancelled && res.success && setCustomers(res.data));
      
      // 如果有初始客户ID则加载对应产品，否则加载全部成品
      const prodUrl = item?.customer_id 
        ? `/products?category=成品&customer_id=${item.customer_id}` 
        : `/products?category=成品`;
        
      api.get(prodUrl).then(res => {
        if (!cancelled && res.success) setProducts(res.data);
      });
    }
    return () => { cancelled = true; };
  }, [isOpen, item]);

  const addRow = () => setItems([...items, { product_id: '', quantity: 1 }]);
  
  const removeRow = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.length ? newItems : [{ product_id: '', quantity: 1 }]);
  };
  
  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleCustomerChange = (customerId, form) => {
    setSelectedCustomerId(customerId);
    const c = customers.find(x => String(x.id) === String(customerId));
    if (c && form) {
      form.customer_name.value = c.name;
      form.customer_phone.value = c.phone || '';
      form.customer_address.value = c.address || '';
    }
    
    // 加载产品下拉列表
    if (customerId) {
      api.get(`/products?category=成品&customer_id=${customerId}`).then(res => {
        if (res.success) setProducts(res.data);
      });
    } else {
      api.get('/products?category=成品').then(res => {
        if (res.success) setProducts(res.data);
      });
    }
    
    // 清空已选产品
    setItems(items.map(it => ({ ...it, product_id: '' })));
  };

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const validItems = items.filter(i => i.product_id).map(it => ({
      ...it,
      unit_price: (it.total_amount && it.quantity) ? parseFloat((it.total_amount / it.quantity).toFixed(4)) : (it.unit_price || 0)
    }));
    
    if (validItems.length === 0) {
      window.__toast?.warning('请至少添加一个产品明细');
      return;
    }

    const obj = { 
      customer_id: fd.get('customer_id') || null, 
      customer_name: fd.get('customer_name'), 
      customer_phone: fd.get('customer_phone'), 
      customer_address: fd.get('customer_address'), 
      delivery_date: fd.get('delivery_date'), 
      priority: fd.get('priority'), 
      remark: fd.get('remark'), 
      items: validItems 
    };
    
    const res = item 
      ? await api.put(`/orders/${item.id}`, obj, { invalidate: ['orders'] })
      : await api.post('/orders', obj, { invalidate: ['orders'] });
      
    if (res.success) { 
      if (onSubmitSuccess) onSubmitSuccess();
    } else {
      window.__toast?.error(res.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? '编辑订单' : '新增订单'} size="max-w-3xl">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">客户</label>
            <select name="customer_id" value={selectedCustomerId} onChange={e => handleCustomerChange(e.target.value, e.target.form)} className="w-full border rounded-lg px-3 py-2">
              <option value="">选择客户</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">客户名称</label><input name="customer_name" defaultValue={item?.customer_name || ''} className="w-full border rounded-lg px-3 py-2 bg-gray-50" readOnly /></div>
          <div><label className="block text-sm font-medium mb-1">联系电话</label><input name="customer_phone" defaultValue={item?.customer_phone || ''} className="w-full border rounded-lg px-3 py-2 bg-gray-50" readOnly /></div>
          <div><label className="block text-sm font-medium mb-1">交货日期</label><input name="delivery_date" type="date" defaultValue={item?.delivery_date || ''} className="w-full border rounded-lg px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">优先级</label>
            <select name="priority" defaultValue={item?.priority || '1'} className="w-full border rounded-lg px-3 py-2">
              <option value="1">普通</option><option value="2">加急</option><option value="3">特急</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">收货地址</label>
          <input name="customer_address" defaultValue={item?.customer_address || ''} className="w-full border rounded-lg px-3 py-2" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">订单明细</label>
          <div className="border rounded-lg p-3 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-2 relative group hover:border-teal-200 transition-colors">
                <div className="w-full lg:flex-1 min-w-[200px]">
                  <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none bg-white">
                    <option value="">选择销售产品</option>
                    {products.length > 0
                      ? products.map(p => {
                        const prefix = p.suppliers?.length ? `[${p.suppliers.map(s => s.supplier_name).join('/')}] ` : '';
                        return <option key={p.id} value={p.id}>{prefix}{p.name} ({p.code})</option>;
                      })
                      : <option disabled>{selectedCustomerId ? '该客户无关联产品' : '请先选择客户'}</option>}
                  </select>
                </div>
                <div className="w-[30%] lg:w-28 flex items-center">
                  <input type="number" value={it.quantity !== undefined ? it.quantity : ''} onChange={e => updateItem(i, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none" placeholder="销售数量" />
                </div>
                <div className="w-16 text-sm text-gray-500 flex items-center">
                  {products.find(p => String(p.id) === String(it.product_id))?.unit || '-'}
                </div>
                <div className="w-[30%] lg:w-28 flex items-center">
                  <input type="number" step="0.01" value={it.total_amount !== undefined ? it.total_amount : ''} onChange={e => updateItem(i, 'total_amount', e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none" placeholder="销售总额(¥)" />
                </div>
                
                <div className="w-full lg:w-16 flex items-center justify-end border-t lg:border-t-0 lg:border-l border-gray-200 pt-2 lg:pt-0 lg:pl-3 mt-1 lg:mt-0">
                  <button type="button" onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="移除该行">
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addRow} className="w-full py-2.5 border-2 border-dashed border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all font-medium flex items-center justify-center gap-2 text-sm mt-2">
              <i className="fas fa-plus-circle"></i> 继续添加明细
            </button>
          </div>
          <div className="text-right mt-2 font-bold text-gray-700">
            订单预计总金额: ¥{formatAmount(items.reduce((sum, it) => sum + (parseFloat(it.total_amount) || 0), 0))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea name="remark" defaultValue={item?.remark || ''} className="w-full border rounded-lg px-3 py-2" rows="2"></textarea>
        </div>
        
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
          <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交</button>
        </div>
      </form>
    </Modal>
  );
};

export default OrderFormModal;
