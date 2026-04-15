import React, { useState, useCallback } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import Pagination from '../../components/Pagination';
import SearchFilter from '../../components/SearchFilter';
import Table from '../../components/Table';
import { useConfirm } from '../../components/ConfirmModal';
import { useSafeFetch } from '../../hooks/useSafeFetch';

import OrderDetailModal from './OrderDetailModal';
import OrderFormModal from './OrderFormModal';

const OrderManager = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  const [modal, setModal] = useState({ open: false, item: null, mode: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  
  const load = useCallback(async (page = 1, isMounted) => {
    if (isMounted?.current === false) return;
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 20 });
    if (statusFilter) params.append('status', statusFilter);
    if (searchText) params.append('keyword', searchText);
    if (customerFilter) params.append('customer_name', customerFilter);
    
    const res = await api.get(`/orders?${params.toString()}`);
    if (isMounted?.current !== false) {
      if (res.success) {
        setData(res.data);
        setPagination(res.pagination || { page: 1, pageSize: 20, total: res.data.length, totalPages: 1 });
      }
      setLoading(false);
    }
  }, [searchText, statusFilter, customerFilter]);
  
  // 安全的数据加载
  const isMountedRef = useSafeFetch((isMounted) => load(1, isMounted), [load]);
  
  const handlePageChange = (page) => {
    load(page, isMountedRef);
  };
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); setCustomerFilter(''); };
  
  const openView = async (item) => {
    const res = await api.get(`/orders/${item.id}`);
    if (!res.success) { window.__toast?.error(res.message || '获取订单详情失败'); return; }
    setModal({ open: true, item: res.data, mode: 'view' });
  };
  
  const openCreate = () => {
    setModal({ open: true, item: null, mode: 'create' });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, mode: 'list' });
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/orders/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    // 如果非待处理状态，管理员可以强制删除
    if (item.status !== 'pending') {
      if (!isAdmin) {
        window.__toast?.warning('只能删除待处理状态的订单，如需删除请联系管理员');
        return;
      }
      if (!await confirm('⚠️ 警告：此订单已开始处理！\n\n删除后将同时删除关联的生产工单等数据。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/orders/${item.id}?force=true`, { invalidate: ['orders'] });
      if (res.success) load(1, isMountedRef);
      else window.__toast?.error(res.message);
      return;
    }
    
    if (!await confirm('确定删除该订单？')) return;
    const res = await api.del(`/orders/${item.id}`, { invalidate: ['orders'] });
    if (res.success) load(1, isMountedRef);
    else window.__toast?.error(res.message);
  };
  
  // 从销售订单创建生产工单
  const createProductionFromOrder = async (order) => {
    if (!order.items || order.items.length === 0) {
      window.__toast?.warning('订单没有产品明细');
      return;
    }
    
    // 获取该订单已有的生产工单
    const existingRes = await api.get(`/production?order_id=${order.id}`);
    const existingOrders = existingRes.data || [];
    
    // 为每个产品创建生产工单
    let created = 0;
    let skipped = 0;
    for (const item of order.items) {
      // 检查是否已存在该产品的生产工单
      const existing = existingOrders.find(po => String(po.product_id) === String(item.product_id));
      if (existing) {
        skipped++;
        continue;
      }
      
      const res = await api.post('/production', {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        operator: '',
        remark: `销售订单: ${order.order_no}`
      }, { invalidate: ['production'] });
      if (res.success) created++;
    }
    
    let message = '';
    if (created > 0) message = `成功创建 ${created} 个生产工单！`;
    if (skipped > 0) message += `\n跳过 ${skipped} 个已存在的工单`;
    
    if (message) {
      window.__toast?.success(message);
      // 刷新订单详情
      const res = await api.get(`/orders/${order.id}`);
      if (res.success) {
        setModal({ ...modal, item: res.data });
      }
    } else {
      window.__toast?.warning('没有需要创建的生产工单');
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    const statusLabels = { confirmed: '确认订单', processing: '开始生产', cancelled: '取消订单' };
    if (!await confirm(`确定${statusLabels[newStatus] || newStatus}？`)) return;
    const res = await api.put(`/orders/${orderId}/status`, { status: newStatus }, { invalidate: ['orders'] });
    if (res.success) {
      window.__toast?.success(`${statusLabels[newStatus]}成功`);
      // 刷新弹窗数据（不关闭弹窗）+ 刷新列表
      const detailRes = await api.get(`/orders/${orderId}`);
      if (detailRes.success) setModal(prev => ({ ...prev, item: detailRes.data }));
      load(1, isMountedRef);
    }
    else window.__toast?.error(res.message);
  };
  
  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">销售订单中心</h2>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-sm">
          <i className="fas fa-plus mr-2"></i>新增订单
        </button>
      </div>
      
      <SearchFilter
        searchPlaceholder="搜索单号/客户..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          { key: 'customer', label: '客户', value: customerFilter, options: [...new Set(data.map(d => d.customer_name))].filter(Boolean).map(c => ({ value: c, label: c })) },
          { key: 'status', label: '状态', value: statusFilter, options: [
              { value: 'pending', label: '待处理' }, 
              { value: 'confirmed', label: '已确认' }, 
              { value: 'processing', label: '进行中' }, 
              { value: 'completed', label: '已完成' }, 
              { value: 'cancelled', label: '已取消' }
            ]
          }
        ]}
        onFilterChange={(key, val) => { key === 'customer' && setCustomerFilter(val); key === 'status' && setStatusFilter(val); }}
        onReset={resetFilters}
      />
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Table columns={[
          { key: 'order_no', title: '订单号' }, 
          { key: 'customer_name', title: '客户' }, 
          { key: 'progress', title: '进度', render: v => (
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 transition-all" style={{ width: `${v || 0}%` }}></div>
              </div>
              <span className="text-sm text-gray-600">{v || 0}%</span>
            </div>
          )},
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} /> }, 
          { key: 'delivery_date', title: '交货日期' }, 
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={data} 
          onView={openView} 
          onEdit={openEdit} 
          onDelete={del} 
          editPermission="order_edit" 
          deletePermission="order_delete" 
          loading={loading} />
        <Pagination pagination={pagination} onPageChange={handlePageChange} />
      </div>

      <OrderDetailModal 
        isOpen={modal.open && modal.mode === 'view'} 
        onClose={closeModal} 
        item={modal.item} 
        onUpdateStatus={updateOrderStatus}
        onCreateProduction={createProductionFromOrder}
      />
      
      <OrderFormModal 
        isOpen={modal.open && (modal.mode === 'create' || modal.mode === 'edit')} 
        onClose={closeModal} 
        item={modal.item}
        onSubmitSuccess={() => {
          closeModal();
          load(1, isMountedRef);
        }}
      />
    </div>
  );
};

export default OrderManager;
