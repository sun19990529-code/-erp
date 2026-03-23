import React, { useState, useEffect, useRef, useCallback } from 'react';
import OperatorSelect from '../components/OperatorSelect';
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

const ProcessConfigManager = () => {
  const [products, setProducts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [modal, setModal] = useState({ open: false, product: null, productProcesses: [] });
  const [expandedMaterial, setExpandedMaterial] = useState({}); // 跟踪哪些工序行展开了物料配置
  
  const load = () => {
    api.get('/products?category=成品').then(res => res.success && setProducts(res.data));
    api.get('/production/processes').then(res => res.success && setProcesses(res.data));
    // 加载原材料和半成品作为可选物料
    api.get('/products?category=原材料').then(res => res.success && setRawMaterials(prev => {
      const semiRes = prev.filter(p => p.category === '半成品');
      return [...(res.data || []), ...semiRes];
    }));
    api.get('/products?category=半成品').then(res => res.success && setRawMaterials(prev => {
      const rawRes = prev.filter(p => p.category === '原材料');
      return [...rawRes, ...(res.data || [])];
    }));
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
    setExpandedMaterial({});
    setModal({ open: true, product, productProcesses: enriched });
  };
  
  const closeModal = () => {
    setModal({ open: false, product: null, productProcesses: [] });
    setExpandedMaterial({});
  };
  
  const addProcessRow = () => {
    setModal({ 
      ...modal, 
      productProcesses: [...modal.productProcesses, { process_id: '', sequence: modal.productProcesses.length + 1, is_outsourced: 0, remark: '', materials: [] }] 
    });
  };
  
  const removeProcessRow = (index) => {
    const newProcesses = modal.productProcesses.filter((_, i) => i !== index);
    newProcesses.forEach((p, i) => p.sequence = i + 1);
    setModal({ ...modal, productProcesses: newProcesses });
  };
  
  const updateProcessRow = (index, field, value) => {
    const newProcesses = [...modal.productProcesses];
    newProcesses[index] = { ...newProcesses[index], [field]: value };
    setModal({ ...modal, productProcesses: newProcesses });
  };

  // 物料子表操作
  const toggleMaterialPanel = (index) => {
    setExpandedMaterial(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const addMaterialRow = (processIndex) => {
    const newProcesses = [...modal.productProcesses];
    const mats = newProcesses[processIndex].materials || [];
    newProcesses[processIndex] = { ...newProcesses[processIndex], materials: [...mats, { material_id: '', quantity: 1, unit: '公斤', remark: '' }] };
    setModal({ ...modal, productProcesses: newProcesses });
  };

  const removeMaterialRow = (processIndex, matIndex) => {
    const newProcesses = [...modal.productProcesses];
    newProcesses[processIndex].materials = newProcesses[processIndex].materials.filter((_, i) => i !== matIndex);
    setModal({ ...modal, productProcesses: newProcesses });
  };

  const updateMaterialRow = (processIndex, matIndex, field, value) => {
    const newProcesses = [...modal.productProcesses];
    const mats = [...(newProcesses[processIndex].materials || [])];
    mats[matIndex] = { ...mats[matIndex], [field]: value };
    newProcesses[processIndex] = { ...newProcesses[processIndex], materials: mats };
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
      <div className="bg-white rounded-xl shadow">
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
      <Modal isOpen={modal.open} onClose={closeModal} title={`工序流程配置 - ${modal.product?.name || ''}`} size="max-w-4xl">
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="font-bold">{modal.product?.name}</span>
              <span className="text-gray-500">{modal.product?.code}</span>
              <span className="text-gray-500">{modal.product?.specification}</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">加工工序流程</label>
              <button onClick={addProcessRow} className="text-teal-600 text-sm"><i className="fas fa-plus mr-1"></i>添加工序</button>
            </div>
            <div className="space-y-2">
              {modal.productProcesses.map((p, i) => {
                const processName = processes.find(pr => pr.id == p.process_id)?.name || '';
                const matCount = (p.materials || []).filter(m => m.material_id).length;
                return (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    {/* 工序主行 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white">
                      <input type="number" value={p.sequence} onChange={e => updateProcessRow(i, 'sequence', parseInt(e.target.value) || 1)} className="w-12 border rounded px-2 py-1 text-center text-sm" />
                      <select value={p.process_id} onChange={e => updateProcessRow(i, 'process_id', e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">
                        <option value="">选择工序</option>
                        {processes && processes.length > 0 ? processes.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>) : <option disabled>未获取到工序数据</option>}
                      </select>
                      <label className="flex items-center gap-1 cursor-pointer text-sm whitespace-nowrap">
                        <input type="checkbox" checked={p.is_outsourced} onChange={e => updateProcessRow(i, 'is_outsourced', e.target.checked ? 1 : 0)} className="w-4 h-4" />
                        委外
                      </label>
                      <input value={p.remark || ''} onChange={e => updateProcessRow(i, 'remark', e.target.value)} className="w-28 border rounded px-2 py-1 text-sm" placeholder="备注" />
                      <button onClick={() => toggleMaterialPanel(i)} className={`text-xs px-2 py-1 rounded whitespace-nowrap transition-colors ${matCount > 0 ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600'}`} title="配置该工序所需物料">
                        <i className="fas fa-cubes mr-1"></i>物料{matCount > 0 ? `(${matCount})` : ''}
                      </button>
                      <button onClick={() => removeProcessRow(i)} className="text-red-400 hover:text-red-600 px-1"><i className="fas fa-trash text-sm"></i></button>
                    </div>
                    {/* 物料绑定子面板 */}
                    {expandedMaterial[i] && (
                      <div className="bg-blue-50/40 border-t border-blue-100 px-4 py-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-blue-700"><i className="fas fa-cubes mr-1"></i>工序「{processName || '未选择'}」所需物料</span>
                          <button onClick={() => addMaterialRow(i)} className="text-xs text-blue-600 hover:text-blue-800"><i className="fas fa-plus mr-1"></i>添加物料</button>
                        </div>
                        {(p.materials || []).length === 0 ? (
                          <div className="text-center text-xs text-gray-400 py-2">暂未配置物料，点击"添加物料"以绑定该工序所需的原材料</div>
                        ) : (
                          <div className="space-y-1">
                            {p.materials.map((mat, mi) => (
                              <div key={mi} className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-blue-100">
                                <select value={mat.material_id} onChange={e => updateMaterialRow(i, mi, 'material_id', e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">
                                  <option value="">选择原材料</option>
                                  {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>[{rm.category}] {rm.name} ({rm.specification || rm.code})</option>)}
                                </select>
                                <input type="number" step="0.01" min="0" value={mat.quantity} onChange={e => updateMaterialRow(i, mi, 'quantity', parseFloat(e.target.value) || 0)} className="w-20 border rounded px-2 py-1 text-sm text-center" placeholder="用量" />
                                <select value={mat.unit || '公斤'} onChange={e => updateMaterialRow(i, mi, 'unit', e.target.value)} className="w-16 border rounded px-2 py-1 text-xs">
                                  <option value="公斤">公斤</option>
                                  <option value="吨">吨</option>
                                  <option value="件">件</option>
                                  <option value="米">米</option>
                                  <option value="根">根</option>
                                </select>
                                <button onClick={() => removeMaterialRow(i, mi)} className="text-red-400 hover:text-red-600"><i className="fas fa-times"></i></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {modal.productProcesses.length === 0 && (
                <div className="text-center text-gray-500 py-8 border rounded-lg">暂无工序配置，点击上方"添加工序"按钮</div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={saveProcesses} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存配置</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const ProcessManager = ({ processCode }) => {
  const [data, setData] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [outsourcings, setOutsourcings] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] });
  
  const processNames = { 
    ROLLING: '轧机', STRAIGHTENING: '校直', POLISHING: '抛光', CORRECTING: '矫直', CUTTING: '切割',
    DRAWING: '拉拔', CLEANING: '清洗', WIRE_CUTTING: '线切割', LASER_CUTTING: '激光切割', HEAT_TREATMENT: '热处理'
  };
  
  const load = () => {
    api.get(`/production?processCode=${processCode}`).then(res => res.success && setData(res.data));
    api.get('/production/processes').then(res => res.success && setProcesses(res.data));
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
  };
  
  const saveProcess = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const process = processes.find(p => p.code === processCode);
    
    const outputQuantity = parseInt(fd.get('output_quantity')) || 0;
    const defectQuantity = parseInt(fd.get('defect_quantity')) || 0;
    const planQuantity = modal.item?.quantity || 0;
    
    // 验证产出数量不能超过计划数量
    if (outputQuantity + defectQuantity > planQuantity) {
      window.__toast?.warning(`产出数量(${outputQuantity}) + 不良数量(${defectQuantity}) 不能超过计划数量(${planQuantity})！`);
      return;
    }
    
    const obj = { 
      process_id: process.id, 
      operator: fd.get('operator'), 
      input_quantity: parseInt(fd.get('input_quantity')) || 0, 
      output_quantity: outputQuantity, 
      defect_quantity: defectQuantity, 
      remark: fd.get('remark'),
      outsourcing_id: fd.get('outsourcing_id') || null
    };
    const res = await api.post(`/production/${modal.item.id}/process`, obj);
    if (res.success) {
      // 如果有物料消耗，先提示
      if (res.consumedMaterials && res.consumedMaterials.length > 0) {
        const matMsg = res.consumedMaterials.map(m => `${m.name}: -${m.quantity} ${m.unit}`).join('、');
        window.__toast?.success(`原材料已自动扣减：${matMsg}`);
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
        setTimeout(() => {
          if (actions.length > 0 && confirm(confirmMsg)) {
            window.location.hash = actions[0].menu;
            window.location.reload();
          }
        }, 100);
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm bg-gray-50 p-3 rounded-lg">
            <div><strong>生产工单：</strong>{modal.item?.order_no}</div>
            <div><strong>产品：</strong>{modal.item?.product_name}</div>
            <div><strong>计划数量：</strong>{modal.item?.quantity} {unit}</div>
          </div>
          {modal.isOutsourced && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              <strong>委外工序提示：</strong>此工序已标记为委外加工，请先创建委外加工单并在完成后关联。
            </div>
          )}
          {/* 首道工序物料消耗提示 */}
          {modal.isFirstProcess && (
            <div className={`rounded-lg p-3 border ${modal.processMaterials.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
              <div className="flex items-center gap-2 font-medium mb-1">
                <i className={`fas ${modal.processMaterials.length > 0 ? 'fa-cubes' : 'fa-exclamation-circle'}`}></i>
                {modal.processMaterials.length > 0 ? '首道工序 — 提交报工后将自动消耗以下原材料：' : '⚠ 该工序为首道工序，但未配置所需原材料。建议先到「工序流转配置」中绑定物料。'}
              </div>
              {modal.processMaterials.length > 0 && (
                <div className="mt-2 space-y-1">
                  {modal.processMaterials.map((m, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/60 rounded px-3 py-1.5 text-sm">
                      <span><i className="fas fa-cube mr-1 text-blue-400"></i>{m.material_name} ({m.material_code})</span>
                      <span className="font-medium">{m.quantity} {m.unit || '公斤'} / {unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <form onSubmit={saveProcess} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">操作员</label><OperatorSelect /></div>
              <div><label className="block text-sm font-medium mb-1">投入数量 ({unit})</label><input name="input_quantity" type="number" className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">产出数量 ({unit}) <span className="text-gray-400 text-xs">最大: {modal.item?.quantity} {unit}</span></label><input name="output_quantity" type="number" max={modal.item?.quantity} className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">不良数量 ({unit})</label><input name="defect_quantity" type="number" className="w-full border rounded-lg px-3 py-2" /></div>
              {modal.isOutsourced && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">关联委外单 <span className="text-red-500">*</span></label>
                  <select name="outsourcing_id" className="w-full border rounded-lg px-3 py-2" required>
                    <option value="">请选择委外加工单</option>
                    {outsourcings.map(o => <option key={o.id} value={o.id}>{o.order_no} - {o.supplier_name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={() => setModal({ open: false, item: null, isOutsourced: false, isFirstProcess: false, processMaterials: [] })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交报工信息</button>
            </div>
          </form>
          <div>
            <h4 className="font-medium mb-2">流转记录</h4>
            <div className="overflow-x-auto rounded-lg border">
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
          </div>
        </div>
      </Modal>
    </div>
  );
};

const ProcessExecutionHub = () => {
  const [activeProcess, setActiveProcess] = useState('ROLLING');
  const processNames = { 
    ROLLING: '轧机', STRAIGHTENING: '校直', POLISHING: '抛光', CORRECTING: '矫直', CUTTING: '切割',
    DRAWING: '拉拔', CLEANING: '清洗', WIRE_CUTTING: '线切割', LASER_CUTTING: '激光切割', HEAT_TREATMENT: '热处理'
  };

  return (
    <div className="fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold">车间报工大厅</h2>
          <span className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-sm font-medium">
            当前所在工位：{processNames[activeProcess]}
          </span>
        </div>
        <div className="bg-gray-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(processNames).map(([code, name]) => (
              <button
                key={code}
                onClick={() => setActiveProcess(code)}
                className={`px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap ${
                  activeProcess === code 
                    ? 'bg-teal-600 text-white shadow-md font-bold' 
                    : 'bg-white text-gray-600 hover:bg-teal-50 hover:text-teal-600 border border-gray-200/60'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ProcessManager processCode={activeProcess} />
    </div>
  );
};

export { ProcessConfigManager, ProcessManager, ProcessExecutionHub };
