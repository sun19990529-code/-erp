import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

import { ProductionTrackingPanel } from './ProductionTracking';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { doPrint } from '../utils/printEngine';
import { useConfirm } from '../components/ConfirmModal';
import OperatorSelect from '../components/OperatorSelect';
import { convertToKg as sharedConvertToKg, convertFromKg, calcKgPerPieceFromProduct } from '../utils/unitConvert';
import NextStepActions from '../components/NextStepActions';
import PickFormModal from '../components/PickFormModal';
import { useScanner } from '../hooks/useScanner';

const PrintableQRCode = ({ value, label }) => (
  <div className="flex flex-col items-center">
    <QRCode value={value || ''} size={120} level="H" />
    <span className="mt-2 text-xs font-bold text-gray-600 tracking-widest">{label}</span>
  </div>
);

const PickMaterialManager = () => {
  const { isAdmin } = useAuth();
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();

  const [orders, setOrders] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]); // 生产工单
  const [warehouses, setWarehouses] = useState([]);
  const [materials, setMaterials] = useState([]); // 原材料
  const [semiProducts, setSemiProducts] = useState([]); // 半成品
  const [finishedProducts, setFinishedProducts] = useState([]); // 成品（用于工序材料配置）
  const [modal, setModal] = useState({ open: false, item: null, items: [], mode: 'list' });
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductQty, setSelectedProductQty] = useState(1);
  const formRef = useRef(null);

  useScanner((mac) => {
    if (modal.open && (modal.mode === 'create' || modal.mode === 'edit') && formRef.current) {
      const parsed = mac.match(/^M-(.+?)(?:-|$)/)?.[1];
      const keyword = parsed || mac;
      
      const foundMat = materials.find(m => m.code === keyword || String(m.id) === keyword) ||
                       semiProducts.find(m => m.code === keyword || String(m.id) === keyword);
                       
      if (foundMat) {
        if (modal.boundMaterialIds && !modal.boundMaterialIds.includes(foundMat.id)) {
           window.__toast?.warning(`产品 ${foundMat.name} 不属于当前过滤要求内`);
           return;
        }
        formRef.current.appendRow(foundMat);
        window.__toast?.success(`已扫码并装填物料: ${foundMat.name}`);
      } else {
        window.__toast?.error('库中未找到对应条形码或二维码，或者无对应库存权限！');
      }
    }
  });
  
  const load = async () => {
    const [pickRes, orderRes, poRes, whRes, rawRes, semiRes, finRes] = await Promise.all([
      api.get('/pick'),
      api.get('/orders?status=pending,processing'),
      api.get('/production?status=pending,processing'),
      api.get('/warehouses?type=raw'),
      api.get('/products?category=原材料'),
      api.get('/products?category=半成品'),
      api.get('/products?category=成品'),
    ]);
    if (pickRes.success) setData(pickRes.data);
    if (orderRes.success) setOrders(orderRes.data);
    if (poRes.success) setProductionOrders(poRes.data);
    if (whRes.success) setWarehouses(whRes.data);
    if (rawRes.success) setMaterials(rawRes.data);
    if (semiRes.success) setSemiProducts(semiRes.data);
    if (finRes.success) setFinishedProducts(finRes.data);
  };
  useEffect(() => { load(); }, []);
  
  // O(1) 查找 Map（合并 allMaterials 到 useMemo 内部，避免每轮渲染新建数组导致缓存失效）
  const allMaterials = useMemo(() => [...materials, ...semiProducts], [materials, semiProducts]);
  const materialMap = useMemo(() => {
    const map = new Map();
    allMaterials.forEach(m => map.set(String(m.id), m));
    return map;
  }, [allMaterials]);
  
  // 下拉显示格式：[供应商/客户] 产品名
  const fmtProduct = (p) => {
    const prefix = p.suppliers?.length ? `[${p.suppliers.map(s => s.supplier_name).join('/')}] ` : '';
    return `${prefix}${p.name} (${p.code})`;
  };
  const fmtFinished = (p) => {
    const prefix = p.customers?.length ? `[${p.customers.map(c => c.customer_name).join('/')}] ` : '';
    return `${prefix}${p.name} (${p.code})`;
  };

  // 按绑定关系过滤的物料列表（缓存避免每次渲染重复过滤）
  const filteredRawForPick = useMemo(() => {
    const bm = modal.boundMaterialIds;
    return bm ? materials.filter(m => bm.includes(m.id)) : materials;
  }, [modal.boundMaterialIds, materials]);
  const filteredSemiForPick = useMemo(() => {
    const bm = modal.boundMaterialIds;
    return bm ? semiProducts.filter(m => bm.includes(m.id)) : semiProducts;
  }, [modal.boundMaterialIds, semiProducts]);
  
  const openView = async (item) => {
    const res = await api.get(`/pick/${item.id}`);
    setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'view' });
  };
  
  const openCreate = (pickType = 'pick') => {
    setModal({ open: true, item: null, items: [{ material_id: '', quantity: 1, input_quantity: 1, input_unit: '公斤' }], mode: 'create', type: pickType });
  };
  
  // 基于成品工序材料配置自动填充领料单
  const openFromProductProcess = async (product, quantity = 1) => {
    const res = await api.get(`/products/${product.id}/process-materials`);
    const processMaterials = res.data || [];
    
    if (processMaterials.length === 0) {
      window.__toast?.warning('该成品暂无工序材料配置，请先在成品管理中配置工序材料');
      return;
    }
    
    // 汇总所有工序需要的材料（去重）
    const materialMap = new Map();
    processMaterials.forEach(pm => {
      if (!materialMap.has(pm.material_id)) {
        materialMap.set(pm.material_id, {
          material_id: pm.material_id,
          material_name: pm.material_name,
          material_code: pm.material_code,
          material_unit: pm.material_unit,
          quantity: '',
          input_quantity: '',
          input_unit: pm.material_unit || '公斤'
        });
      }
    });
    
    const items = Array.from(materialMap.values());
    // 获取成品绑定的物料ID列表用于过滤下拉
    const boundIds = (product.bound_materials || []).map(m => m.material_id);
    setModal({ 
      open: true, 
      item: { product_id: product.id, product_name: product.name }, 
      items: items.length ? items : [{ material_id: '', quantity: '', input_quantity: '', input_unit: '公斤' }], 
      mode: 'create',
      boundMaterialIds: boundIds.length > 0 ? boundIds : null
    });
  };
  
  const openFromOrder = async (order) => {
    // 获取订单的原材料需求
    const matRes = await api.get(`/orders/${order.id}/materials`);
    const orderMaterials = matRes.data || [];
    
    const items = orderMaterials.map(m => ({
      material_id: m.material_id,
      material_name: m.name,
      required_quantity: m.required_quantity,
      picked_quantity: m.picked_quantity || 0,
      quantity: Math.max(0, m.required_quantity - (m.picked_quantity || 0))
    })).filter(i => i.quantity > 0);
    
    // 获取该订单所有绑定的物料ID，用于下拉列表过滤
    const boundIds = orderMaterials.map(m => m.material_id);
    
    setModal({ 
      open: true, 
      item: { order_id: order.id, order_no: order.order_no }, 
      items: items.length ? items : [{ material_id: '', quantity: 1, input_quantity: 1, input_unit: '公斤' }], 
      mode: 'create',
      orderMaterials,
      boundMaterialIds: boundIds.length > 0 ? boundIds : null
    });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, items: [], mode: 'list' });
  };

  const openEdit = async (item) => {
    const res = await api.get(`/pick/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, items: res.data.items || [], mode: 'edit', type: res.data.type || 'pick' });
    }
  };

  const del = async (item) => {
    if (item.status === 'completed') {
      if (!isAdmin) {
        window.__toast?.warning('已完成的领料单不能删除，如需删除请联系管理员');
        return;
      }
      if (!await confirm('⚠️ 警告：此领料单已完成！\n\n删除将自动回滚库存。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/pick/${item.id}?force=true`);
      if (res.success) load();
      else window.__toast?.error(res.message);
      return;
    }
    if (!await confirm('确定删除该领料单？')) return;
    const res = await api.del(`/pick/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
    // 这些已被 RHF 移交组件内部管理，只保留外部框架的开关状态。
  // updateItem, addRow, convertToKg 等已抽离至 PickFormModal
  
  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">领料管理</h2>
        <div className="flex gap-2">
          <button onClick={() => openCreate('return')} className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors">
            <i className="fas fa-undo mr-2"></i>新建退料单
          </button>
          <button onClick={() => openCreate('pick')} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors">
            <i className="fas fa-plus mr-2"></i>新建领料单
          </button>
        </div>
      </div>
      
      {/* 待领料订单提醒 */}
      {orders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <h3 className="font-bold text-blue-800 mb-2"><i className="fas fa-info-circle mr-2"></i>待生产订单</h3>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-100"><tr>
                <th className="px-3 py-2 text-left text-xs">订单号</th>
                <th className="px-3 py-2 text-left text-xs">客户</th>
                <th className="px-3 py-2 text-left text-xs">金额</th>
                <th className="px-3 py-2 text-left text-xs">状态</th>
                <th className="px-3 py-2 text-left text-xs">操作</th>
              </tr></thead>
              <tbody>
                {orders.slice(0, 5).map((o, i) => (
                  <tr key={i} className="border-t border-blue-200">
                    <td className="px-3 py-2 text-sm">{o.order_no}</td>
                    <td className="px-3 py-2 text-sm">{o.customer_name}</td>
                    <td className="px-3 py-2 text-sm">¥{o.total_amount || 0}</td>
                    <td className="px-3 py-2 text-sm"><StatusBadge status={o.status} /></td>
                    <td className="px-3 py-2 text-sm">
                      <button onClick={() => openFromOrder(o)} className="text-blue-600 hover:text-blue-800 font-medium">
                        <i className="fas fa-boxes mr-1"></i>领料
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="block md:hidden space-y-2 mt-2">
            {orders.slice(0, 5).map((o, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-blue-200/50">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-medium text-sm text-blue-900">{o.order_no}</div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="text-sm text-gray-600 mb-2">{o.customer_name} · ¥{o.total_amount || 0}</div>
                <button onClick={() => openFromOrder(o)} className="w-full py-2 border border-blue-300 text-blue-600 rounded-lg text-sm font-medium active:bg-blue-50">
                  <i className="fas fa-boxes mr-1"></i>快捷领料
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'order_no', title: '单号' },
          { key: 'production_order_no', title: '关联工单', render: v => v ? <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{v}</span> : <span className="text-gray-400">-</span> },
          { key: 'type', title: '类型', render: v => (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${v === 'return' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
              {v === 'return' ? '退料' : '领料'}
            </span>
          )},
          { key: 'warehouse_name', title: '仓库' },
          { key: 'operator', title: '经办人' },
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} type="pick" /> },
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={data} onView={openView} onEdit={openEdit} onDelete={del} editPermission="production_edit" deletePermission="production_delete" />
      </div>
      
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? (modal.item?.type === 'return' ? '退料单详情' : '领料单详情') : (modal.type === 'return' ? '新建退料单' : '新建领料单')} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>领料单号：</strong>{modal.item?.order_no}</div>
              <div><strong>仓库：</strong>{modal.item?.warehouse_name}</div>
              <div><strong>领料人：</strong>{modal.item?.operator || '-'}</div>
              <div><strong>销售订单：</strong>{modal.item?.order_no || '-'}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} type="pick" /></div>
              <div><strong>备注：</strong>{modal.item?.remark || '-'}</div>
            </div>
            <div className="hidden md:block">
              <table className="w-full border">
                <thead className="bg-gray-50"><tr>
                  <th className="px-3 py-2 text-left text-xs">物料编码</th>
                  <th className="px-3 py-2 text-left text-xs">物料名称</th>
                  <th className="px-3 py-2 text-left text-xs">输入数量</th>
                  <th className="px-3 py-2 text-left text-xs">库存数量(公斤)</th>
                </tr></thead>
                <tbody>
                  {(modal.item?.items || []).map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-sm">{it.code}</td>
                      <td className="px-3 py-2 text-sm">{it.name}</td>
                      <td className="px-3 py-2 text-sm">{it.input_quantity || it.quantity} {it.input_unit || '公斤'}</td>
                      <td className="px-3 py-2 text-sm">{it.quantity} 公斤</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="block md:hidden space-y-2">
              {(modal.item?.items || []).map((it, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{it.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{it.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-800">{it.input_quantity || it.quantity} {it.input_unit || '公斤'}</div>
                      <div className="text-[10px] text-gray-400">{it.quantity} 公斤</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {modal.item?.status === 'pending' && (
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={closeModal} className="w-full sm:w-auto px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">关闭</button>
                <button type="button" onClick={async () => {
                  if (!await confirm('确认审批通过并扣减库存？')) return;
                  const res = await api.put(`/pick/${modal.item.id}/status`, { status: 'completed' }, { invalidate: ['inventory'] });
                  if (res.success) { closeModal(); load(); }
                  else window.__toast?.error(res.message || '审批失败');
                }} className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"><i className="fas fa-check mr-2"></i>审批领料</button>
              </div>
            )}
            {modal.item?.status !== 'pending' && (
              <div className="pt-4 border-t space-y-2">
                {modal.item?.status === 'completed' && modal.item?.production_order_id && (
                  <NextStepActions actions={[
                    { icon: '🔧', label: '去车间报工', path: '/process/hub', onClick: closeModal },
                  ]} title="领料已完成" />
                )}
                <div className="flex justify-end">
                  <button type="button" onClick={closeModal} className="w-full sm:w-auto px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">关闭</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <PickFormModal 
            ref={formRef}
            isOpen={true}
            onClose={closeModal}
            mode={modal.mode}
            pickType={modal.type || 'pick'}
            initialData={
              modal.mode === 'create' 
                ? { type: modal.type || 'pick', pick_type: modal.pick_type || 'normal', items: modal.items, boundMaterialIds: modal.boundMaterialIds, order_id: modal.item?.order_id, production_order_id: modal.item?.production_order_id || modal.selectedPoId } 
                : modal.item
            }
            onSuccess={() => { closeModal(); load(); }}
            warehouses={warehouses}
            materials={materials}
            semiProducts={semiProducts}
            productionOrders={productionOrders}
            boundMaterialIds={modal.boundMaterialIds}
          />
        )}
      </Modal>
    </div>
  );
};

const ProductionOrderManager = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [confirm, ConfirmDialog] = useConfirm();
  const [data, setData] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, mode: 'list' });
  const [viewTab, setViewTab] = useState('detail');
  
  const processNames = { 
    ROLLING: '轧机', STRAIGHTENING: '校直', POLISHING: '抛光', CORRECTING: '矫直', CUTTING: '切割',
    DRAWING: '拉拔', CLEANING: '清洗', WIRE_CUTTING: '线切割', LASER_CUTTING: '激光切割', HEAT_TREATMENT: '热处理'
  };
  
  const load = async () => {
    const [prodRes, orderRes, productRes, procRes] = await Promise.all([
      api.get('/production'),
      api.get('/orders?status=pending,confirmed,processing&pageSize=1000'),
      api.get('/products?category=成品&pageSize=1000'),
      api.get('/production/processes'),
    ]);
    if (prodRes.success) setData(prodRes.data);
    if (orderRes.success) setOrders(orderRes.data);
    if (productRes.success) setProducts(productRes.data);
    if (procRes.success) setProcesses(procRes.data);
  };
  useEffect(() => { load(); }, []);
  
  const openView = async (item) => {
    const res = await api.get(`/production/${item.id}`);
    setViewTab('detail');
    setModal({ open: true, item: res.data, mode: 'view' });
  };
  
  const openCreate = () => {
    setModal({ open: true, item: null, mode: 'create' });
  };
  
  const openEdit = (item) => {
    setModal({ open: true, item, mode: 'edit' });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, mode: 'list' });
  };

  // 智能下一步跳转 actions
  const productionNextActions = useMemo(() => {
    if (modal.mode !== 'view') return [];
    const acts = [];
    const st = modal.item?.status;
    const hasPick = modal.item?.pickOrders?.length > 0;
    const pickDone = hasPick && modal.item.pickOrders.some(p => p.status === 'completed');
    const hasOutsource = modal.item?.outsourceOrders?.length > 0;
    
    if (st === 'pending' || st === 'processing') {
      if (!hasPick || !pickDone) acts.push({ icon: '📦', label: '去领料', path: '/production/pick' });
      if (pickDone) acts.push({ icon: '🔧', label: '去车间报工', path: '/process/hub' });
      if (hasOutsource) acts.push({ icon: '🚚', label: '查看委外进度', path: '/outsourcing' });
    }
    if (st === 'completed') {
      acts.push({ icon: '🔍', label: '去检验', path: '/inspection' });
      acts.push({ icon: '📥', label: '查看入库', path: '/warehouse/inbound' });
    }
    return acts.map(a => ({ ...a, onClick: closeModal }));
  }, [modal.mode, modal.item?.status, modal.item?.pickOrders, modal.item?.outsourceOrders]);
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const orderId = fd.get('order_id');
    
    // 验证必须选择销售订单
    if (!orderId) {
      window.__toast?.warning('请选择关联的销售订单！');
      return;
    }
    
    const obj = { 
      order_id: orderId, 
      product_id: fd.get('product_id'), 
      quantity: parseInt(fd.get('quantity')), 
      operator: fd.get('operator'), 
      start_time: fd.get('start_time') || null,
      end_time: fd.get('end_time') || null,
      remark: fd.get('remark') 
    };
    const res = modal.item ? await api.put(`/production/${modal.item.id}`, obj, { invalidate: ['orders'] }) : await api.post('/production', obj, { invalidate: ['orders'] });
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    // 如果非待处理状态，管理员可以强制删除
    if (item.status !== 'pending') {
      if (!isAdmin) {
        window.__toast?.warning('只能删除待处理状态的工单，如需删除请联系管理员');
        return;
      }
      if (!await confirm('⚠️ 警告：此工单已开始处理！\n\n此操作不可恢复。\n\n确定要强制删除吗？')) return;
      const res = await api.del(`/production/${item.id}?force=true`);
      if (res.success) load();
      else window.__toast?.error(res.message);
      return;
    }
    
    if (!await confirm('确定删除该生产工单？此操作不可恢复。')) return;
    const res = await api.del(`/production/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const updateStatus = async (item, status) => {
    const res = await api.put(`/production/${item.id}/status`, { status }, { invalidate: ['orders'] });
    if (res.success) load();
    else window.__toast?.error(res.message);
  };
  
  const syncProcess = async (id) => {
    if (!await confirm('确定要从产品同步最新的工序流程吗？\n\n如果产品工序已修改，将覆盖当前工单进度（仅限尚未开始报工的工单）。')) return;
    const res = await api.post(`/production/${id}/sync-processes`, {}, { invalidate: ['production'] });
    if (res.success) {
      window.__toast?.success('同步成功');
      load();
      // 更新当前打开的 modal
      const newDetail = await api.get(`/production/${id}`);
      setModal(prev => ({ ...prev, item: newDetail.data }));
    } else {
      window.__toast?.error(res.message);
    }
  };
  
  // 获取产品单位
  const getProductUnit = (productId) => {
    const product = products.find(p => String(p.id) === String(productId));
    return product?.unit || '件';
  };
  
  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">生产工单管理</h2>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增工单</button>
      </div>
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'order_no', title: '生产工单' },
          { key: 'order_id', title: '销售订单', render: (v, row) => row.ref_order_no || '-' },
          { key: 'product_name', title: '产品' },
          { key: 'quantity', title: '计划数量', render: (v, row) => `${v} ${row.unit || '件'}` },
          { key: 'completed_quantity', title: '完成数量', render: (v, row) => `${v || 0} ${row.unit || '件'}` },
          { key: 'current_process', title: '当前工序', render: v => processNames[v] || v || '-' },
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} /> },
          { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
        ]} data={data} onView={openView} onEdit={openEdit} onDelete={del} editPermission="production_edit" deletePermission="production_delete" />
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'view' ? '生产工单详情' : modal.mode === 'edit' ? '编辑生产工单' : '新增生产工单'} size="max-w-3xl">
        {modal.mode === 'view' ? (
          <div className="space-y-4">
            {/* Tab 切换 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
              <button onClick={() => setViewTab('detail')} className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewTab === 'detail' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><i className="fas fa-info-circle mr-1"></i>工单详情</button>
              <button onClick={() => setViewTab('tracking')} className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewTab === 'tracking' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><i className="fas fa-chart-line mr-1"></i>生产追踪</button>
            </div>
            {viewTab === 'tracking' ? (
              <ProductionTrackingPanel productionId={modal.item?.id} />
            ) : (<>
            <div className="grid grid-cols-3 gap-4 text-sm bg-gray-50 p-3 rounded-lg">
              <div><strong>生产工单：</strong>{modal.item?.order_no}</div>
              <div><strong>产品：</strong>{modal.item?.product_name}</div>
              <div><strong>计划数量：</strong>{modal.item?.quantity} {modal.item?.unit || '件'}</div>
              <div><strong>完成数量：</strong>{modal.item?.completed_quantity || 0} {modal.item?.unit || '件'}</div>
              <div><strong>状态：</strong><StatusBadge status={modal.item?.status} /></div>
              <div><strong>当前工序：</strong>{processNames[modal.item?.current_process] || modal.item?.current_process || '-'}</div>
            </div>
            <div>
              <h4 className="font-medium mb-2">工序流程进度</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs">工序</th>
                      <th className="px-3 py-2 text-left text-xs">操作员</th>
                      <th className="px-3 py-2 text-left text-xs">投入</th>
                      <th className="px-3 py-2 text-left text-xs">产出</th>
                      <th className="px-3 py-2 text-left text-xs">不良</th>
                      <th className="px-3 py-2 text-left text-xs">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modal.item?.processRecords || []).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-sm">{r.process_name}</td>
                        <td className="px-3 py-2 text-sm">{r.operator || '-'}</td>
                        <td className="px-3 py-2 text-sm">{r.input_quantity || 0} {modal.item?.unit || '件'}</td>
                        <td className="px-3 py-2 text-sm">{r.output_quantity || 0} {modal.item?.unit || '件'}</td>
                        <td className="px-3 py-2 text-sm">{r.defect_quantity || 0} {modal.item?.unit || '件'}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${r.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {r.status === 'completed' ? '已完成' : '待处理'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {(!modal.item?.processRecords || modal.item?.processRecords.length === 0) && (
                      <tr><td colSpan="6" className="px-3 py-4 text-center text-gray-500">
                        该产品未配置工序流程，请在产品管理中设置
                        <button type="button" onClick={() => syncProcess(modal.item.id)} className="ml-4 text-teal-600 hover:underline"><i className="fas fa-sync-alt mr-1"></i>尝试同步最新工序</button>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* 关联的委外加工单 */}
            {modal.item?.outsourcingOrders && modal.item.outsourcingOrders.length > 0 && (
              <div>
                <h4 className="font-medium mb-2"><i className="fas fa-handshake mr-2 text-orange-500"></i>关联委外加工单</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-orange-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs">委外单号</th>
                        <th className="px-3 py-2 text-left text-xs">工序</th>
                        <th className="px-3 py-2 text-left text-xs">供应商</th>
                        <th className="px-3 py-2 text-left text-xs">状态</th>
                        <th className="px-3 py-2 text-left text-xs">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modal.item.outsourcingOrders.map((o, i) => (
                        <tr key={i} className="border-t hover:bg-orange-50 cursor-pointer" onClick={() => { closeModal(); navigate('/outsourcing'); }}>
                          <td className="px-3 py-2 text-sm font-medium text-orange-600">{o.order_no} <i className="fas fa-external-link-alt text-xs ml-1"></i></td>
                          <td className="px-3 py-2 text-sm">{o.process_name || '-'}</td>
                          <td className="px-3 py-2 text-sm">{o.supplier_name || '-'}</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              o.status === 'completed' ? 'bg-green-100 text-green-800' : 
                              o.status === 'processing' ? 'bg-blue-100 text-blue-800' : 
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {o.status === 'completed' ? '已完成' : o.status === 'processing' ? '进行中' : '待处理'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm">{o.created_at?.slice(0, 10) || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* 关联的入库单 */}
            {modal.item?.inboundOrders && modal.item.inboundOrders.length > 0 && (
              <div>
                <h4 className="font-medium mb-2"><i className="fas fa-boxes mr-2 text-green-500"></i>关联入库单</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs">入库单号</th>
                        <th className="px-3 py-2 text-left text-xs">仓库</th>
                        <th className="px-3 py-2 text-left text-xs">状态</th>
                        <th className="px-3 py-2 text-left text-xs">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modal.item.inboundOrders.map((io, i) => (
                        <tr key={i} className="border-t hover:bg-green-50 cursor-pointer" onClick={() => { closeModal(); navigate('/warehouse/inbound'); }}>
                          <td className="px-3 py-2 text-sm font-medium text-green-600">{io.order_no} <i className="fas fa-external-link-alt text-xs ml-1"></i></td>
                          <td className="px-3 py-2 text-sm">{io.warehouse_name || '-'}</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              io.status === 'approved' ? 'bg-green-100 text-green-800' : 
                              io.status === 'completed' ? 'bg-green-100 text-green-800' : 
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {io.status === 'approved' ? '已入库' : io.status === 'completed' ? '已完成' : '待审批'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm">{io.created_at?.slice(0, 10) || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* 顶层操作区 - 扫码打印/进站报工 */}
            {modal.item?.order_no && (
              <div className="mt-6 flex justify-between items-center border-t border-gray-100 pt-4">
                <button type="button" onClick={() => doPrint('production', modal.item)} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-bold flex items-center">
                  <i className="fas fa-print mr-2"></i>打印生产派工流转卡
                </button>
                <PrintableQRCode value={modal.item.order_no} label="扫码进入报工终端" />
              </div>
            )}
            
            {/* 智能下一步跳转 */}
            <NextStepActions actions={productionNextActions} />
            
            </>)}
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">关联销售订单 * <span className="text-gray-400 text-xs">(必选)</span></label>
                <select name="order_id" className="w-full border rounded-lg px-3 py-2" required defaultValue={modal.item?.order_id || ''}>
                  <option value="">请选择销售订单</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} - {o.customer_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">产品 *</label>
                <select name="product_id" className="w-full border rounded-lg px-3 py-2" required defaultValue={modal.item?.product_id || ''}>
                  <option value="">请选择</option>
                  {products.map(p => {
                    const prefix = p.customers?.length ? `[${p.customers.map(c => c.customer_name).join('/')}] ` : '';
                    return <option key={p.id} value={p.id}>{prefix}{p.name} ({p.code}) - {p.unit}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">计划数量 *</label>
                <input name="quantity" type="number" className="w-full border rounded-lg px-3 py-2" required defaultValue={modal.item?.quantity || ''} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">操作员</label>
                <OperatorSelect defaultValue={modal.item?.operator || ''} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">计划开始时间</label>
                <input type="datetime-local" name="start_time" className="w-full border rounded-lg px-3 py-2" defaultValue={modal.item?.start_time ? new Date(new Date(modal.item.start_time).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">计划结束时间</label>
                <input type="datetime-local" name="end_time" className="w-full border rounded-lg px-3 py-2" defaultValue={modal.item?.end_time ? new Date(new Date(modal.item.end_time).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">备注</label>
              <textarea name="remark" className="w-full border rounded-lg px-3 py-2" rows="2" defaultValue={modal.item?.remark || ''}></textarea>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">{modal.item ? '保存修改' : '创建工单'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

const ProductionScheduleGantt = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState('active'); // active|all|completed
  const [hoveredOrder, setHoveredOrder] = useState(null);
  
  const load = () => {
    setLoading(true);
    api.get('/production').then(res => {
      if (res.success) setData(res.data || []);
      setLoading(false);
    });
  };
  
  useEffect(() => { load(); }, []);
  
  if (loading) return <div className="text-center p-10"><i className="fas fa-spinner fa-spin text-3xl text-teal-500"></i></div>;

  // 按状态过滤
  const filteredData = data.filter(o => {
    if (statusFilter === 'active') return o.status !== 'completed' && o.status !== 'cancelled';
    if (statusFilter === 'completed') return o.status === 'completed';
    return true;
  });

  if (filteredData.length === 0) return (
    <div className="fade-in">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <h2 className="text-xl font-bold">APS 全局生产排程推演板</h2>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border rounded px-2 py-1">
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="all">全部</option>
          </select>
        </div>
      </div>
      <div className="text-center p-10 bg-white rounded-xl shadow mt-4 text-gray-500">暂无工单记录</div>
    </div>
  );
  
  const now = new Date().getTime();
  const sortedData = [...filteredData].sort((a, b) => {
    const tA = a.start_time ? new Date(a.start_time).getTime() : new Date(a.created_at).getTime();
    const tB = b.start_time ? new Date(b.start_time).getTime() : new Date(b.created_at).getTime();
    return tA - tB;
  });

  let minDate, maxDate;
  if (dateRange.start && dateRange.end) {
    minDate = new Date(dateRange.start).getTime();
    maxDate = new Date(dateRange.end).getTime() + 24 * 3600 * 1000;
  } else {
    minDate = now; maxDate = now + 7 * 24 * 3600 * 1000;
    sortedData.forEach(o => {
      const sT = o.start_time ? new Date(o.start_time).getTime() : new Date(o.created_at).getTime();
      if (sT) minDate = Math.min(minDate, sT);
      if (o.end_time) maxDate = Math.max(maxDate, new Date(o.end_time).getTime());
    });
    minDate -= 3 * 24 * 3600 * 1000;
    maxDate += 3 * 24 * 3600 * 1000;
  }
  
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (24 * 3600 * 1000)));
  const dayWidth = 60;
  const days = Array.from({ length: totalDays }, (_, i) => new Date(minDate + i * 24 * 3600 * 1000));

  const quickRanges = [
    { label: '本周', getDates: () => { const d = new Date(); const mon = new Date(d); mon.setDate(d.getDate()-d.getDay()+1); const sun = new Date(mon); sun.setDate(mon.getDate()+6); return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10) }; }},
    { label: '本月', getDates: () => { const d = new Date(); return { start: d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01', end: new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10) }; }},
    { label: '未来2周', getDates: () => { const d = new Date(); const e = new Date(); e.setDate(e.getDate()+14); return { start: d.toISOString().slice(0,10), end: e.toISOString().slice(0,10) }; }},
    { label: '全部', getDates: () => ({ start: '', end: '' }) },
  ];

  const statusColors = {
    processing: { bar: 'from-teal-500 to-cyan-500', progress: 'bg-teal-300/40' },
    pending:    { bar: 'from-gray-400 to-gray-500', progress: 'bg-gray-300/40' },
    completed:  { bar: 'from-green-500 to-emerald-500', progress: 'bg-green-300/40' },
    cancelled:  { bar: 'from-red-400 to-red-500', progress: 'bg-red-300/40' },
  };

  return (
    <div className="fade-in">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <h2 className="text-xl font-bold">APS 全局生产排程推演板</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border rounded px-2 py-1">
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="all">全部</option>
          </select>
          {quickRanges.map(r => (
            <button key={r.label} onClick={() => setDateRange(r.getDates())}
              className="text-xs px-3 py-1 border border-teal-300 text-teal-700 rounded-full hover:bg-teal-50 transition-colors">
              {r.label}
            </button>
          ))}
          <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} className="text-xs border rounded px-2 py-1" />
          <span className="text-gray-400 text-xs">～</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} className="text-xs border rounded px-2 py-1" />
          <button onClick={load} className="text-teal-600 hover:text-teal-800 text-sm"><i className="fas fa-sync-alt mr-1"></i>刷新</button>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100 flex relative">
        <div className="w-64 border-r border-gray-200 bg-white z-20 relative flex-shrink-0">
          <div className="h-12 border-b border-gray-200 bg-gray-50 flex items-center px-4 font-bold text-gray-700 text-sm">生产工单</div>
          <div>
            {sortedData.map(order => {
              const progress = order.quantity > 0 ? Math.min(100, Math.round((order.completed_quantity || 0) / order.quantity * 100)) : 0;
              return (
                <div key={order.id} className="h-14 border-b border-gray-100 flex items-center px-4 hover:bg-teal-50 cursor-pointer group gap-3"
                  onMouseEnter={() => setHoveredOrder(order.id)} onMouseLeave={() => setHoveredOrder(null)}>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-gray-800 truncate group-hover:text-teal-700 block">{order.order_no}</span>
                    <span className="text-xs text-gray-500 truncate block">{order.product_name}</span>
                  </div>
                  <span className={`text-xs font-bold ${progress === 100 ? 'text-green-600' : progress > 0 ? 'text-teal-600' : 'text-gray-400'}`}>{progress}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto flex-1">
          <div style={{ minWidth: `${totalDays * dayWidth}px` }}>
            <div className="h-12 border-b border-gray-200 flex sticky top-0 bg-gray-50 z-10">
              {days.map((d, i) => {
                const isToday = new Date().toDateString() === d.toDateString();
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-200 ${isToday ? "bg-teal-100 font-bold" : isWeekend ? "bg-gray-100/50" : ""}`} style={{ width: `${dayWidth}px` }}>
                    <span className="text-xs">{d.getMonth()+1}-{d.getDate()}</span>
                    <span className={`text-[10px] ${isWeekend ? 'text-red-400' : 'opacity-70'}`}>周{['日','一','二','三','四','五','六'][d.getDay()]}</span>
                  </div>
                );
              })}
            </div>
            <div className="relative">
              <div className="absolute top-0 border-l-2 border-red-400 z-10 pointer-events-none" style={{ left: `${(now - minDate) / (24*3600*1000) * dayWidth}px`, height: `${sortedData.length * 56}px` }}>
                <div className="absolute -left-3 -top-2 bg-red-400 text-white text-[10px] px-1 rounded">今日</div>
              </div>
              {sortedData.map(order => {
                const sT = order.start_time ? new Date(order.start_time).getTime() : new Date(order.created_at).getTime();
                let eT = order.end_time ? new Date(order.end_time).getTime() : sT + 3*24*3600*1000;
                if (eT < sT) eT = sT + 24*3600*1000;
                const left = (sT - minDate) / (24*3600*1000) * dayWidth;
                const width = Math.max((eT - sT) / (24*3600*1000) * dayWidth, 30);
                const progress = order.quantity > 0 ? Math.min(100, (order.completed_quantity || 0) / order.quantity * 100) : 0;
                const colors = statusColors[order.status] || statusColors.pending;
                const isHovered = hoveredOrder === order.id;
                return (
                  <div key={order.id} className="h-14 border-b border-transparent relative flex items-center"
                    onMouseEnter={() => setHoveredOrder(order.id)} onMouseLeave={() => setHoveredOrder(null)}>
                    <div className={`absolute h-8 rounded-md shadow-sm overflow-hidden flex items-center text-xs text-white font-medium cursor-pointer transition-all ${isHovered ? '-translate-y-0.5 shadow-md' : ''}`}
                      style={{ left: `${left}px`, width: `${width}px` }}>
                      {/* 背景渐变 */}
                      <div className={`absolute inset-0 bg-gradient-to-r ${colors.bar}`}></div>
                      {/* 进度条 */}
                      {progress > 0 && progress < 100 && (
                        <div className={`absolute inset-y-0 left-0 ${colors.progress}`} style={{ width: `${progress}%` }}></div>
                      )}
                      <span className="relative truncate px-3 z-10">{order.quantity} {order.unit||'件'} - {order.operator||'未派工'}</span>
                    </div>
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute z-30 bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs max-w-xs pointer-events-none"
                        style={{ left: `${left + width / 2}px`, top: '-8px', transform: 'translateX(-50%) translateY(-100%)' }}>
                        <div className="font-bold mb-1">{order.order_no}</div>
                        <div>产品: {order.product_name}</div>
                        {order.customer_name && <div>客户: {order.customer_name}</div>}
                        <div>进度: {order.completed_quantity || 0}/{order.quantity} ({Math.round(progress)}%)</div>
                        {order.current_process && <div>工序: {order.current_process}</div>}
                        <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-gray-900 transform -translate-x-1/2 rotate-45"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-4 text-sm text-gray-500 justify-end flex-wrap">
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gradient-to-r from-teal-500 to-cyan-500"></div> 生产中</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gradient-to-r from-gray-400 to-gray-500"></div> 待处理</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gradient-to-r from-green-500 to-emerald-500"></div> 已完成</div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gradient-to-r from-red-400 to-red-500"></div> 已取消</div>
      </div>
    </div>
  );
};

export { PickMaterialManager, ProductionOrderManager, ProductionScheduleGantt };
