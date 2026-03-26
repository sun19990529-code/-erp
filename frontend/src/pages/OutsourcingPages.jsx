import React, { useState, useEffect } from 'react';
import OperatorSelect from '../components/OperatorSelect';
import { api } from '../api';
import { useConfirm } from '../components/ConfirmModal';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';
import Table from '../components/Table';

const OutsourcingManager = () => {
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productions, setProductions] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [pendingOutsourcing, setPendingOutsourcing] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  
  const processNames = { 
    ROLLING: '轧机', STRAIGHTENING: '校直', POLISHING: '抛光', CORRECTING: '矫直', CUTTING: '切割',
    DRAWING: '拉拔', CLEANING: '清洗', WIRE_CUTTING: '线切割', LASER_CUTTING: '激光切割', HEAT_TREATMENT: '热处理'
  };
  
  // 初始化数据只加载一次
  useEffect(() => {
    api.get('/suppliers').then(res => res.success && setSuppliers(res.data));
    api.get('/products').then(res => res.success && setProducts(res.data));
    api.get('/production/processes').then(res => res.success && setProcesses(res.data));
  }, []);

  const load = () => {
    api.get('/outsourcing').then(res => res.success && setData(res.data));
    api.get('/production?status=processing').then(res => res.success && setProductions(res.data));
    api.get('/outsourcing/pending').then(res => res.success && setPendingOutsourcing(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

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
    const res = await api.get(`/outsourcing/${item.id}`);
    if (!res.success) { window.__toast?.error(res.message || '获取委外详情失败'); return; }
    setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'view' });
  };
  
  const openCreate = () => {
    setModal({ open: true, item: null, items: [{ product_id: '', quantity: 1 }], mode: 'create' });
  };
  
  // 从待委外列表快速创建
  const openFromPending = (item) => {
    setModal({ 
      open: true, 
      item: null, 
      items: [{ product_id: item.product_id, quantity: item.quantity }], 
      mode: 'create',
      productionOrder: item,
      processId: item.process_id
    });
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
    
    const obj = { 
      supplier_id: fd.get('supplier_id'), 
      production_order_id: fd.get('production_order_id') || null,
      process_id: fd.get('process_id') || null,
      expected_date: fd.get('expected_date'), 
      operator: fd.get('operator'), 
      remark: fd.get('remark'), 
      items 
    };
    const res = modal.mode === 'edit'
      ? await api.put(`/outsourcing/${modal.item.id}`, obj)
      : await api.post('/outsourcing', obj);
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/outsourcing/${item.id}/status`, { status });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/outsourcing/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    if (!await confirm('确定删除该委外单？')) return;
    const res = await api.del(`/outsourcing/${item.id}`);
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

  const updateOutsourcingStatus = async (outsourcingId, newStatus) => {
    const statusLabels = { confirmed: '确认委外', processing: '开始加工', received: '确认收货', cancelled: '取消委外' };
    if (newStatus === 'received') {
      if (!await confirm('确认收货？将自动创建入库单并更新库存。')) return;
    } else {
      if (!await confirm(`确定${statusLabels[newStatus] || newStatus}？`)) return;
    }
    const res = await api.put(`/outsourcing/${outsourcingId}/status`, { status: newStatus });
    if (res.success) { 
      if (newStatus === 'received') window.__toast?.warning('收货成功！已自动创建入库单。');
      closeModal(); load(); 
    }
    else window.__toast?.error(res.message);
  };
  
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">委外加工中心</h2>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-sm"><i className="fas fa-plus mr-2"></i>新增委外单</button>
      </div>
      
      {pendingOutsourcing.length > 0 && (
        <div className="bg-orange-50/80 border border-orange-200/60 rounded-xl p-4 mb-4 backdrop-blur shadow-sm">
          <h3 className="font-bold text-orange-800 mb-2"><i className="fas fa-bell mr-2"></i>待委外工序提醒</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-orange-100/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold rounded-tl-lg">生产工单</th>
                  <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">产品</th>
                  <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">工序</th>
                  <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">数量</th>
                  <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold rounded-tr-lg">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingOutsourcing.map((item, i) => (
                  <tr key={i} className="border-t border-orange-200/50 hover:bg-orange-100/30 transition-colors">
                    <td className="px-3 py-2 text-sm text-orange-900">{item.order_no}</td>
                    <td className="px-3 py-2 text-sm text-orange-900">{item.product_name}</td>
                    <td className="px-3 py-2 text-sm text-orange-900"><span className="bg-orange-200 px-2 py-0.5 rounded text-xs">{item.process_name}</span></td>
                    <td className="px-3 py-2 text-sm text-orange-900 font-medium">{item.quantity} {item.unit || '件'}</td>
                    <td className="px-3 py-2 text-sm">
                      <button onClick={() => openFromPending(item)} className="text-orange-600 hover:text-white hover:bg-orange-500 font-medium px-3 py-1 rounded transition-colors border border-orange-400 hover:border-transparent">
                        <i className="fas fa-plus-circle mr-1"></i>快捷创建
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      <SearchFilter
        searchPlaceholder="搜索委外单号/供应商..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          { key: 'supplier', label: '供应商', value: supplierFilter, options: [...new Set(data.map(d => d.supplier_name))].filter(Boolean).map(s => ({ value: s, label: s })) },
          { key: 'status', label: '状态', value: statusFilter, options: [
              { value: 'pending', label: '待处理' }, 
              { value: 'confirmed', label: '已确认' }, 
              { value: 'processing', label: '加工中' },
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
          { key: 'order_no', title: '委外单号' }, 
          { key: 'supplier_name', title: '供应商' }, 
          { key: 'production_order_no', title: '流转工单' },
          { key: 'process_name', title: '加工工序' },
          { key: 'expected_date', title: '预计完成' },
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} /> },
          { key: 'created_at', title: '录入时间', render: v => v?.slice(0, 10) }
        ]} data={filteredData} 
          onView={openView} 
          onEdit={openEdit} 
          onDelete={del} 
          editPermission="outsourcing_edit" 
          deletePermission="outsourcing_delete" />
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? '委外详情' : modal.mode === 'edit' ? '编辑委外单' : '新增委外'} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div><strong>委外单号：</strong>{modal.item?.order_no}</div>
              <div><strong>供应商：</strong>{modal.item?.supplier_name}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} /></div>
              <div><strong>预计完成：</strong>{modal.item?.expected_date || '-'}</div>
              <div><strong>关联工单：</strong>{modal.item?.production_order_no || '-'}</div>
              <div><strong>工序：</strong>{modal.item?.process_name || '-'}</div>
            </div>
            <table className="w-full border">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
                <th className="px-3 py-2 text-left text-xs">数量</th>
              </tr></thead>
              <tbody>
                {(modal.item?.items || []).map((it, i) => (
                  <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm">{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* 委外状态操作按钮 */}
            {modal.item?.status !== 'received' && modal.item?.status !== 'cancelled' && modal.item?.status !== 'completed' && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium mb-2"><i className="fas fa-tasks mr-2 text-teal-500"></i>状态操作</h4>
                <div className="flex flex-wrap gap-2">
                  {modal.item?.status === 'pending' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'confirmed')} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"><i className="fas fa-check mr-1"></i>确认委外</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消委外</button>
                    </>
                  )}
                  {modal.item?.status === 'confirmed' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'processing')} className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"><i className="fas fa-cogs mr-1"></i>开始加工</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消委外</button>
                    </>
                  )}
                  {modal.item?.status === 'processing' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'received')} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"><i className="fas fa-truck mr-1"></i>确认收货</button>
                      <button onClick={() => { closeModal(); window.__toast?.info('请前往 质检管理 → 委外加工检验 进行检验'); }} className="px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"><i className="fas fa-clipboard-check mr-1"></i>去检验</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消委外</button>
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
            {modal.productionOrder && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
                <i className="fas fa-link mr-2"></i>
                关联生产工单：<strong>{modal.productionOrder.order_no}</strong> - 
                工序：<strong>{modal.productionOrder.process_name}</strong> - 
                数量：<strong>{modal.productionOrder.quantity} {modal.productionOrder.unit || '件'}</strong>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">供应商 *</label>
                <select name="supplier_id" className="w-full border rounded-lg px-3 py-2" required>
                  <option value="">请选择</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">关联生产工单</label>
                <select name="production_order_id" className="w-full border rounded-lg px-3 py-2" defaultValue={modal.productionOrder?.id || ''}>
                  <option value="">无</option>
                  {productions.map(p => <option key={p.id} value={p.id}>{p.order_no} - {p.product_name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">关联工序</label>
                <select name="process_id" className="w-full border rounded-lg px-3 py-2" defaultValue={modal.processId || ''}>
                  <option value="">无</option>
                  {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">预计完成日期</label><input name="expected_date" type="date" className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">操作员</label><OperatorSelect /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">加工明细</label>
              <div className="border rounded-lg p-3 space-y-2">
                {(modal.items || []).map((it, i) => (
                  <div key={i} className="flex flex-wrap lg:flex-nowrap gap-2 items-center bg-gray-50 rounded-lg p-2">
                    <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="border rounded px-2 py-1">
                      <option value="">选择产品</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 whitespace-nowrap">数量</span>
                      <input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} className="border rounded px-2 py-1 w-16" />
                    </div>
                    <select value={it.unit || '公斤'} onChange={e => updateItem(i, 'unit', e.target.value)} className="border rounded px-2 py-1 text-sm">
                      <option value="公斤">公斤</option>
                      <option value="支">支</option>
                      <option value="吨">吨</option>
                    </select>
                    <span className="text-xs text-gray-400">{it.unit || '公斤'}</span>
                    <button type="button" onClick={() => removeRow(i)} className="text-red-600"><i className="fas fa-trash"></i></button>
                  </div>
                ))}
                <button type="button" onClick={addRow} className="text-teal-600 text-sm"><i className="fas fa-plus mr-1"></i>添加明细</button>
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

export { OutsourcingManager };
