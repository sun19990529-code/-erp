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
import InspectionFormFields from '../components/InspectionFormFields';

const InboundInspection = () => {
  const [data, setData] = useState([]);
  const [inbounds, setInbounds] = useState([]);
  const [inspectedProducts, setInspectedProducts] = useState({}); // 记录已检验的产品
  const [selectedInbound, setSelectedInbound] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  
  const load = () => {
    api.get('/inspection/inbound').then(res => {
      if (res.success) {
        setData(res.data);
        // 构建已检验产品的映射
        const inspected = {};
        res.data.forEach(item => {
          const key = `${item.inbound_id}_${item.product_id}`;
          inspected[key] = item;
        });
        setInspectedProducts(inspected);
      }
    });
    api.get('/inbound?status=pending_inspection').then(res => res.success && setInbounds(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const handleSelectInbound = async (inboundId) => {
    if (!inboundId) {
      setSelectedInbound(null);
      setSelectedProduct(null);
      return;
    }
    const res = await api.get(`/inbound/${inboundId}`);
    if (res.success) {
      setSelectedInbound(res.data);
      setSelectedProduct(null);
    }
  };
  
  const handleSelectProduct = (productId) => {
    if (!productId || !selectedInbound?.items) {
      setSelectedProduct(null);
      return;
    }
    const product = selectedInbound.items.find(p => p.product_id == productId);
    setSelectedProduct(product || null);
  };
  
  const isProductInspected = (inboundId, productId) => {
    return inspectedProducts[`${inboundId}_${productId}`];
  };

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const quantity = parseInt(fd.get('quantity')) || 0;
    const pass_quantity = parseInt(fd.get('pass_quantity')) || 0;
    const fail_quantity = parseInt(fd.get('fail_quantity')) || 0;
    
    if (pass_quantity + fail_quantity > quantity) {
      window.__toast?.warning('合格数量 + 不合格数量不能超过检验数量');
      return;
    }
    
    const obj = { 
      inbound_order_id: fd.get('inbound_id'), 
      product_id: fd.get('product_id'), 
      quantity, 
      pass_quantity, 
      fail_quantity, 
      inspector: fd.get('inspector'), 
      result: fd.get('result'), 
      remark: fd.get('remark') 
    };
    const res = await api.post('/inspection/inbound', obj);
    if (res.success) { 
      setModal({ open: false, item: null }); 
      setSelectedInbound(null);
      setSelectedProduct(null);
      load(); 
    }
    else window.__toast?.error(res.message);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">入库检验</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增检验</button>
      </div>
      <div className="bg-white rounded-xl shadow mb-4">
        <div className="p-4 border-b bg-orange-50">
          <h3 className="font-bold text-orange-800"><i className="fas fa-clipboard-list mr-2"></i>待检验入库单 ({inbounds.length})</h3>
        </div>
        {inbounds.length > 0 && (
          <div className="overflow-x-auto">
            {inbounds.map(i => (
              <div key={i.id} className="border-b last:border-b-0">
                <div className="p-3 bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100" 
                  onClick={() => { setModal({ open: true, item: null }); handleSelectInbound(i.id); }}>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm">{i.order_no}</span>
                    <span className="text-xs text-gray-500">{i.type === 'raw' ? '原材料' : i.type === 'semi' ? '半成品' : '成品'}</span>
                    <span className="text-sm">{i.warehouse_name}</span>
                    <span className="text-sm text-gray-500">{i.supplier_name || '-'}</span>
                  </div>
                  <button className="text-teal-600 hover:text-teal-800 text-sm">
                    <i className="fas fa-clipboard-check mr-1"></i>检验
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {inbounds.length === 0 && (
          <div className="p-8 text-center text-gray-500">暂无待检验的入库单</div>
        )}
      </div>
      <div className="bg-white rounded-xl shadow">
        <div className="p-4 border-b">
          <h3 className="font-bold">检验记录</h3>
        </div>
        <Table columns={[
          { key: 'inspection_no', title: '检验单号' }, { key: 'inbound_no', title: '入库单号' }, { key: 'product_name', title: '产品' },
          { key: 'quantity', title: '检验数量' }, { key: 'pass_quantity', title: '合格' }, { key: 'fail_quantity', title: '不合格' },
          { key: 'result', title: '结果', render: v => v === 'pass' ? <span className="text-green-600">合格</span> : v === 'fail' ? <span className="text-red-600">不合格</span> : '-' },
          { key: 'inspector', title: '检验员' }
        ]} data={data} />
      </div>
      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false, item: null }); setSelectedInbound(null); }} title="新增入库检验" size="max-w-3xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">入库单 *</label>
              <select name="inbound_id" className="w-full border rounded-lg px-3 py-2" required 
                value={selectedInbound?.id || ''} 
                onChange={(e) => handleSelectInbound(e.target.value)}>
                <option value="">选择入库单</option>
                {inbounds.map(i => <option key={i.id} value={i.id}>{i.order_no} - {i.warehouse_name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">产品 *</label>
              <select name="product_id" className="w-full border rounded-lg px-3 py-2" required
                value={selectedProduct?.product_id || ''}
                onChange={(e) => handleSelectProduct(e.target.value)}>
                <option value="">选择产品</option>
                {selectedInbound?.items?.map(p => {
                  const inspected = isProductInspected(selectedInbound.id, p.product_id);
                  return (
                    <option key={p.product_id} value={p.product_id} disabled={inspected}>
                      {p.name} ({p.quantity}{p.unit}) {inspected ? '✓ 已检验' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {selectedInbound && (
            <div className="bg-gray-50 p-3 rounded-lg space-y-1">
              <div className="text-sm"><strong>入库单号：</strong>{selectedInbound.order_no}</div>
              <div className="text-sm"><strong>仓库：</strong>{selectedInbound.warehouse_name}</div>
              <div className="text-sm"><strong>供应商：</strong>{selectedInbound.supplier_name || '-'}</div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-sm font-medium mb-1">产品清单：</div>
                <div className="flex flex-wrap gap-2">
                  {selectedInbound.items?.map(p => {
                    const inspected = isProductInspected(selectedInbound.id, p.product_id);
                    return (
                      <span key={p.product_id} className={`px-2 py-1 rounded text-xs ${inspected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {p.name} ({p.quantity}{p.unit}) {inspected ? '✓' : '待检'}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <InspectionFormFields
            quantityLabel={selectedProduct ? `(入库: ${selectedProduct.quantity}${selectedProduct.unit})` : ''}
            defaultQuantity={selectedProduct?.quantity}
            infoText='检验合格后将自动更新库存。入库单内所有产品检验完成后，状态变更为"已入库"'
          />
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => { setModal({ open: false, item: null }); setSelectedInbound(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交检验</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const PatrolInspection = () => {
  const [data, setData] = useState([]);
  const [productions, setProductions] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });
  
  const load = () => {
    api.get('/inspection/patrol').then(res => res.success && setData(res.data));
    api.get('/production?status=processing').then(res => res.success && setProductions(res.data));
    api.get('/processes').then(res => res.success && setProcesses(res.data));
    api.get('/products').then(res => res.success && setProducts(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = { production_order_id: fd.get('production_order_id') || null, process_id: fd.get('process_id') || null, product_id: fd.get('product_id') || null, inspector: fd.get('inspector'), result: fd.get('result'), defect_count: parseInt(fd.get('defect_count')) || 0, remark: fd.get('remark') };
    const res = await api.post('/inspection/patrol', obj);
    if (res.success) { setModal({ open: false, item: null }); load(); }
    else window.__toast?.error(res.message);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">巡检</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增巡检</button>
      </div>
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'inspection_no', title: '检验单号' }, { key: 'production_order_no', title: '生产工单' }, { key: 'process_name', title: '工序' },
          { key: 'product_name', title: '产品' }, { key: 'result', title: '结果', render: v => v === 'pass' ? <span className="text-green-600">合格</span> : v === 'fail' ? <span className="text-red-600">不合格</span> : '-' },
          { key: 'defect_count', title: '不良数' }, { key: 'inspector', title: '检验员' }
        ]} data={data} />
      </div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title="新增巡检">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">生产工单</label>
              <select name="production_order_id" className="w-full border rounded-lg px-3 py-2">
                <option value="">选择工单</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.order_no}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">工序</label>
              <select name="process_id" className="w-full border rounded-lg px-3 py-2">
                <option value="">选择工序</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">产品</label>
              <select name="product_id" className="w-full border rounded-lg px-3 py-2">
                <option value="">选择产品</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">检验结果</label>
              <select name="result" className="w-full border rounded-lg px-3 py-2">
                <option value="pass">合格</option><option value="fail">不合格</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">不良数量</label><input name="defect_count" type="number" className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="block text-sm font-medium mb-1">检验员</label><input name="inspector" className="w-full border rounded-lg px-3 py-2" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const OutsourcingInspection = () => {
  const [data, setData] = useState([]);
  const [outsourcings, setOutsourcings] = useState([]);
  const [selectedOutsourcing, setSelectedOutsourcing] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  
  const load = () => {
    api.get('/inspection/outsourcing').then(res => res.success && setData(res.data));
    api.get('/outsourcing?status=processing').then(res => res.success && setOutsourcings(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const handleSelectOutsourcing = async (outsourcingId) => {
    if (!outsourcingId) {
      setSelectedOutsourcing(null);
      setSelectedProduct(null);
      return;
    }
    const res = await api.get(`/outsourcing/${outsourcingId}`);
    if (res.success) {
      setSelectedOutsourcing(res.data);
      setSelectedProduct(null);
    }
  };
  
  const handleSelectProduct = (productId) => {
    if (!productId || !selectedOutsourcing?.items) {
      setSelectedProduct(null);
      return;
    }
    const product = selectedOutsourcing.items.find(p => p.product_id == productId);
    setSelectedProduct(product || null);
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const quantity = parseInt(fd.get('quantity')) || 0;
    const pass_quantity = parseInt(fd.get('pass_quantity')) || 0;
    const fail_quantity = parseInt(fd.get('fail_quantity')) || 0;
    
    if (pass_quantity + fail_quantity > quantity) {
      window.__toast?.warning('合格数量 + 不合格数量不能超过检验数量');
      return;
    }
    
    const obj = { outsourcing_order_id: fd.get('outsourcing_id'), product_id: fd.get('product_id'), quantity, pass_quantity, fail_quantity, inspector: fd.get('inspector'), result: fd.get('result'), remark: fd.get('remark') };
    const res = await api.post('/inspection/outsourcing', obj);
    if (res.success) { setModal({ open: false, item: null }); setSelectedOutsourcing(null); setSelectedProduct(null); load(); }
    else window.__toast?.error(res.message);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">委外加工检验</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增检验</button>
      </div>
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'inspection_no', title: '检验单号' }, { key: 'outsourcing_no', title: '委外单号' }, { key: 'product_name', title: '产品' },
          { key: 'quantity', title: '检验数量' }, { key: 'pass_quantity', title: '合格' }, { key: 'fail_quantity', title: '不合格' },
          { key: 'result', title: '结果', render: v => v === 'pass' ? <span className="text-green-600">合格</span> : <span className="text-red-600">不合格</span> },
          { key: 'inspector', title: '检验员' }
        ]} data={data} />
      </div>
      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false, item: null }); setSelectedOutsourcing(null); setSelectedProduct(null); }} title="新增委外加工检验">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">委外单号 *</label>
              <select name="outsourcing_id" className="w-full border rounded-lg px-3 py-2" required
                value={selectedOutsourcing?.id || ''}
                onChange={(e) => handleSelectOutsourcing(e.target.value)}>
                <option value="">选择委外单</option>
                {outsourcings.map(o => <option key={o.id} value={o.id}>{o.order_no} - {o.supplier_name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">产品 *</label>
              <select name="product_id" className="w-full border rounded-lg px-3 py-2" required
                value={selectedProduct?.product_id || ''}
                onChange={(e) => handleSelectProduct(e.target.value)}>
                <option value="">选择产品</option>
                {selectedOutsourcing?.items?.map(p => <option key={p.product_id} value={p.product_id}>{p.name} ({p.quantity}{p.unit})</option>)}
              </select>
            </div>
          </div>
          {selectedOutsourcing && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm"><strong>委外单号：</strong>{selectedOutsourcing.order_no}</div>
              <div className="text-sm"><strong>供应商：</strong>{selectedOutsourcing.supplier_name}</div>
            </div>
          )}
          <InspectionFormFields
            quantityLabel={selectedProduct ? `(委外: ${selectedProduct.quantity}${selectedProduct.unit})` : ''}
            defaultQuantity={selectedProduct?.quantity}
            infoText="检验合格后将自动创建入库单并更新库存（根据产品类型自动选择仓库）"
          />
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => { setModal({ open: false, item: null }); setSelectedOutsourcing(null); setSelectedProduct(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交检验</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const FinalInspection = () => {
  const [data, setData] = useState([]);
  const [productions, setProductions] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduction, setSelectedProduction] = useState(null);
  const [modal, setModal] = useState({ open: false, item: null });
  
  const load = () => {
    api.get('/inspection/final').then(res => res.success && setData(res.data));
    api.get('/production?status=processing').then(res => res.success && setProductions(res.data));
    api.get('/products?category=成品').then(res => res.success && setProducts(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const handleSelectProduction = async (productionId) => {
    if (!productionId) {
      setSelectedProduction(null);
      return;
    }
    const res = await api.get(`/production/${productionId}`);
    if (res.success) {
      setSelectedProduction(res.data);
    }
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const quantity = parseInt(fd.get('quantity')) || 0;
    const pass_quantity = parseInt(fd.get('pass_quantity')) || 0;
    const fail_quantity = parseInt(fd.get('fail_quantity')) || 0;
    
    if (pass_quantity + fail_quantity > quantity) {
      window.__toast?.warning('合格数量 + 不合格数量不能超过检验数量');
      return;
    }
    
    const obj = { production_order_id: fd.get('production_order_id') || null, product_id: fd.get('product_id'), quantity, pass_quantity, fail_quantity, inspector: fd.get('inspector'), result: fd.get('result'), remark: fd.get('remark') };
    const res = await api.post('/inspection/final', obj);
    if (res.success) { setModal({ open: false, item: null }); setSelectedProduction(null); load(); }
    else window.__toast?.error(res.message);
  };
  
  const selectedProduct = selectedProduction ? products.find(p => p.id == selectedProduction.product_id) : null;

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">成品检验</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增检验</button>
      </div>
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'inspection_no', title: '检验单号' }, { key: 'production_order_no', title: '生产工单' }, { key: 'product_name', title: '产品' },
          { key: 'quantity', title: '检验数量' }, { key: 'pass_quantity', title: '合格' }, { key: 'fail_quantity', title: '不合格' },
          { key: 'result', title: '结果', render: v => v === 'pass' ? <span className="text-green-600">合格</span> : <span className="text-red-600">不合格</span> },
          { key: 'inspector', title: '检验员' }
        ]} data={data} />
      </div>
      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false, item: null }); setSelectedProduction(null); }} title="新增成品检验">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">生产工单</label>
              <select name="production_order_id" className="w-full border rounded-lg px-3 py-2"
                value={selectedProduction?.id || ''}
                onChange={(e) => handleSelectProduction(e.target.value)}>
                <option value="">选择工单</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.order_no} - {p.product_name}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">产品 *</label>
              <select name="product_id" className="w-full border rounded-lg px-3 py-2" required
                value={selectedProduction?.product_id || ''}>
                <option value="">选择产品</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          {selectedProduction && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm"><strong>工单号：</strong>{selectedProduction.order_no}</div>
              <div className="text-sm"><strong>产品：</strong>{selectedProduction.product_name} {selectedProduction.specification}</div>
              <div className="text-sm"><strong>生产数量：</strong>{selectedProduction.quantity}{selectedProduct?.unit || ''}</div>
            </div>
          )}
          <InspectionFormFields
            quantityLabel={selectedProduction ? `(生产: ${selectedProduction.quantity}${selectedProduct?.unit || ''})` : ''}
            defaultQuantity={selectedProduction?.quantity}
            infoText="检验合格后将自动创建入库单并更新成品库存"
          />
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => { setModal({ open: false, item: null }); setSelectedProduction(null); }} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交检验</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export { InboundInspection, PatrolInspection, OutsourcingInspection, FinalInspection };
