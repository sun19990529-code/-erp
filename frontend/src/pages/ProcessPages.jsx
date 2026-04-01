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
import ProcessConfigPanel from '../components/ProcessConfigPanel';
import OperatorSelect from '../components/OperatorSelect';

const ProcessConfigManager = () => {
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [modal, setModal] = useState({ open: false, product: null, productProcesses: [], boundMaterialIds: [] });
  
  const load = async () => {
    const [prodRes, procRes, rawRes, semiRes] = await Promise.all([
      api.get('/products?category=成品'),
      api.get('/production/processes'),
      api.get('/products?category=原材料'),
      api.get('/products?category=半成品'),
    ]);
    const finishedProducts = prodRes.success ? prodRes.data : [];
    setProducts(finishedProducts);
    if (procRes.success) setProcesses(procRes.data);
    setRawMaterials([
      ...(rawRes.success ? rawRes.data : []),
      ...(semiRes.success ? semiRes.data : []),
    ]);
    setAllProducts([
      ...(semiRes.success ? semiRes.data : []),
      ...finishedProducts,
    ]);
  };
  useEffect(() => { load(); }, []);
  
  const openConfig = async (product) => {
    const res = await api.get(`/products/${product.id}/processes`);
    const processesData = res.data || [];
    // 同时加载每个工序已绑定的物料
    const matRes = await api.get(`/products/${product.id}/process-materials`);
    const allMaterials = matRes.data || [];
    // 将物料按 process_id 分组，挂到对应工序上
    const enriched = processesData.map(p => {
      const mats = allMaterials.filter(m => m.process_id === p.process_id);
      return { ...p, materials: mats.length > 0 ? mats.map(m => ({ material_id: m.material_id, quantity: m.quantity, unit: m.unit || '公斤', remark: m.remark || '' })) : [] };
    });
    setModal({ open: true, product, productProcesses: enriched, boundMaterialIds: (product.bound_materials || []).map(m => m.material_id) });
  };
  
  const closeModal = () => {
    setModal({ open: false, product: null, productProcesses: [], boundMaterialIds: [] });
  };
  
  // 工序配置更新回调
  const handleProcessChange = (newProcesses) => {
    setModal({ ...modal, productProcesses: newProcesses });
  };
  
  const saveProcesses = async () => {
    const processesToSave = modal.productProcesses.filter(p => p.process_id);
    const res = await api.post(`/products/${modal.product.id}/processes`, { processes: processesToSave });
    if (res.success) { window.__toast?.success('工序配置保存成功'); closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">成品工序配置</h2>
      </div>
      <div className="bg-white rounded-xl shadow w-full">
        {/* 桌面端：原生表格 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品编码</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">规格</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">工序数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((p, idx) => {
                const processCount = p.process_count || 0;
                return (
                  <tr key={p.id || idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">{p.code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-sm">{p.specification || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${processCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {processCount || 0} 道工序
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {processCount > 0 ? <span className="text-green-600">已配置</span> : <span className="text-orange-600">未配置</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <button onClick={() => openConfig(p)} className="text-teal-600 hover:text-teal-800">
                        <i className="fas fa-cog mr-1"></i>配置工序
                      </button>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">暂无成品数据，请先在基础数据中添加成品</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* 移动端 PDA：卡片流形态 */}
        <div className="block md:hidden space-y-3 p-3 bg-gray-50">
          {products.map((p, idx) => {
            const processCount = p.process_count || 0;
            const configured = processCount > 0;
            return (
              <div key={p.id || idx} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                {/* 头部：状态与产品名称 */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-4">
                    <h3 className="font-bold text-gray-800 text-lg leading-snug">{p.name}</h3>
                    <div className="text-sm text-gray-500 font-mono mt-1">{p.code}</div>
                  </div>
                  <div>
                    {configured ? 
                      <span className="shrink-0 bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><i className="fas fa-check-circle"></i>已配置</span> : 
                      <span className="shrink-0 bg-orange-50 border border-orange-200 text-orange-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><i className="fas fa-exclamation-triangle"></i>未配置</span>
                    }
                  </div>
                </div>
                
                {/* 规格及工序信息 */}
                <div className="flex items-center justify-between mt-3 pb-3 border-b border-gray-50">
                  <span className="text-sm text-gray-600 bg-gray-50 px-2.5 py-1 rounded-md max-w-[50%] truncate">
                     {p.specification || '无规格'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-md text-sm font-medium ${configured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    共 {processCount} 道工序
                  </span>
                </div>
                
                {/* 操作按钮组 (移动端大按钮) */}
                <div className="pt-3">
                  <button onClick={() => openConfig(p)} className="w-full flex justify-center items-center gap-2 bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 active:bg-teal-200 py-2.5 rounded-lg font-medium transition-colors">
                    <i className="fas fa-cog"></i> {configured ? '修改工序流转' : '新建工序流转'}
                  </button>
                </div>
              </div>
            );
          })}
          {products.length === 0 && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-100">
               <i className="fas fa-box-open text-3xl mb-2 text-gray-300"></i>
               <p>暂无成品数据</p>
            </div>
          )}
        </div>
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={`工序流程配置 - ${modal.product?.name || ''}`} size="max-w-4xl">
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="font-bold text-lg sm:text-base">{modal.product?.name}</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 font-mono">{modal.product?.code}</span>
                {modal.product?.specification && <span className="text-gray-400">· {modal.product?.specification}</span>}
              </div>
            </div>
          </div>
          <ProcessConfigPanel
              processes={processes}
              productProcesses={modal.productProcesses}
              rawMaterials={modal.boundMaterialIds.length > 0
                ? rawMaterials.filter(m => modal.boundMaterialIds.includes(m.id))
                : rawMaterials
              }
              allProducts={allProducts}
              materialCategoryId={modal.product?.material_category_id}
              materialCategories={[]}
              onChange={handleProcessChange}
            />
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-2 pt-4 border-t border-gray-100">
            <button type="button" onClick={closeModal} className="w-full sm:w-auto px-6 py-3 sm:py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-medium transition-colors">取消</button>
            <button onClick={saveProcesses} className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-bold shadow-sm transition-colors">保存配置</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const ProcessManager = ({ processCode }) => {
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();
  const [processNames, setProcessNames] = useState({});
  const [processes, setProcesses] = useState([]);
  const [outsourcings, setOutsourcings] = useState([]);
  const [materialConsumption, setMaterialConsumption] = useState({}); // { material_id: actual_quantity }
  const [modal, setModal] = useState({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] });
  
  const load = () => {
    api.get(`/production?processCode=${processCode}`).then(res => res.success && setData(res.data));
    api.get('/production/processes').then(res => {
      if (res.success) {
        setProcesses(res.data || []);
        const map = {};
        (res.data || []).forEach(p => { map[p.code] = p.name; });
        setProcessNames(map);
      }
    });
    api.get('/outsourcing?status=pending,processing').then(res => res.success && setOutsourcings(res.data));
  };
  useEffect(() => { load(); }, [processCode]);
  
  const openProcess = async (item) => {
    const res = await api.get(`/production/${item.id}`);
    const ppRes = await api.get(`/products/${item.product_id}/processes`);
    const allProcesses = ppRes.data || [];
    const productProcess = allProcesses.find(p => p.process_code === processCode);
    const isOutsourced = productProcess?.is_outsourced === 1;
    
    // 判断是否首道工序并获取物料绑定
    const isFirstProcess = allProcesses.length > 0 && allProcesses[0].process_code === processCode;
    let processMaterials = [];
    if (isFirstProcess) {
      const matRes = await api.get(`/products/${item.product_id}/process-materials`);
      processMaterials = (matRes.data || []).filter(m => m.process_id === allProcesses[0].process_id);
    }
    
    setModal({ open: true, item: res.data, isOutsourced, isFirstProcess, processMaterials });
    // 初始化材料消耗状态（默认留空，此时尚无产出数量，待填写产出后计算）
    const initConsumption = {};
    processMaterials.forEach(m => { initConsumption[m.material_id] = ''; });
    setMaterialConsumption(initConsumption);
  };
  
  const saveProcess = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const process = processes.find(p => p.code === processCode);
    
    const outputQuantity = parseInt(fd.get('output_quantity')) || 0;
    const defectQuantity = parseInt(fd.get('defect_quantity')) || 0;
    const planQuantity = modal.item?.quantity || 0;
    
    // 验证产出数量合理性（不超过剩余待完成量）
    const completedQty = modal.item?.completed_quantity || 0;
    const remainingQty = planQuantity - completedQty;
    if (outputQuantity + defectQuantity > remainingQty && remainingQty > 0) {
      if (!await confirm(`本次报工数量(${outputQuantity + defectQuantity}) 超过剩余待完成量(${remainingQty})，确定继续吗？`)) return;
    }
    
    const obj = { 
      process_id: process.id, 
      operator: fd.get('operator'), 
      input_quantity: parseInt(fd.get('input_quantity')) || 0, 
      output_quantity: outputQuantity, 
      defect_quantity: defectQuantity, 
      remark: fd.get('remark'),
      outsourcing_id: fd.get('outsourcing_id') || null,
      materials: modal.isFirstProcess && modal.processMaterials.length > 0
        ? modal.processMaterials.map(m => ({
            material_id: m.material_id,
            actual_quantity: materialConsumption[m.material_id] !== '' 
              ? parseFloat(materialConsumption[m.material_id]) 
              : undefined
          })).filter(m => m.actual_quantity !== undefined)
        : undefined
    };
    const res = await api.post(`/production/${modal.item.id}/process`, obj);
    if (res.success) {
      // 累计进度提示
      if (res.processProgress) {
        const prog = res.processProgress;
        if (prog.is_completed) {
          window.__toast?.success(`工序完成！累计产出 ${prog.cumulative_output} / ${prog.target_quantity}`);
        } else {
          window.__toast?.info(`报工成功！累计产出 ${prog.cumulative_output} / ${prog.target_quantity}，剩余 ${prog.remaining}`);
        }
      }
      
      // 如果有物料消耗
      if (res.consumedMaterials && res.consumedMaterials.length > 0) {
        const matMsg = res.consumedMaterials.map(m => `${m.name}: -${m.quantity} ${m.unit}`).join('、');
        window.__toast?.success(`原材料已自动扣减：${matMsg}`);
      }
      
      // 半成品/成品自动入库提示
      if (res.semiProductInbound) {
        const whType = res.semiProductInbound.warehouse_type === 'finished' ? '成品仓' : '半成品仓';
        window.__toast?.success(`已自动入库 ${res.semiProductInbound.quantity} 件至${whType}`);
      }
      
      // 构建提示消息
      let messages = [];
      let actions = [];
      
      if (res.outsourcingOrder) {
        messages.push(`已自动创建委外加工单：${res.outsourcingOrder.order_no}`);
        actions.push({ label: '前往委外加工', menu: 'outsourcing-hub' });
      }
      
      if (res.inboundOrder) {
        messages.push(`生产完成！已自动创建成品入库单：${res.inboundOrder.order_no}`);
        actions.push({ label: '前往入库单', menu: 'inbound' });
      }
      
      const closeState = { open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] };
      
      if (messages.length > 0) {
        const confirmMsg = `工序完成！\n\n${messages.join('\n')}\n\n是否立即前往查看？`;
        setModal({ ...closeState, pendingActions: actions, pendingMessage: confirmMsg }); 
        load();
        setTimeout(async () => {
          if (actions.length > 0 && await confirm(confirmMsg)) {
            window.location.hash = actions[0].menu;
          }
        }, 100);
      } else if (res.processProgress && !res.processProgress.is_completed) {
        // 未完成 → 刷新弹窗数据以继续报工
        const refreshRes = await api.get(`/production/${modal.item.id}`);
        setModal(prev => ({ ...prev, item: refreshRes.data }));
        load();
      } else {
        setModal(closeState); 
        load();
      }
    }
    else window.__toast?.error(res.message);
  };

  const filteredData = data;
  const unit = modal.item?.unit || '件';
  
  return (
    <div className="fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Table columns={[
          { key: 'order_no', title: '生产工单' }, 
          { key: 'product_name', title: '产品' }, 
          { key: 'quantity', title: '计划数量', render: (v, row) => `${v} ${row.unit || '件'}` },
          { key: 'completed_quantity', title: '完成数量', render: (v, row) => `${v || 0} ${row.unit || '件'}` }, 
          { key: 'current_process', title: '当前工序', render: v => processNames[v] || v },
          { key: 'status', title: '状态', render: v => <StatusBadge status={v} /> }
        ]} data={filteredData} onView={openProcess} />
      </div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] })} title={`工序扫码报工 - ${processNames[processCode] || processCode}`} size="max-w-3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-sm bg-gray-50 p-3 rounded-lg divide-y sm:divide-y-0 divide-gray-100">
            <div className="py-1 sm:py-0"><strong>生产工单：</strong>{modal.item?.order_no}</div>
            <div className="py-1 sm:py-0"><strong>产品：</strong>{modal.item?.product_name}</div>
            <div className="py-1 sm:py-0"><strong>计划数量：</strong><span className="text-teal-600 font-bold">{modal.item?.quantity} {unit}</span></div>
          </div>
          {/* 累计进度条 */}
          {(() => {
            const completed = modal.item?.completed_quantity || 0;
            const target = modal.item?.quantity || 0;
            const pct = target > 0 ? Math.min(100, (completed / target) * 100) : 0;
            const remaining = Math.max(0, target - completed);
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-blue-700"><i className="fas fa-chart-bar mr-1"></i>生产进度</span>
                  <span className="text-blue-600">已完成 {completed} / {target} {unit} · 剩余 <strong>{remaining}</strong> {unit}</span>
                </div>
                <div className="bg-blue-200 rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            );
          })()}
          {modal.isOutsourced && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              <strong>委外工序提示：</strong>此工序已标记为委外加工，请先创建委外加工单并在完成后关联。
            </div>
          )}
          {/* 首道工序材料消耗区 */}
          {modal.isFirstProcess && (
            <div className={`rounded-lg p-3 border ${modal.processMaterials.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                <i className={`fas ${modal.processMaterials.length > 0 ? 'fa-cubes' : 'fa-exclamation-circle'}`}></i>
                {modal.processMaterials.length > 0 ? '首道工序 — 材料消耗登记（留空则按计划用量自动计算）' : '⚠ 该工序为首道工序，但未配置所需原材料。建议先到「工序流转配置」中绑定物料。'}
              </div>
              {modal.processMaterials.length > 0 && (
                <div className="mt-2 space-y-2">
                  {modal.processMaterials.map((m, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-white/60 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0 flex justify-between sm:block">
                        <div className="text-sm font-medium">
                          <i className="fas fa-cube mr-1 text-blue-400"></i>{m.material_name}
                          <span className="text-gray-400 ml-1">({m.material_code})</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          单位: {m.quantity} {m.unit || '公斤'}/件
                        </div>
                      </div>
                      <div className="shrink-0 w-full sm:w-36">
                        <label className="sm:block hidden text-xs text-gray-500 mb-0.5">实际用量 ({m.unit || '公斤'})</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={materialConsumption[m.material_id] ?? ''}
                            onChange={e => setMaterialConsumption(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                            className="w-full border border-blue-300 rounded-lg px-3 py-2 sm:py-1 text-sm md:text-base focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-shadow"
                            placeholder="留空 = 自动计算"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <form onSubmit={saveProcess} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">操作员</label><OperatorSelect className="py-3 sm:py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">投入数量 ({unit})</label><input name="input_quantity" type="number" pattern="[0-9]*" inputMode="numeric" className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2" /></div>
              <div><label className="block text-sm font-medium mb-1 flex justify-between"><span>产出数量 ({unit})</span><span className="text-teal-600 text-xs">最大 {modal.item?.quantity}</span></label><input name="output_quantity" type="number" pattern="[0-9]*" inputMode="numeric" max={modal.item?.quantity} className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2 text-lg font-medium text-teal-700" /></div>
              <div><label className="block text-sm font-medium mb-1">不良数量 ({unit})</label><input name="defect_quantity" type="number" pattern="[0-9]*" inputMode="numeric" className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2" /></div>
              {modal.isOutsourced && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">关联委外单 <span className="text-red-500">*</span></label>
                  <select name="outsourcing_id" className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2" required>
                    <option value="">请选择委外加工单</option>
                    {outsourcings.map(o => <option key={o.id} value={o.id}>{o.order_no} - {o.supplier_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-2" rows="2"></textarea></div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-2 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setModal({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] })} className="w-full sm:w-auto px-6 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 font-medium">取消</button>
              <button type="submit" className="w-full sm:w-auto px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 focus:ring-2 focus:ring-teal-500/30 font-bold shadow-sm">提交报工信息</button>
            </div>
          </form>
          <div>
            <h4 className="font-medium mb-2 px-1">流转记录</h4>
            <div className="border border-gray-100 rounded-lg overflow-hidden md:border-none">
              {/* 仅按屏幕切换：桌面表格 */}
              <div className="hidden md:block overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[500px]">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left text-xs whitespace-nowrap">工序</th><th className="px-3 py-2 text-left text-xs whitespace-nowrap">操作员</th>
                    <th className="px-3 py-2 text-left text-xs whitespace-nowrap">投入</th><th className="px-3 py-2 text-left text-xs whitespace-nowrap">产出</th><th className="px-3 py-2 text-left text-xs whitespace-nowrap">不良</th>
                    <th className="px-3 py-2 text-left text-xs whitespace-nowrap">委外单</th>
                  </tr></thead>
                  <tbody>
                    {(modal.item?.processRecords || []).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-sm whitespace-nowrap">{r.process_name}</td><td className="px-3 py-2 text-sm whitespace-nowrap">{r.operator}</td>
                        <td className="px-3 py-2 text-sm whitespace-nowrap">{r.input_quantity}</td><td className="px-3 py-2 text-sm whitespace-nowrap">{r.output_quantity}</td><td className="px-3 py-2 text-sm whitespace-nowrap">{r.defect_quantity}</td>
                        <td className="px-3 py-2 text-sm whitespace-nowrap">{r.outsourcing_id || '-'}</td>
                      </tr>
                    ))}
                    {!(modal.item?.processRecords?.length > 0) && (
                      <tr><td colSpan="6" className="px-3 py-4 text-center text-gray-500">暂无报工记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* 移动端卡片式流转记录 */}
              <div className="block md:hidden bg-gray-50 p-2 space-y-2">
                {(modal.item?.processRecords || []).map((r, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100/50">
                     <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-50">
                        <div className="font-bold text-gray-800 text-[15px]"><i className="fas fa-layer-group text-teal-500 mr-2"></i>{r.process_name}</div>
                        <div className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs"><i className="fas fa-user mr-1 text-gray-400"></i>{r.operator}</div>
                     </div>
                     <div className="grid grid-cols-3 gap-2 text-center mt-2">
                        <div className="bg-gray-50 rounded p-1.5 flex flex-col justify-center">
                          <span className="text-[10px] text-gray-400 mb-0.5">投入</span>
                          <span className="font-medium text-gray-700">{r.input_quantity}</span>
                        </div>
                        <div className="bg-teal-50/50 rounded p-1.5 flex flex-col justify-center border border-teal-100/50">
                          <span className="text-[10px] text-teal-600 mb-0.5">合格产出</span>
                          <span className="font-bold text-teal-700">{r.output_quantity}</span>
                        </div>
                        <div className="bg-red-50/50 rounded p-1.5 flex flex-col justify-center">
                          <span className="text-[10px] text-red-500 mb-0.5">不良品</span>
                          <span className="font-medium text-red-600">{r.defect_quantity > 0 ? r.defect_quantity : '0'}</span>
                        </div>
                     </div>
                     {r.outsourcing_id && (
                       <div className="text-xs text-orange-600 bg-orange-50 px-2 mt-2 py-1.5 rounded flex items-center gap-1.5">
                         <i className="fas fa-external-link-alt"></i>委外关联单：{r.outsourcing_id}
                       </div>
                     )}
                  </div>
                ))}
                {!(modal.item?.processRecords?.length > 0) && (
                  <div className="text-center py-6 text-gray-400 bg-white rounded-lg">
                     <i className="fas fa-history text-2xl mb-1 text-gray-300"></i>
                     <p className="text-xs">该产品尚无历史流转记录</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export { ProcessConfigManager, ProcessManager };
