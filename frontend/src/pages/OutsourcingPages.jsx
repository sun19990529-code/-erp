import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { formatAmount, formatQuantity } from '../utils/format';
import Pagination from '../components/Pagination';
import SearchFilter from '../components/SearchFilter';
import SearchSelect, { SimpleSearchSelect } from '../components/SearchSelect';
import Table from '../components/Table';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { useDraftForm } from '../hooks/useDraftForm';
import SimpleCRUDManager from '../components/SimpleCRUDManager';
import { useConfirm } from '../components/ConfirmModal';
import OperatorSelect from '../components/OperatorSelect';
import OutsourcingFormModal from '../components/OutsourcingFormModal';

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
  const loadStatic = async () => {
    const [sRes, pRes, procRes] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products'),
      api.get('/production/processes')
    ]);
    if (sRes.success) setSuppliers(sRes.data);
    if (pRes.success) setProducts(pRes.data);
    if (procRes.success) setProcesses(procRes.data);
  };
  useEffect(() => { loadStatic(); }, []);

  const load = async () => {
    const [oRes, prodRes, penRes] = await Promise.all([
      api.get('/outsourcing'),
      api.get('/production?status=processing'),
      api.get('/outsourcing/pending')
    ]);
    if (oRes.success) setData(oRes.data);
    if (prodRes.success) setProductions(prodRes.data);
    if (penRes.success) setPendingOutsourcing(penRes.data);
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
    setModal({ open: true, item: null, items: [{ product_id: '', quantity: 1, unit_price: '' }], mode: 'create' });
  };
  
  // 从待委外列表快速创建
  const openFromPending = (item) => {
    setModal({ 
      open: true, 
      item: null, 
      items: [{ product_id: item.product_id, quantity: item.quantity, unit_price: '' }], 
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
    setModal({ ...modal, items: [...(modal.items || []), { product_id: '', quantity: 1, unit_price: '' }] });
  };
  
  const removeRow = (index) => {
    const newItems = (modal.items || []).filter((_, i) => i !== index);
    setModal({ ...modal, items: newItems.length ? newItems : [{ product_id: '', quantity: 1, unit_price: '' }] });
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
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-orange-100/50"><tr>
                <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold rounded-tl-lg">生产工单</th>
                <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">产品</th>
                <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">工序</th>
                <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold">数量</th>
                <th className="px-3 py-2 text-left text-xs text-orange-900 font-semibold rounded-tr-lg">操作</th>
              </tr></thead>
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
          <div className="block md:hidden space-y-2 mt-2">
            {pendingOutsourcing.map((item, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-orange-200/50">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="font-medium text-orange-900 text-sm">{item.order_no}</div>
                  <span className="bg-orange-200 px-2 py-0.5 rounded text-xs text-orange-800">{item.process_name}</span>
                </div>
                <div className="text-sm text-gray-700 mb-2">{item.product_name} · <span className="font-bold">{item.quantity} {item.unit || '件'}</span></div>
                <button onClick={() => openFromPending(item)} className="w-full text-center py-2 border border-orange-400 text-orange-600 rounded-lg text-sm font-medium active:bg-orange-50 transition-colors">
                  <i className="fas fa-plus-circle mr-1"></i>快捷创建委外单
                </button>
              </div>
            ))}
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
      
      {/* 区分查看态与（新建/编辑）态，编辑态走新版 RHF 组件 */}
      <Modal isOpen={modal.open && modal.mode === 'view'} onClose={closeModal} title="委外详情" size="max-w-3xl">
        {modal.mode === 'view' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div><strong>委外单号：</strong>{modal.item?.order_no}</div>
              <div><strong>供应商：</strong>{modal.item?.supplier_name}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} /></div>
              <div><strong>预计完成：</strong>{modal.item?.expected_date || '-'}</div>
              <div><strong>关联工单：</strong>{modal.item?.production_order_no || '-'}</div>
              <div><strong>工序：</strong>{modal.item?.process_name || '-'}</div>
            </div>
            <div className="hidden md:block">
              <table className="w-full border">
                <thead className="bg-gray-50"><tr>
                  <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
                  <th className="px-3 py-2 text-right text-xs">数量</th>
                  <th className="px-3 py-2 text-right text-xs">单价(¥)</th>
                  <th className="px-3 py-2 text-right text-xs">金额(¥)</th>
                </tr></thead>
                <tbody>
                  {(modal.item?.items || []).map((it, i) => (
                    <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                      <td className="px-3 py-2 text-sm text-right">{formatQuantity(it.quantity)}</td>
                      <td className="px-3 py-2 text-sm text-right">¥{formatAmount(it.unit_price || 0)}</td>
                      <td className="px-3 py-2 text-sm text-right font-medium">¥{formatAmount((it.unit_price || 0) * (it.quantity || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="block md:hidden space-y-2">
              {(modal.item?.items || []).map((it, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-800 text-sm">{it.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{it.code}</div>
                    <div className="text-xs text-gray-500">单价: ¥{formatAmount(it.unit_price || 0)}</div>
                  </div>
                  <div className="text-lg font-bold text-teal-700">{formatQuantity(it.quantity)}</div>
                </div>
              ))}
            </div>
            
            {/* 委外状态操作按钮 */}
            {modal.item?.status !== 'received' && modal.item?.status !== 'cancelled' && modal.item?.status !== 'completed' && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium mb-2"><i className="fas fa-tasks mr-2 text-teal-500"></i>状态操作</h4>
                <div className="flex flex-wrap gap-2">
                  {modal.item?.status === 'pending' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'confirmed')} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-check mr-1"></i>确认委外</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-times mr-1"></i>取消委外</button>
                    </>
                  )}
                  {modal.item?.status === 'confirmed' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'processing')} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-cogs mr-1"></i>开始加工</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-times mr-1"></i>取消委外</button>
                    </>
                  )}
                  {modal.item?.status === 'processing' && (
                    <>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'received')} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-truck mr-1"></i>确认收货</button>
                      <button onClick={() => { closeModal(); window.__toast?.info('请前往 质检管理 → 委外加工检验 进行检验'); }} className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm flex-1 sm:flex-initial"><i className="fas fa-clipboard-check mr-1"></i>去检验</button>
                      <button onClick={() => updateOutsourcingStatus(modal.item.id, 'cancelled')} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex-1 sm:flex-initial"><i className="fas fa-times mr-1"></i>取消委外</button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="w-full sm:w-auto px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">关闭</button>
            </div>
          </div>
        )}
      </Modal>

      {/* RHF 现代试点表单 */}
      {(modal.mode === 'create' || modal.mode === 'edit') && (
        <OutsourcingFormModal 
          isOpen={modal.open}
          onClose={closeModal}
          mode={modal.mode}
          initialData={
            modal.mode === 'create' 
              ? { 
                  production_order_id: modal.productionOrder?.id || '', 
                  process_id: modal.processId || '',
                  items: modal.items 
                } 
              : modal.item
          }
          onSuccess={() => { closeModal(); load(); window.__toast?.success('保存成功'); }}
          suppliers={suppliers}
          products={products}
          productions={productions}
          processes={processes}
        />
      )}
    </div>
  );
};

export { OutsourcingManager };
