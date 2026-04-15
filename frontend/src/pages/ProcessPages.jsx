import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { calcKgPerPiece, calcKgPerPieceFromProduct } from '../utils/unitConvert';
import { formatAmount, formatQuantity } from '../utils/format';

import { DualQuantityInput } from '../components/DualQuantityInput';
import NextStepActions from '../components/NextStepActions';

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
      const mats = allMaterials.filter(m => m.product_process_id === p.id);
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
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [confirm, ConfirmDialog] = useConfirm();
  const [processNames, setProcessNames] = useState({});
  const [processes, setProcesses] = useState([]);
  const [outsourcings, setOutsourcings] = useState([]);
  // materialConsumption 已移除 — 材料登记功能已迁移至领料模块
  const [outputStats, setOutputStats] = useState({ inputQty: '', outputQty: '', defectQty: '' });
  const [modal, setModal] = useState({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [], processSummary: [], prevProcessOutput: 0 });
  const [selectedProcess, setSelectedProcess] = useState(''); // 工序Tab筛选，空=全部

  // 智能下一步跳转 actions
  const processNextActions = useMemo(() => {
    const acts = [];
    const completed = modal.item?.completed_quantity || 0;
    const total = modal.item?.quantity || 0;
    const allDone = completed >= total && total > 0;
    
    if (!allDone) {
      acts.push({ icon: '📦', label: '去领料', path: '/production/pick' });
    }
    if (allDone) {
      acts.push({ icon: '🔍', label: '去成品检验', path: '/inspection' });
      acts.push({ icon: '📥', label: '查看入库', path: '/warehouse/inbound' });
    }
    if (modal.isOutsourced) {
      acts.push({ icon: '🚚', label: '查看委外单', path: '/outsourcing' });
    }
    return acts;
  }, [modal.item?.completed_quantity, modal.item?.quantity, modal.isOutsourced]);
  
  const load = () => {
    // 如果选中了工序Tab，按该工序筛选；否则加载全部活跃工单
    const activeProcessCode = selectedProcess || processCode;
    const url = (activeProcessCode && activeProcessCode !== 'undefined') ? `/production?processCode=${activeProcessCode}` : '/production';
    api.get(url).then(res => {
      if (res.success) {
        const activeData = (activeProcessCode && activeProcessCode !== 'undefined') ? res.data : res.data.filter(d => d.status !== 'completed');
        setData(activeData);
      }
    });
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
  useEffect(() => { load(); }, [processCode, selectedProcess]);
  
  const openProcess = async (item) => {
    // 当前正在操作的工序：Tab选中的 > 路由传入的 > 工单当前工序
    const pCode = selectedProcess || (processCode && processCode !== 'undefined' ? processCode : item.current_process);
    const res = await api.get(`/production/${item.id}`);
    const ppRes = await api.get(`/products/${item.product_id}/processes`);
    const allProcesses = ppRes.data || [];
    const productProcess = allProcesses.find(p => p.process_code === pCode);
    const isOutsourced = productProcess?.is_outsourced === 1;
    const currentIdx = allProcesses.findIndex(p => p.process_code === pCode);
    
    // 判断是否首道工序
    const isFirstProcess = allProcesses.length > 0 && allProcesses[0].process_code === pCode;
    
    // 获取各工序累计产出摘要
    const processSummary = res.data?.processSummary || [];
    
    // 计算前一道工序的累计产出（非首道时用于限制投入上限）
    let prevProcessOutput = 0;
    let currentProcessOutput = 0;
    if (currentIdx > 0) {
      const prevCode = allProcesses[currentIdx - 1].process_code;
      const prevSummary = processSummary.find(s => s.process_code === prevCode);
      prevProcessOutput = prevSummary?.cumulative_output || 0;
    }
    const curSummary = processSummary.find(s => s.process_code === pCode);
    currentProcessOutput = curSummary?.cumulative_output || 0;
    
    // 已领料信息（从后端获取）
    const pickedMaterials = res.data?.pickedMaterials || [];
    const totalPicked = pickedMaterials.reduce((sum, m) => sum + (m.picked_quantity || 0), 0);
    
    // 使用原材料尺寸做 kg↔支换算（取第一种已领原材料的尺寸参数）
    const primaryMaterial = pickedMaterials[0] || null;
    const rawKgPerPiece = primaryMaterial ? calcKgPerPiece(primaryMaterial.outer_diameter, primaryMaterial.wall_thickness, primaryMaterial.material_length) : 0;
    
    setModal({ open: true, item: res.data, isOutsourced, isFirstProcess, processSummary, prevProcessOutput, currentProcessOutput, currentProcessCode: pCode, pickedMaterials, totalPicked, rawKgPerPiece });
    
    // ===== 自动预填投入量 =====
    let defaultInputQty = '';
    let defaultInputKg = '';
    if (isFirstProcess) {
      // 首道工序：投入上限 = 已领料总量，自动预填
      if (totalPicked > 0) {
        defaultInputKg = formatQuantity(totalPicked, 2);
        if (rawKgPerPiece > 0) {
          defaultInputQty = Math.round(totalPicked / rawKgPerPiece).toString();
        }
      }
    } else {
      // 非首道工序：自动填入前一道流转下来的剩余数量
      const remainingInput = Math.max(0, prevProcessOutput - currentProcessOutput);
      if (remainingInput > 0) {
        defaultInputQty = remainingInput.toString();
      }
    }
    
    setOutputStats({ inputQty: defaultInputQty, inputKg: defaultInputKg, outputQty: '', defectQty: '' });
  };
  
  // 材料投入自动计算已迁移至领料模块 — 此处不再需要 useEffect
  
  const saveProcess = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const pCode = modal.currentProcessCode || selectedProcess || (processCode && processCode !== 'undefined' ? processCode : modal.item?.current_process);
    const process = processes.find(p => p.code === pCode);
    
    if (!process) {
      window.__toast?.error('未找到对应工序配置');
      return;
    }
    
    // 受控输入优先，修复 '0' falsy 导致的回退问题
    const parsedInputQty = parseInt(outputStats.inputQty !== '' ? outputStats.inputQty : fd.get('input_quantity')) || 0;
    const outputQuantity = parseInt(outputStats.outputQty !== '' ? outputStats.outputQty : fd.get('output_quantity')) || 0;
    const defectQuantity = parseInt(outputStats.defectQty !== '' ? outputStats.defectQty : fd.get('defect_quantity')) || 0;
    
    const planQuantity = modal.item?.quantity || 0;
    const completedQty = modal.item?.completed_quantity || 0;
    const remainingQty = planQuantity - completedQty;
    if (outputQuantity + defectQuantity > remainingQty && remainingQty > 0) {
      if (!await confirm(`本次报工数量(${outputQuantity + defectQuantity}) 超过剩余待完成量(${remainingQty})，确定继续吗？`)) return;
    }
    
    const obj = { 
      process_id: process.id, 
      operator: fd.get('operator'), 
      input_quantity: parsedInputQty, 
      output_quantity: outputQuantity, 
      defect_quantity: defectQuantity, 
      remark: fd.get('remark'),
      outsourcing_id: fd.get('outsourcing_id') || null
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
              const menuToPath = { 'outsourcing-hub': '/outsourcing', 'inbound': '/warehouse/inbound' };
              navigate(menuToPath[actions[0].menu] || '/');
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
  const activeProcessCode = selectedProcess || processCode;
  
  return (
    <div className="fade-in">
      {/* 工序标签页导航 */}
      {!processCode && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 p-1 flex flex-wrap gap-1 overflow-x-auto">
          <button onClick={() => setSelectedProcess('')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${!selectedProcess ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
            <i className="fas fa-th-list mr-1.5"></i>全部工单
          </button>
          {processes.map(p => (
            <button key={p.code} onClick={() => setSelectedProcess(p.code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${selectedProcess === p.code ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
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
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [], processSummary: [], prevProcessOutput: 0 })} title={`工序扫码报工 - ${processNames[modal.currentProcessCode || activeProcessCode] || modal.currentProcessCode || activeProcessCode || '未知'}`} size="max-w-3xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-sm bg-gray-50 p-3 rounded-lg divide-y sm:divide-y-0 divide-gray-100">
            <div className="py-1 sm:py-0"><strong>生产工单：</strong>{modal.item?.order_no}</div>
            <div className="py-1 sm:py-0"><strong>产品：</strong>{modal.item?.product_name}</div>
            <div className="py-1 sm:py-0 flex items-center justify-between">
              <div><strong>计划数量：</strong><span className="text-teal-600 font-bold">{modal.item?.quantity} {unit}</span></div>
              {(() => {
                 const kpp = calcKgPerPieceFromProduct(modal.item);
                 if (kpp > 0) return <span className="text-xs text-gray-500 font-medium bg-gray-200 px-2 py-0.5 rounded">约 {formatQuantity(((modal.item.quantity || 0) * kpp), 2)} Kg</span>;
                 return null;
              })()}
            </div>
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
          {/* 已领料信息（只读展示） */}
          {modal.isFirstProcess && (
            <div className={`rounded-lg p-3 border ${(modal.pickedMaterials?.length > 0) ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              {modal.pickedMaterials?.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-green-800">
                      <i className="fas fa-boxes mr-1"></i>已领取材料
                    </div>
                    <span className="text-sm font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-lg">
                      共计 {formatQuantity(modal.totalPicked || 0, 2)} Kg
                      {modal.rawKgPerPiece > 0 && <span className="ml-1 text-green-600 font-normal">≈ {Math.round((modal.totalPicked || 0) / modal.rawKgPerPiece)} 支</span>}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {modal.pickedMaterials.map((m, i) => {
                      const rawKpp = calcKgPerPiece(m.outer_diameter, m.wall_thickness, m.material_length);
                      const finishedKpp = calcKgPerPieceFromProduct(modal.item);
                      const estimatedOutput = finishedKpp > 0 ? Math.floor(m.picked_quantity / finishedKpp) : 0;
                      return (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/70 rounded-lg px-3 py-2 gap-1">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-800">
                              <i className="fas fa-cube mr-1 text-green-400"></i>{m.material_name}
                              <span className="text-gray-400 ml-1 text-xs">({m.material_code})</span>
                            </span>
                            {rawKpp > 0 && <span className="text-xs text-gray-500 ml-2">理算 {formatQuantity(rawKpp, 3)} Kg/支</span>}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="font-bold text-green-700">{formatQuantity(m.picked_quantity || 0, 2)} Kg</span>
                            {rawKpp > 0 && <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">≈ {Math.round(m.picked_quantity / rawKpp)} 支</span>}
                            {estimatedOutput > 0 && <span className="text-teal-600 bg-teal-50 px-2 py-0.5 rounded">预计产出 {estimatedOutput} 件成品</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-yellow-800 font-medium">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span>⚠ 首道工序尚未领料。请先到「领料管理」创建领料单并审批通过后再报工。</span>
                </div>
              )}
            </div>
          )}
          <form onSubmit={saveProcess} className="space-y-4">
            {(() => {
              // 使用原材料尺寸做 kg↔支换算（优先用已领料的原材料，兜底用成品）
              const kgPerPiece = modal.rawKgPerPiece || calcKgPerPieceFromProduct(modal.item);
              
              // ===== 投入上限计算 =====
              let inputMaxVal = 0;
              let inputHint = '';
              if (modal.isFirstProcess) {
                // 首道工序：投入上限 = 已领料总量
                const totalPicked = modal.totalPicked || 0;
                if (totalPicked > 0 && kgPerPiece > 0) {
                  inputMaxVal = Math.round(totalPicked / kgPerPiece);
                  inputHint = `已领料 ${formatQuantity(totalPicked, 1)} Kg ≈ ${inputMaxVal} 支（原材料）`;
                } else if (totalPicked > 0) {
                  inputHint = `已领料 ${formatQuantity(totalPicked, 1)} Kg`;
                } else {
                  inputHint = '尚未领料';
                }
              } else {
                // 非首道：上限 = 前一道累计产出 - 本道累计产出
                inputMaxVal = Math.max(0, (modal.prevProcessOutput || 0) - (modal.currentProcessOutput || 0));
                const inputMaxKg = inputMaxVal > 0 && kgPerPiece > 0 ? formatQuantity(inputMaxVal * kgPerPiece, 1) : '';
                inputHint = inputMaxVal > 0 
                  ? `前序累计 ${modal.prevProcessOutput} 件 · 本序已报 ${modal.currentProcessOutput} 件 · 可投 ${inputMaxKg ? inputMaxKg + ' Kg ≈ ' : ''}${inputMaxVal} 件`
                  : '前序尚无产出';
              }
              
              // ===== 产出上限 = 投入数量（你投入多少，最多产出多少）
              const inputQtyNum = parseInt(outputStats.inputQty) || 0;
              const outputMaxVal = inputQtyNum > 0 ? inputQtyNum : (modal.item?.quantity || 0);
              // 投入重量（首道由已领料自动填入，非首道由件数换算）
              const inputKgDisplay = modal.isFirstProcess 
                ? (outputStats.inputKg || '') 
                : (kgPerPiece > 0 && outputStats.inputQty ? formatQuantity(parseFloat(outputStats.inputQty) * kgPerPiece, 2) : '');
              
              return (
                <div className="grid grid-cols-1 gap-4">
                  <div className="w-full sm:w-1/2">
                    <label className="block text-sm font-medium mb-1 text-gray-700">【报工操作员】</label>
                    <OperatorSelect className="py-3 sm:py-2 font-medium" />
                  </div>
                  
                  {/* 投入量 — 以重量Kg为主输入 */}
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100 mb-2">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 flex justify-between">
                        <span>投入重量 (Kg)</span>
                        {inputMaxVal > 0 && kgPerPiece > 0 && <span className="text-teal-600 text-xs mt-0.5">上限 {formatQuantity(inputMaxVal * kgPerPiece, 1)} Kg</span>}
                      </label>
                      <input type="number" step="0.01" inputMode="decimal"
                        value={outputStats.inputKg || inputKgDisplay}
                        onChange={e => {
                          if (modal.isFirstProcess) return;
                          setOutputStats(prev => ({ ...prev, inputKg: e.target.value }));
                        }}
                        onBlur={() => {
                          if (modal.isFirstProcess) return;
                          const kg = parseFloat(outputStats.inputKg);
                          if (isNaN(kg) || outputStats.inputKg === '') {
                            setOutputStats(prev => ({ ...prev, inputQty: '', inputKg: '' }));
                          } else if (kgPerPiece > 0) {
                            setOutputStats(prev => ({ ...prev, inputQty: Math.round(kg / kgPerPiece).toString() }));
                          } else {
                            setOutputStats(prev => ({ ...prev, inputQty: Math.round(kg).toString() }));
                          }
                        }}
                        className={`w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2 text-lg font-bold text-teal-800 ${modal.isFirstProcess ? 'bg-teal-50/50' : ''}`}
                        readOnly={modal.isFirstProcess}
                        placeholder={modal.isFirstProcess ? '由已领料自动填入' : '填入重量(Kg)'} />
                      {inputHint && <div className="text-xs text-gray-500 mt-1"><i className="fas fa-info-circle mr-1"></i>{inputHint}</div>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-500 flex justify-between">
                        <span>≈ 折算支数 (原材料)</span>
                        {inputMaxVal > 0 && <span className="text-gray-400 text-xs mt-0.5">≈ {inputMaxVal} 支</span>}
                      </label>
                      <input type="number" pattern="[0-9]*" inputMode="numeric"
                        max={inputMaxVal > 0 ? inputMaxVal : undefined}
                        value={outputStats.inputQty ?? ''}
                        onChange={e => {
                          const qty = parseInt(e.target.value);
                          if (isNaN(qty) || e.target.value === '') {
                            setOutputStats(prev => ({ ...prev, inputQty: '', inputKg: '' }));
                          } else {
                            const kg = kgPerPiece > 0 ? formatQuantity(qty * kgPerPiece, 2) : '';
                            setOutputStats(prev => ({ ...prev, inputQty: e.target.value, inputKg: kg }));
                          }
                        }}
                        className="w-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 rounded-lg px-3 py-3 sm:py-2 text-lg text-blue-700 font-medium bg-blue-50/30"
                        readOnly={modal.isFirstProcess}
                        placeholder={modal.isFirstProcess ? '自动计算' : '或填支数'} />
                    </div>
                  </div>
                  
                  <DualQuantityInput label="完工/产出" maxVal={outputMaxVal} value={outputStats.outputQty} onChange={v => setOutputStats(prev => ({ ...prev, outputQty: v }))} kgPerPiece={kgPerPiece} />
                  <DualQuantityInput label="不良品" maxVal={0} value={outputStats.defectQty} onChange={v => setOutputStats(prev => ({ ...prev, defectQty: v }))} kgPerPiece={kgPerPiece} />
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
              );
            })()}
            <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-2" rows="2"></textarea></div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-2 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setModal({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [], processSummary: [], prevProcessOutput: 0 })} className="w-full sm:w-auto px-6 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 font-medium">取消</button>
              <button type="submit" className="w-full sm:w-auto px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 focus:ring-2 focus:ring-teal-500/30 font-bold shadow-sm">提交报工信息</button>
            </div>
          </form>
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 px-1">
              <h4 className="font-medium text-gray-800">流转记录</h4>
              <div className="text-sm mt-1 sm:mt-0 flex gap-4 text-gray-600 bg-teal-50/50 px-3 py-1.5 rounded-lg border border-teal-100">
                {modal.isFirstProcess ? (
                  <>
                    <span>工单目标: <strong className="text-gray-900">{modal.item?.quantity}</strong></span>
                    <span>已完成: <strong className="text-teal-600">{modal.currentProcessOutput}</strong></span>
                    <span>剩余待报: <strong className="text-orange-600">{Math.max(0, (modal.item?.quantity || 0) - modal.currentProcessOutput)}</strong> 件</span>
                  </>
                ) : (
                  <>
                    <span>前序流转(可用): <strong className="text-gray-900">{modal.prevProcessOutput}</strong></span>
                    <span>本序已完工: <strong className="text-teal-600">{modal.currentProcessOutput}</strong></span>
                    <span>剩余待报: <strong className="text-orange-600">{Math.max(0, modal.prevProcessOutput - modal.currentProcessOutput)}</strong> 件</span>
                  </>
                )}
              </div>
            </div>
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
          
          {/* 智能下一步跳转 */}
          <NextStepActions actions={processNextActions} />
        </div>
      </Modal>
    </div>
  );
};

export { ProcessConfigManager, ProcessManager };
