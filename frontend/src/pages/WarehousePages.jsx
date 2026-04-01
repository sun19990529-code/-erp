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
import { useConfirm } from '../components/ConfirmModal';
import OperatorSelect from '../components/OperatorSelect';
import { doPrint } from '../utils/printEngine';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const PrintableQRCode = ({ value, label }) => (
  <div className="flex flex-col items-center">
    <QRCode value={value || ''} size={120} level="H" />
    <span className="mt-2 text-xs font-bold text-gray-600 tracking-widest">{label}</span>
  </div>
);

const InventoryView = ({ defaultType = 'raw', title = '全局库存总账' }) => {
  const [activeType, setActiveType] = useState(defaultType);
  const [confirm, ConfirmDialog] = useConfirm();

  const [data, setData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  
  const load = () => api.get(`/inventory?warehouse_type=${activeType}`).then(res => res.success && setData(res.data));
  useEffect(() => { load(); }, [activeType]);
  
  const warehouses = [...new Set(data.map(i => i.warehouse_name))].filter(Boolean);
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.product_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.specification || '').toLowerCase().includes(searchText.toLowerCase());
    const matchWarehouse = !warehouseFilter || item.warehouse_name === warehouseFilter;
    const matchAlert = !alertFilter || 
      (alertFilter === 'low' && item.alert_threshold > 0 && item.quantity <= item.alert_threshold) ||
      (alertFilter === 'normal' && (item.alert_threshold === 0 || item.quantity > item.alert_threshold));
    return matchSearch && matchWarehouse && matchAlert;
  });
  
  const resetFilters = () => { setSearchText(''); setWarehouseFilter(''); setAlertFilter(''); };

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="bg-gray-100/80 backdrop-blur p-1 rounded-xl flex gap-1 border border-gray-200/50">
          {[
            { id: 'raw', label: '原材料' },
            { id: 'semi', label: '半成品' },
            { id: 'finished', label: '成品' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveType(t.id)}
              className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${activeType === t.id ? 'bg-white text-teal-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <SearchFilter
        searchPlaceholder={`搜索${activeType === 'raw' ? '原材料' : activeType === 'semi' ? '半成品' : '成品'}编码/名称/规格...`}
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          { key: 'warehouse', label: '仓库', value: warehouseFilter, options: warehouses.map(w => ({ value: w, label: w })) },
          { key: 'alert', label: '库存状态', value: alertFilter, options: [{ value: 'low', label: '库存不足' }, { value: 'normal', label: '库存正常' }] }
        ]}
        onFilterChange={(key, val) => { key === 'warehouse' && setWarehouseFilter(val); key === 'alert' && setAlertFilter(val); }}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Table columns={[
          { key: 'code', title: '产品编码' }, 
          { key: 'product_name', title: '产品名称' }, 
          { key: 'specification', title: '规格' },
          { key: 'batch_no', title: '批次号' },
          { key: 'warehouse_name', title: '所在仓库', render: v => <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">{v}</span> }, 
          { key: 'quantity', title: '当前库存', render: (v, row) => {
            const threshold = row.alert_threshold || 0;
            const isLow = threshold > 0 && v <= threshold;
            return (
              <span className={`font-bold ${isLow ? 'text-red-500' : 'text-teal-600'}`}>
                {v}
                {isLow && <i className="fas fa-exclamation-triangle ml-1 text-orange-500" title="库存低于安全水位"></i>}
              </span>
            );
          }},
          { key: 'alert_threshold', title: '基准水位', render: v => v || '-' },
          { key: 'locked_quantity', title: '冻结数量', render: v => <span className="text-gray-400">{v || 0}</span> }, 
          { key: 'unit', title: '单位' }
        ]} data={filteredData} />
      </div>
    </div>
  );
};

