import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
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
import PrintableQRCode from '../components/PrintableQRCode';

const OrderManager = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  
  const load = (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 20 });
    if (statusFilter) params.append('status', statusFilter);
    if (searchText) params.append('keyword', searchText);
    
    api.get(`/orders?${params.toString()}`).then(res => {
      if (res.success) {
        setData(res.data);
        setPagination(res.pagination || { page: 1, pageSize: 20, total: res.data.length, totalPages: 1 });
      }
    }).finally(() => setLoading(false));
    
    api.get('/customers').then(res => res.success && setCustomers(res.data));
    api.get('/products?category=成品').then(res => res.success && setProducts(res.data));
  };
  
  useEffect(() => { load(1); }, [searchText, statusFilter]);
  
  const handlePageChange = (page) => {
    load(page);
  };
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); setCustomerFilter(''); };
  
  const openView = async (item) => {
    const res = await api.get(`/orders/${item.id}`);
    setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'view' });
  };
  
  const openCreate = () => {
    setModal({ open: true, item: null, items: [{ product_id: '', quantity: 1 }], mode: 'create' });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, items: [], mode: 'list' });
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = (modal.items || []).filter(i => i.product_id);
    const obj = { customer_id: fd.get('customer_id') || null, customer_name: fd.get('customer_name'), customer_phone: fd.get('customer_phone'), customer_address: fd.get('customer_address'), delivery_date: fd.get('delivery_date'), priority: fd.get('priority'), remark: fd.get('remark'), items };
    const res = modal.mode === 'edit'
      ? await api.put(`/orders/${modal.item.id}`, obj)
      : await api.post('/orders', obj);
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/orders/${item.id}/status`, { status });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/orders/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    // 如果非待处理状态，管理员可以强制删除
    if (item.status !== 'pending') {
      if (!isAdmin) {
        window.__toast?.warning('只能删除待处理状态的订单，如需删除请联系管理员');
        return;
      }
      if (!confirm('⚠️ 警告：此订单已开始处理！\n\n删除后将同时删除关联的生产工单等数据。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/orders/${item.id}?force=true`);
      if (res.success) load();
      else window.__toast?.error(res.message);
      return;
    }
    
    if (!confirm('确定删除该订单？')) return;
    const res = await api.del(`/orders/${item.id}`);
    if (res.success) load();
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
      const existing = existingOrders.find(po => po.product_id == item.product_id);
      if (existing) {
        skipped++;
        continue; // 已存在则跳过
      }
      
      const res = await api.post('/production', {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        operator: '',
        remark: `销售订单: ${order.order_no}`
      });
      if (res.success) created++;
    }
    
    let message = '';
    if (created > 0) {
      message = `成功创建 ${created} 个生产工单！`;
    }
    if (skipped > 0) {
      message += `\n跳过 ${skipped} 个已存在的工单`;
    }
    if (message) {
      alert(message);
      // 刷新订单详情
      const res = await api.get(`/orders/${order.id}`);
      if (res.success) {
        setModal({ ...modal, item: res.data });
      }
    } else {
      window.__toast?.warning('没有需要创建的生产工单');
    }
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

  const updateOrderStatus = async (orderId, newStatus) => {
    const statusLabels = { confirmed: '确认订单', processing: '开始生产', completed: '完成订单', cancelled: '取消订单' };
    if (!confirm(`确定${statusLabels[newStatus] || newStatus}？`)) return;
    const res = await api.put(`/orders/${orderId}/status`, { status: newStatus });
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">销售订单中心</h2>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-sm"><i className="fas fa-plus mr-2"></i>新增订单</button>
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
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? '订单详情' : modal.mode === 'edit' ? '编辑订单' : '新增订单'} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>订单号：</strong>{modal.item?.order_no}</div>
              <div><strong>客户：</strong>{modal.item?.customer_name}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} /></div>
              <div><strong>交期：</strong>{modal.item?.delivery_date || '-'}</div>
              <div><strong>优先级：</strong>{modal.item?.priority === 1 ? '普通' : modal.item?.priority === 2 ? '加急' : '特急'}</div>
              <div><strong>进度：</strong>{modal.item?.progress || 0}%</div>
            </div>
            <table className="w-full border">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
                <th className="px-3 py-2 text-left text-xs">数量</th><th className="px-3 py-2 text-left text-xs">单位</th>
              </tr></thead>
              <tbody>
                {(modal.item?.items || []).map((it, i) => (
                  <tr key={i} className="border-t"><td className="px-3 py-2 text-sm">{it.code}</td><td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm font-medium">{it.quantity}</td>
                    <td className="px-3 py-2 text-sm">{it.unit || '支'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* 订单状态操作按钮 - 仅订单状态模块显示 */}
            {modal.mode === 'view' && modal.item?.status !== 'completed' && modal.item?.status !== 'cancelled' && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium mb-2"><i className="fas fa-tasks mr-2 text-teal-500"></i>状态操作</h4>
                <div className="flex flex-wrap gap-2">
                  {modal.item?.status === 'pending' && (
                    <>
                      <button onClick={() => updateOrderStatus(modal.item.id, 'confirmed')} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"><i className="fas fa-check mr-1"></i>确认订单</button>
                      <button onClick={() => updateOrderStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消订单</button>
                    </>
                  )}
                  {modal.item?.status === 'confirmed' && (
                    <>
                      <button onClick={() => updateOrderStatus(modal.item.id, 'processing')} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"><i className="fas fa-play mr-1"></i>开始生产</button>
                      <button onClick={() => updateOrderStatus(modal.item.id, 'cancelled')} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"><i className="fas fa-times mr-1"></i>取消订单</button>
                    </>
                  )}
                  {modal.item?.status === 'processing' && (
                    <button onClick={() => updateOrderStatus(modal.item.id, 'completed')} className="px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 text-sm"><i className="fas fa-check-double mr-1"></i>完成订单</button>
                  )}
                </div>
              </div>
            )}
            
            {/* 关联的生产工单 */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium"><i className="fas fa-industry mr-2 text-blue-500"></i>关联生产工单</h4>
                {modal.mode === 'view' && modal.item?.status !== 'completed' && modal.item?.status !== 'cancelled' && (
                  <button onClick={() => createProductionFromOrder(modal.item)} className="text-blue-600 text-sm hover:text-blue-800">
                    <i className="fas fa-plus mr-1"></i>生成生产工单
                  </button>
                )}
              </div>
              {modal.item?.productionOrders && modal.item.productionOrders.length > 0 ? (
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
                      {modal.item.productionOrders.map((po, i) => (
                        <tr key={i} className="border-t hover:bg-blue-50 cursor-pointer" onClick={() => { window.location.hash = 'production-orders'; window.location.reload(); }}>
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
                  <button onClick={() => createProductionFromOrder(modal.item)} className="block mx-auto mt-2 text-blue-600 text-sm hover:text-blue-800">
                    <i className="fas fa-plus mr-1"></i>点击生成生产工单
                  </button>
                </div>
              )}
            </div>
            
            {/* 关联的出库单 */}
            {modal.item?.outboundOrders && modal.item.outboundOrders.length > 0 && (
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
                      {modal.item.outboundOrders.map((oo, i) => (
                        <tr key={i} className="border-t hover:bg-purple-50 cursor-pointer" onClick={() => { window.location.hash = 'outbound-finished'; window.location.reload(); }}>
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
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">客户</label>
                <select name="customer_id" defaultValue={modal.item?.customer_id || ''} onChange={e => { const c = customers.find(x => x.id == e.target.value); if (c) { e.target.form.customer_name.value = c.name; e.target.form.customer_phone.value = c.phone || ''; e.target.form.customer_address.value = c.address || ''; }}} className="w-full border rounded-lg px-3 py-2">
                  <option value="">选择客户</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">客户名称</label><input name="customer_name" defaultValue={modal.item?.customer_name || ''} className="w-full border rounded-lg px-3 py-2 bg-gray-50" readOnly /></div>
              <div><label className="block text-sm font-medium mb-1">联系电话</label><input name="customer_phone" defaultValue={modal.item?.customer_phone || ''} className="w-full border rounded-lg px-3 py-2 bg-gray-50" readOnly /></div>
              <div><label className="block text-sm font-medium mb-1">交货日期</label><input name="delivery_date" type="date" defaultValue={modal.item?.delivery_date || ''} className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">优先级</label>
                <select name="priority" defaultValue={modal.item?.priority || '1'} className="w-full border rounded-lg px-3 py-2">
                  <option value="1">普通</option><option value="2">加急</option><option value="3">特急</option>
                </select>
              </div>
            </div>
            <div><label className="block text-sm font-medium mb-1">收货地址</label><input name="customer_address" defaultValue={modal.item?.customer_address || ''} className="w-full border rounded-lg px-3 py-2" /></div>
            <div>
              <label className="block text-sm font-medium mb-2">订单明细</label>
              <div className="border rounded-lg p-3 space-y-2">
                {(modal.items || []).map((it, i) => (
                  <div key={i} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-2 relative group hover:border-teal-200 transition-colors">
                    <div className="w-full lg:flex-1 min-w-[200px]">
                      <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none bg-white">
                        <option value="">选择销售产品</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                      </select>
                    </div>
                    <div className="w-[45%] lg:w-32 flex items-center">
                      <input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 0)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm transition-all shadow-sm outline-none" placeholder="销售数量" />
                    </div>
                    <div className="w-16 text-sm text-gray-500 flex items-center">
                      {products.find(p => p.id == it.product_id)?.unit || '-'}
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
            <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" defaultValue={modal.item?.remark || ''} className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>
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

export { OrderManager };
