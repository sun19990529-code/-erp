import React, { useState, useEffect } from 'react';
import OperatorSelect from '../components/OperatorSelect';
import { api } from '../api';
import { useConfirm } from '../components/ConfirmModal';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';
import Table from '../components/Table';

const PurchaseManager = () => {
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  
  // 初始化数据只加载一次
  useEffect(() => {
    api.get('/suppliers').then(res => res.success && setSuppliers(res.data));
    api.get('/products?category=原材料').then(res => res.success && setProducts(res.data));
  }, []);

  const load = () => {
    api.get('/purchase').then(res => res.success && setData(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.order_no || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.supplier_name || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || item.status === statusFilter;
    const matchSupplier = !supplierFilter || item.supplier_name === supplierFilter;
    return matchSearch && matchStatus && matchSupplier;
  });
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); setSupplierFilter(''); };
  
  const openView = async (item) => {
    const res = await api.get(`/purchase/${item.id}`);
    setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'view' });
  };
  
  const openCreate = () => {
    setSelectedSupplierId('');
    setModal({ open: true, item: null, items: [{ product_id: '', quantity: 1 }], mode: 'create' });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, items: [], mode: 'list' });
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = (modal.items || []).filter(i => i.product_id);
    
    // 验证数量为正数
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        window.__toast?.warning('数量必须大于0');
        return;
      }
    }
    
    const obj = { supplier_id: fd.get('supplier_id'), expected_date: fd.get('expected_date'), operator: fd.get('operator'), remark: fd.get('remark'), items };
    const res = modal.mode === 'edit'
      ? await api.put(`/purchase/${modal.item.id}`, obj)
      : await api.post('/purchase', obj);
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/purchase/${item.id}/status`, { status });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/purchase/${item.id}`);
    if (res.success) {
      setSelectedSupplierId(res.data.supplier_id || '');
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    if (!await confirm('确定删除该采购单？')) return;
    const res = await api.del(`/purchase/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };

  const addRow = () => {
    setModal({ ...modal, items: [...(modal.items || []), { product_id: '', quantity: 1 }] });
  };
  
  const removeRow = (index) => {
    const newItems = (modal.items || []).filter((_, i) => i !== index);
    setModal({ ...modal, items: newItems.length ? newItems : [{ product_id: '', quantity: 1 }] });
  };
  
  const updateItem = (index, field, value) => {
    const newItems = [...(modal.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    setModal({ ...modal, items: newItems });
  };

  // 供应商变更时加载关联产品
  const handleSupplierChange = (supplierId) => {
    setSelectedSupplierId(supplierId);
    if (supplierId) {
      api.get(`/products?category=原材料&supplier_id=${supplierId}`).then(res => {
        if (res.success) setProducts(res.data);
      });
    } else {
      api.get('/products?category=原材料').then(res => {
        if (res.success) setProducts(res.data);
      });
    }
    // 清空已选产品（因为供应商变了，之前选的产品可能不属于新供应商）
    setModal(prev => ({
      ...prev,
      items: prev.items.map(it => ({ ...it, product_id: '' }))
    }));
  };

  const updatePurchaseStatus = async (purchaseId, newStatus) => {
    const statusLabels = { confirmed: '确认采购', received: '确认收货', cancelled: '取消采购' };
    if (newStatus === 'received') {
      if (!await confirm('确认收货？将自动创建原材料入库单并更新库存。')) return;
    } else {
      if (!await confirm(`确定${statusLabels[newStatus] || newStatus}？`)) return;
    }
    const res = await api.put(`/purchase/${purchaseId}/status`, { status: newStatus });
    if (res.success) { 
      if (newStatus === 'received') window.__toast?.warning('收货成功！已自动创建入库单。');
      closeModal(); load(); 
    }
    else window.__toast?.error(res.message);
  };
  
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">采购单中心</h2>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-sm"><i className="fas fa-plus mr-2"></i>新增采购单</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索单号/供应商..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          { key: 'supplier', label: '供应商', value: supplierFilter, options: [...new Set(data.map(d => d.supplier_name))].filter(Boolean).map(s => ({ value: s, label: s })) },
          { key: 'status', label: '状态', value: statusFilter, options: [
              { value: 'pending', label: '待处理' }, 
              { value: 'confirmed', label: '已确认' }, 
              { value: 'received', label: '已收货' }, 
              { value: 'cancelled', label: '已取消' }
            ]
          }
        ]}
        onFilterChange={(key, val) => { key === 'supplier' && setSupplierFilter(val); key === 'status' && setStatusFilter(val); }}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Table columns={[
          { key: 'order_no', title: '采购单号' }, { key: 'supplier_name', title: '供应商' },
          { key: 'expected_date', title: '预计到货' }, { key: 'status', title: '状态', render: v => <StatusBadge status={v} /> },
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={filteredData} 
          onView={openView} 
          onEdit={openEdit} 
          onDelete={del} 
          editPermission="purchase_edit" 
          deletePermission="purchase_delete" />
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? '采购详情' : modal.mode === 'edit' ? '编辑采购单' : '新增采购'} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>采购单号：</strong>{modal.item?.order_no}</div>
              <div><strong>供应商：</strong>{modal.item?.supplier_name}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} /></div>
              <div><strong>预计到货：</strong>{modal.item?.expected_date || '-'}</div>
              <div><strong>操作员：</strong>{modal.item?.operator || '-'}</div>
              <div><strong>备注：</strong>{modal.item?.remark || '-'}</div>
            </div>
            <table className="w-full border">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
                <th className="px-3 py-2 text-left text-xs">数量</th><th className="px-3 py-2 text-left text-xs">单位</th>
              </tr></thead>
              <tbody>
                {(modal.item?.items || []).map((it, i) => (
                  <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm">{it.quantity}</td><td className="px-3 py-2 text-sm">{it.unit || '公斤'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* 采购状态操作按钮 */}
            {modal.item?.status !== 'received' && modal.item?.status !== 'cancelled' && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium mb-2"><i className="fas fa-tasks mr-2 text-teal-500"></i>状态操作</h4>
                <div className="flex flex-wrap gap-2">
                  {modal.item?.status === 'pending' && (
                    <>
                      <button onClick={() => updatePurchaseStatus(modal.item.id, 'confirmed')} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"><i className="fas fa-check mr-1"></i>确认采购</button>
                      <button onClick={() => updatePurchaseStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消采购</button>
                    </>
                  )}
                  {modal.item?.status === 'confirmed' && (
                    <>
                      <button onClick={() => updatePurchaseStatus(modal.item.id, 'received')} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"><i className="fas fa-truck mr-1"></i>确认收货</button>
                      <button onClick={() => updatePurchaseStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消采购</button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">关闭</button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">供应商 *</label>
                <select name="supplier_id" defaultValue={modal.item?.supplier_id || ''} className="w-full border rounded-lg px-3 py-2" required onChange={e => handleSupplierChange(e.target.value)}>
                  <option value="">请选择</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">预计到货日期</label><input name="expected_date" type="date" defaultValue={modal.item?.expected_date || ''} className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">操作员</label><OperatorSelect /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">采购明细</label>
              <div className="border rounded-lg p-3 space-y-2">
                {(modal.items || []).map((it, i) => (
                  <div key={i} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-2 relative group hover:border-teal-200 transition-colors">
                    <div className="w-full lg:flex-1 min-w-[200px]">
                      <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none bg-white">
                        <option value="">选择采购产品</option>
                        {products.length > 0
                          ? products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)
                          : <option disabled>{selectedSupplierId ? '该供应商无关联产品' : '请先选择供应商'}</option>}
                      </select>
                    </div>
                    <div className="w-[45%] lg:w-32 flex items-center">
                      <input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none" placeholder="数量" />
                    </div>
                    <div className="w-[45%] lg:w-32">
                      <select value={it.unit || '公斤'} onChange={e => updateItem(i, 'unit', e.target.value)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none bg-white">
                        <option value="公斤">公斤</option>
                        <option value="支">支</option>
                        <option value="吨">吨</option>
                      </select>
                    </div>
                    
                    <div className="w-full lg:w-16 flex items-center justify-end border-t lg:border-t-0 lg:border-l border-gray-200 pt-2 lg:pt-0 lg:pl-3 mt-1 lg:mt-0">
                      <button type="button" onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="移除该行">
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addRow} className="w-full py-2.5 border-2 border-dashed border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all font-medium flex items-center justify-center gap-2 text-sm mt-2"><i className="fas fa-plus-circle"></i> 继续添加明细</button>
              </div>
            </div>
            <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export { PurchaseManager };