const WarehouseOrderManager = ({ orderType }) => {
  const { isAdmin } = useAuth();
  const [activeType, setActiveType] = useState('raw'); // 'raw', 'semi', 'finished'
  const [data, setData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  
  const title = orderType === 'inbound' ? '仓储统一入库' : '仓储统一出库';
  const apiPath = orderType === 'inbound' ? 'inbound' : 'outbound';
  
  const load = () => {
    api.get(`/${apiPath}?type=${activeType}`).then(res => res.success && setData(res.data));
    api.get(`/warehouses?type=${activeType}`).then(res => res.success && setWarehouses(res.data));
    api.get('/suppliers').then(res => res.success && setSuppliers(res.data));
    const category = activeType === 'raw' ? '原材料' : activeType === 'semi' ? '半成品' : '成品';
    api.get(`/products?category=${category}`).then(res => res.success && setProducts(res.data));
  };
  useEffect(() => { load(); setSelectedSupplierId(''); }, [activeType, orderType]);
  
  const typeLabel = activeType === 'raw' ? '原材料' : activeType === 'semi' ? '半成品' : '成品';
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.order_no || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.supplier_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.operator || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || item.status === statusFilter;
    const matchWarehouse = !warehouseFilter || item.warehouse_name === warehouseFilter;
    return matchSearch && matchStatus && matchWarehouse;
  });
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); setWarehouseFilter(''); };
  
  const openView = async (item) => {
    const res = await api.get(`/${apiPath}/${item.id}`);
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
    const warehouseId = fd.get('warehouse_id');
    const items = (modal.items || []).filter(i => i.product_id);
    
    // 验证必须选择仓库
    if (!warehouseId) {
      window.__toast?.warning('请选择仓库');
      return;
    }
    
    // 验证必须选择产品
    if (items.length === 0) {
      window.__toast?.warning('请至少选择一个产品');
      return;
    }
    
    // 验证数量为正数
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        window.__toast?.warning('数量必须大于0');
        return;
      }
    }
    
    // 出库时验证库存是否足够
    if (orderType === 'outbound') {
      const invRes = await api.get(`/inventory?warehouse_type=${activeType}`);
      if (invRes.success) {
        // 使用 String() 转换确保类型一致
        const warehouseIdStr = String(warehouseId);
        const inventory = invRes.data.filter(i => String(i.warehouse_id) === warehouseIdStr);
        
        if (inventory.length === 0) {
          window.__toast?.warning('该仓库暂无库存记录，请检查仓库选择是否正确');
          return;
        }
        
        for (const item of items) {
          const productIdStr = String(item.product_id);
          const batchNo = item.batch_no || 'DEFAULT_BATCH';
          const inv = inventory.find(i => String(i.product_id) === productIdStr && i.batch_no === batchNo);
          const product = products.find(p => String(p.id) === productIdStr);
          
          if (!inv) {
            window.__toast?.warning(`${product?.name || '产品'} (批次: ${batchNo}) 在该仓库无可扣减库存`);
            return;
          }
          
          if (Number(inv.quantity) < Number(item.quantity)) {
            window.__toast?.warning(`${product?.name || '产品'} (批次: ${batchNo}) 库存不足！\n当前库存: ${inv.quantity} 公斤\n出库申请: ${item.quantity} 公斤`);
            return;
          }
        }
      }
    }
    
    // 确保items包含input_quantity和input_unit字段
    const processedItems = items.map(item => ({
      ...item,
      input_quantity: item.input_quantity || item.quantity,
      input_unit: item.input_unit || '公斤'
    }));
    
    const obj = { 
      type: activeType, 
      warehouse_id: warehouseId, 
      supplier_id: fd.get('supplier_id') || null, 
      operator: fd.get('operator'), 
      remark: fd.get('remark'), 
      items: processedItems 
    };
    try {
      const res = modal.mode === 'edit'
        ? await api.put(`/${apiPath}/${modal.item.id}`, obj, { invalidate: ['inventory'] })
        : await api.post(`/${apiPath}`, obj, { invalidate: ['inventory'] });
      if (res.success) { closeModal(); load(); }
      else {
        window.__toast?.error('提交失败: ' + (res.message || '未知错误'));
      }
    } catch (err) {
      window.__toast?.error('请求异常: ' + err.message);
    }
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/${apiPath}/${item.id}/status`, { status }, { invalidate: ['inventory'] });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const openEdit = async (item) => {
    const res = await api.get(`/${apiPath}/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit' });
    }
  };
  
  const del = async (item) => {
    // 如果是出库且已完成，管理员可以强制删除
    if (orderType === 'outbound' && item.status === 'completed') {
      if (!isAdmin) {
        window.__toast?.warning('已出库的单据不能删除，如需删除请联系管理员');
        return;
      }
      if (!await confirm('⚠️ 警告：此单据已出库完成！\n\n删除将自动回滚库存。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/${apiPath}/${item.id}?force=true`);
      if (res.success) load();
      else window.__toast?.error(res.message);
      return;
    }
    
    // 如果是入库且已完成，管理员可以强制删除
    if (orderType === 'inbound' && item.status === 'completed') {
      if (!isAdmin) {
        window.__toast?.warning('已入库的单据不能删除，如需删除请联系管理员');
        return;
      }
      if (!await confirm('⚠️ 警告：此单据已入库完成！\n\n删除将自动回滚库存。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/${apiPath}/${item.id}?force=true`);
      if (res.success) load();
      else window.__toast?.error(res.message);
      return;
    }
    
    if (!await confirm('确定删除该单据？')) return;
    const res = await api.del(`/${apiPath}/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };

  const addRow = () => {
    setModal({ ...modal, items: [...(modal.items || []), { product_id: '', quantity: 1, input_quantity: 1, input_unit: '公斤' }] });
  };
  
  const removeRow = (index) => {
    const newItems = (modal.items || []).filter((_, i) => i !== index);
    setModal({ ...modal, items: newItems.length ? newItems : [{ product_id: '', quantity: 1, input_quantity: 1, input_unit: '公斤' }] });
  };
  
  // 单位转换函数：支持"支"转"公斤"的换算
  // 公式：((外径-壁厚)*壁厚)*0.02491*长度=单支公斤
  const convertToKg = (quantity, unit, productId) => {
    if (unit === '吨') return quantity * 1000;
    if (unit === '支') {
      // 获取产品尺寸信息
      const product = products.find(p => String(p.id) === String(productId));
      if (product && product.outer_diameter && product.wall_thickness && product.length) {
        const outerDiameter = parseFloat(product.outer_diameter) || 0;
        const wallThickness = parseFloat(product.wall_thickness) || 0;
        const length = parseFloat(product.length) || 0;
        // 公式：((外径-壁厚)*壁厚)*0.02491*长度=单支公斤
        const kgPerPiece = ((outerDiameter - wallThickness) * wallThickness) * 0.02491 * length;
        return quantity * kgPerPiece;
      }
      // 如果没有产品尺寸信息，无法转换
      return 0;
    }
    return quantity;
  };
  
  const updateItem = (index, field, value) => {
    const newItems = [...(modal.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // 如果修改了输入数量或产品，重新计算公斤数量
    const item = newItems[index];
    if (field === 'input_quantity' || field === 'product_id') {
      const product = products.find(p => String(p.id) === String(item.product_id));
      const unit = product?.unit || '公斤';
      const inputQuantity = item.input_quantity || item.quantity || 0;
      item.quantity = convertToKg(inputQuantity, unit, item.product_id);
      item.input_unit = unit; // 自动设置单位为产品绑定的单位
    }
    
    setModal({ ...modal, items: newItems });
  };

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="bg-gray-100/80 backdrop-blur p-1 rounded-xl flex gap-1 border border-gray-200/50">
            {[
              { id: 'raw', label: '原材料' },
              { id: 'semi', label: '半成品' },
              { id: 'finished', label: '成品' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveType(t.id)}
                className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${activeType === t.id ? 'bg-white text-teal-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 shadow-sm"><i className="fas fa-plus mr-2"></i>新增{typeLabel}单据</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索单号/供应商/操作员..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[
          { key: 'warehouse', label: '仓库', value: warehouseFilter, options: warehouses.map(w => ({ value: w.name, label: w.name })) },
          { key: 'status', label: '状态', value: statusFilter, options: [{ value: 'pending', label: '待处理' }, { value: 'approved', label: '已审批' }, { value: 'completed', label: '已完成' }] }
        ]}
        onFilterChange={(key, val) => { key === 'warehouse' && setWarehouseFilter(val); key === 'status' && setStatusFilter(val); }}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'order_no', title: '单号' }, { key: 'warehouse_name', title: '仓库' }, { key: 'supplier_name', title: '供应商' },
          { key: 'operator', title: '操作员' },
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} type={orderType} /> },
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={filteredData} onView={openView} onEdit={openEdit} onDelete={del} editPermission="warehouse_edit" deletePermission="warehouse_delete" />
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? '详情' : modal.mode === 'edit' ? `编辑${title}` : `新增${title}`} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>单号：</strong>{modal.item?.order_no}</div>
              <div><strong>仓库：</strong>{modal.item?.warehouse_name}</div>
              <div><strong>供应商：</strong>{modal.item?.supplier_name || '-'}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} type={orderType} /></div>
              <div><strong>操作员：</strong>{modal.item?.operator || '-'}</div>
              <div><strong>备注：</strong>{modal.item?.remark || '-'}</div>
            </div>
            <table className="w-full border">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-xs">产品编码</th><th className="px-3 py-2 text-left text-xs">产品名称</th>
                <th className="px-3 py-2 text-left text-xs">供应商批号</th>
                <th className="px-3 py-2 text-left text-xs">炉号</th>
                <th className="px-3 py-2 text-left text-xs">入库批号</th>
                <th className="px-3 py-2 text-left text-xs">输入数量</th>
                <th className="px-3 py-2 text-left text-xs">库存数量(公斤)</th>
              </tr></thead>
              <tbody>
                {(modal.item?.items || []).map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-sm">{it.code}</td>
                    <td className="px-3 py-2 text-sm">{it.name}</td>
                    <td className="px-3 py-2 text-sm text-blue-600">{it.supplier_batch_no || '-'}</td>
                    <td className="px-3 py-2 text-sm text-orange-600">{it.heat_no || '-'}</td>
                    <td className="px-3 py-2 text-sm text-teal-700 font-medium">{it.batch_no || '-'}</td>
                    <td className="px-3 py-2 text-sm">{it.input_quantity || it.quantity} {it.input_unit || '公斤'}</td>
                    <td className="px-3 py-2 text-sm">{it.quantity} 公斤</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {modal.item?.order_no && (
              <div className="flex justify-center mt-6 mb-2 pt-4 border-t border-gray-100">
                <PrintableQRCode value={modal.item.order_no} label={`${title} 流转单`} />
              </div>
            )}
            
            {modal.item?.status === 'pending' && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">关闭</button>
                <button type="button" onClick={async () => {
                  if (!await confirm('确认审批通过并扣减库存？')) return;
                  const res = await api.put(`/${apiPath}/${modal.item.id}/status`, { status: 'completed' }, { invalidate: ['inventory'] });
                  if (res.success) { closeModal(); load(); }
                  else window.__toast?.error(res.message || '审批失败');
                }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><i className="fas fa-check mr-2"></i>审批出库</button>
              </div>
            )}
            {modal.item?.status !== 'pending' && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => {
                  doPrint(orderType, modal.item);
                }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-bold flex items-center">
                  <i className="fas fa-print mr-2"></i>打印{title}
                </button>
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">关闭</button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">仓库 *</label>
                <SearchSelect name="warehouse_id" options={warehouses} placeholder="请选择仓库" required />
              </div>
              {orderType === 'inbound' && <div><label className="block text-sm font-medium mb-1">供应商</label>
                <SearchSelect name="supplier_id" options={suppliers} placeholder="无" onChange={val => setSelectedSupplierId(val || '')} />
              </div>}
              <div><label className="block text-sm font-medium mb-1">操作员</label><OperatorSelect /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">明细</label>
              <div className="border rounded-lg p-3 space-y-2">
                {(modal.items || []).map((it, i) => {
                  const product = products.find(p => String(p.id) === String(it.product_id));
                  const unit = product?.unit || '公斤';
                  const kgQuantity = convertToKg(it.input_quantity || it.quantity || 0, unit, it.product_id);
                  // 计算每支公斤数（用于显示）
                  let kgPerPiece = null;
                  if (product?.outer_diameter && product?.wall_thickness && product?.length) {
                    kgPerPiece = ((parseFloat(product.outer_diameter) - parseFloat(product.wall_thickness)) * parseFloat(product.wall_thickness) * 0.02491 * parseFloat(product.length)).toFixed(4);
                  }
                  
                      const filteredProducts = ((activeType === 'raw' || activeType === 'semi') && selectedSupplierId)
                        ? products.filter(p => (p.suppliers || []).some(s => String(s.supplier_id) === String(selectedSupplierId)))
                        : products;
                      return (
                    <div key={i} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-2 relative group hover:border-teal-200 transition-colors">
                      <div className="w-full lg:flex-1 min-w-[200px]">
                        <SearchSelect options={filteredProducts} value={it.product_id} onChange={val => updateItem(i, 'product_id', val)} placeholder="搜索选择产品" />
                      </div>
                      <div className="w-[30%] lg:w-28">
                        <input type="text" value={it.supplier_batch_no || ''} onChange={e => updateItem(i, 'supplier_batch_no', e.target.value)} className="border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 w-full text-sm transition-all shadow-sm outline-none" placeholder="供应商批号(选填)" />
                      </div>
                      <div className="w-[20%] lg:w-24">
                        <input type="text" value={it.heat_no || ''} onChange={e => updateItem(i, 'heat_no', e.target.value)} className="border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 w-full text-sm transition-all shadow-sm outline-none" placeholder="炉号(选填)" />
                      </div>
                      <div className="w-[30%] lg:w-28">
                        <input type="number" value={it.input_quantity || it.quantity} onChange={e => updateItem(i, 'input_quantity', parseFloat(e.target.value) || 0)} className="border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 w-full text-sm transition-all shadow-sm outline-none" placeholder="输入数量" />
                      </div>
                      <div className="w-[30%] lg:w-auto flex flex-col lg:flex-row items-start lg:items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-1 bg-white border border-gray-200 text-gray-700 rounded-md text-xs font-medium shadow-sm">{unit}</span>
                          {unit === '支' && kgPerPiece && (
                            <span className="text-[11px] text-teal-600 font-medium bg-teal-50 px-1.5 py-0.5 rounded">({kgPerPiece}kg/支)</span>
                          )}
                        </div>
                        {unit !== '公斤' && (
                          <span className="text-sm font-bold text-teal-700 whitespace-nowrap mt-1 lg:mt-0">= {kgQuantity.toFixed(2)} kg</span>
                        )}
                        {unit === '公斤' && (
                          <span className="text-sm font-bold text-teal-700 whitespace-nowrap mt-1 lg:mt-0 lg:hidden">= {kgQuantity.toFixed(2)} kg</span>
                        )}
                      </div>
                      
                      {/* 规格及删除按钮区域 */}
                      <div className="w-full lg:w-48 flex items-center justify-between border-t lg:border-t-0 lg:border-l border-gray-200 pt-2 lg:pt-0 lg:pl-3 mt-1 lg:mt-0">
                        <span className="text-xs text-gray-500 truncate flex-1" title={product?.specification || '无规格参数'}>
                          <i className="fas fa-tag mr-1.5 opacity-40"></i>{product?.specification || '未配置规格'}
                        </span>
                        <button type="button" onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors ml-2" title="移除该行">
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
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

const TransferManager = () => {
  const [data, setData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });
  const [confirm, ConfirmDialog] = useConfirm();
  const [form, setForm] = useDraftForm('transfer_form', { from_warehouse_id: '', to_warehouse_id: '', operator: '', remark: '', items: [] });
  const [newItem, setNewItem] = useState({ product_id: '', quantity: '' });

  const load = () => {
    api.get('/transfer').then(res => res.success && setData(res.data));
    api.get('/warehouses').then(res => res.success && setWarehouses(res.data));
    api.get('/products').then(res => res.success && setProducts(res.data));
  };
  useEffect(() => { load(); }, []);

  const addItem = () => {
    if (!newItem.product_id || !newItem.quantity) return window.__toast?.error('请选择产品并填写数量');
    const prod = products.find(p => p.id === parseInt(newItem.product_id));
    setForm(f => ({ ...f, items: [...f.items, { product_id: parseInt(newItem.product_id), product_name: prod?.name || '', quantity: parseFloat(newItem.quantity), unit: prod?.unit || '' }] }));
    setNewItem({ product_id: '', quantity: '' });
  };

  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.from_warehouse_id || !form.to_warehouse_id) return window.__toast?.error('请选择调出和调入仓库');
    if (form.from_warehouse_id === form.to_warehouse_id) return window.__toast?.error('调出和调入仓库不能相同');
    if (!form.items.length) return window.__toast?.error('请至少添加一个调拨产品');
    const res = await api.post('/transfer', { from_warehouse_id: form.from_warehouse_id, to_warehouse_id: form.to_warehouse_id, operator: form.operator, remark: form.remark, items: form.items }, { invalidate: ['inventory'] });
    if (res.success) {
      window.__toast?.success('调拨单创建成功');
      setModal({ open: false, item: null });
      setForm({ from_warehouse_id: '', to_warehouse_id: '', operator: '', remark: '', items: [] });
      load();
    } else window.__toast?.error(res.message);
  };

  const confirmTransfer = async (item) => {
    if (!await confirm('确认执行调拨？确认后库存将立即调整。')) return;
    const res = await api.put(`/transfer/${item.id}/confirm`);
    if (res.success) { window.__toast?.success('调拨已完成，库存已调整'); load(); }
    else window.__toast?.error(res.message);
  };

  const del = async (item) => {
    if (!await confirm('确定删除该调拨单？')) return;
    const res = await api.del(`/transfer/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };

  const statusMap = { pending: '待确认', confirmed: '已完成', cancelled: '已取消' };

  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">仓库间调拨</h2>
          <p className="text-sm text-gray-500 mt-1">创建调拨单，在不同仓库间转移库存</p>
        </div>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700">
          <i className="fas fa-exchange-alt mr-2"></i>新建调拨单
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">调拨单号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">调出仓库</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">调入仓库</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">操作人</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">状态</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400"><i className="fas fa-exchange-alt text-4xl mb-3 block opacity-30"></i>暂无调拨记录</td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-mono text-teal-600 font-medium">{item.order_no}</td>
                <td className="px-4 py-3 text-sm">{item.from_warehouse_name || '-'}</td>
                <td className="px-4 py-3 text-sm">{item.to_warehouse_name || '-'}</td>
                <td className="px-4 py-3 text-sm">{item.operator || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
                    item.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{statusMap[item.status] || item.status}</span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  {item.status === 'pending' && (
                    <button onClick={() => confirmTransfer(item)} className="text-teal-600 hover:text-teal-800">
                      <i className="fas fa-check mr-1"></i>确认
                    </button>
                  )}
                  {item.status === 'pending' && (
                    <button onClick={() => del(item)} className="text-red-500 hover:text-red-700">
                      <i className="fas fa-trash mr-1"></i>删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title="新建调拨单" size="max-w-2xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">调出仓库 *</label>
              <select value={form.from_warehouse_id} onChange={e => setForm(f => ({ ...f, from_warehouse_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2" required>
                <option value="">选择调出仓库</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">调入仓库 *</label>
              <select value={form.to_warehouse_id} onChange={e => setForm(f => ({ ...f, to_warehouse_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2" required>
                <option value="">选择调入仓库</option>
                {warehouses.filter(w => w.id !== parseInt(form.from_warehouse_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">操作人</label>
            <OperatorSelect name="operator_inline" value={form.operator} onChange={v => setForm(f => ({ ...f, operator: v }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">调拨明细</label>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <SearchSelect
                  options={products.map(p => ({ id: p.id, name: p.name, code: p.code }))}
                  value={newItem.product_id}
                  onChange={v => setNewItem(n => ({ ...n, product_id: v }))}
                  placeholder="搜索产品编码或名称"
                />
              </div>
              <input type="number" placeholder="数量" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} className="w-28 border rounded-lg px-3 py-2 text-sm" />
              <button type="button" onClick={addItem} className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700">添加</button>
            </div>
            {form.items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                {form.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-sm">
                    <span>{it.product_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{it.quantity} {it.unit}</span>
                      <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700"><i className="fas fa-times"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">备注</label>
            <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} className="w-full border rounded-lg px-3 py-2" rows="2"></textarea>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">创建调拨单</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export { InventoryView, WarehouseOrderManager, TransferManager };
