import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { formatAmount, formatQuantity } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import SearchFilter from '../components/SearchFilter';
import SearchSelect, { SimpleSearchSelect } from '../components/SearchSelect';
import Table from '../components/Table';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { useDraftForm } from '../hooks/useDraftForm';
import SimpleCRUDManager from '../components/SimpleCRUDManager';
import { useConfirm } from '../components/ConfirmModal';
import PurchaseFormModal from '../components/PurchaseFormModal';

const PurchaseManager = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  
  // 初始化数据只加载一次
  const load = async () => {
    const [sup, prod, pur] = await Promise.all([
      api.get('/suppliers'),
      api.get('/products?category=原材料'),
      api.get('/purchase')
    ]);
    if (sup.success) setSuppliers(sup.data);
    if (prod.success) setProducts(prod.data);
    if (pur.success) setData(pur.data);
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
    setModal({ open: true, item: null, items: [], mode: 'create' });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, items: [], mode: 'list' });
  };
  
  const save = async (formData) => {
    const res = modal.mode === 'edit'
      ? await api.put(`/purchase/${modal.item.id}`, formData)
      : await api.post('/purchase', formData);
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message || '提交失败');
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/purchase/${item.id}/status`, { status });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/purchase/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    const isCompleted = item.status === 'completed' || item.status === 'received';
    const isProcessing = item.status !== 'pending' && !isCompleted;
    
    // 非管理员不允许删除非 pending 状态的单据
    if ((isCompleted || isProcessing) && !isAdmin) {
      window.__toast?.error('仅管理员可删除非待处理状态的采购单');
      return;
    }
    
    const message = isCompleted
      ? `⚠️ 该采购单已${item.status === 'received' ? '收货' : '完成'}，强制删除将同时回滚：\n\n• 关联的入库单及已入库存\n• 关联的应付账款及付款记录\n\n确定要强制删除吗？`
      : isProcessing
        ? `该采购单状态为"${item.status}"，确定要强制删除吗？`
        : '确定删除该采购单？';
    if (!await confirm(message)) return;
    const force = item.status !== 'pending' ? '?force=true' : '';
    const res = await api.del(`/purchase/${item.id}${force}`);
    if (res.success) { 
      window.__toast?.success(res.message || '删除成功');
      load(); 
    }
    else window.__toast?.error(res.message);
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
          { key: 'total_amount', title: '总金额(¥)', render: (v, item) => formatAmount((item.items || []).reduce((sum, it) => sum + ((it.quantity || 0) * (it.unit_price || 0)), 0)) },
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={filteredData}
          onView={openView} 
          onEdit={openEdit} 
          onDelete={del} 
          editPermission="purchase_edit" 
          deletePermission="purchase_delete" />
      </div>
      {modal.mode === 'view' && (
        <Modal isOpen={modal.open} onClose={closeModal} title="采购详情" size="max-w-3xl">
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
                <th className="px-3 py-2 text-right text-xs">单价(¥)</th><th className="px-3 py-2 text-right text-xs">总金额(¥)</th>
              </tr></thead>
              <tbody>
                {(modal.item?.items || []).map((it, i) => (
                  <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm">{formatQuantity(it.quantity)}</td><td className="px-3 py-2 text-sm">{it.unit || '公斤'}</td>
                    <td className="px-3 py-2 text-right text-sm">{formatAmount(it.unit_price || 0)}</td><td className="px-3 py-2 text-right text-sm">{formatAmount((it.unit_price || 0) * (it.quantity || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right font-bold text-gray-800 mt-2">
              合计金额: ¥{formatAmount((modal.item?.items || []).reduce((sum, it) => sum + ((it.unit_price || 0) * (it.quantity || 0)), 0))}
            </div>
            
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
        </Modal>
      )}

      {/* 新增/编辑弹窗（自带外壳，须在独立层渲染） */}
      {(modal.mode === 'create' || modal.mode === 'edit') && (
        <PurchaseFormModal 
          isOpen={modal.open}
          onClose={closeModal}
          mode={modal.mode}
          initialData={modal.item}
          onSubmitSuccess={save}
          suppliers={suppliers}
          allProducts={products}
        />
      )}
      <ConfirmDialog />
    </div>
  );
};

export { PurchaseManager };
