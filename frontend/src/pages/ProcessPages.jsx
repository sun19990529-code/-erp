import React, { useState, useEffect } from 'react';
import ProcessConfigPanel from '../components/ProcessConfigPanel';
import OperatorSelect from '../components/OperatorSelect';
import { api } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Table from '../components/Table';

const ProcessConfigManager = () => {
  const [products, setProducts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [modal, setModal] = useState({ open: false, product: null, productProcesses: [] });
  
  const load = async () => {
    api.get('/products?category=成品').then(res => res.success && setProducts(res.data));
    api.get('/production/processes').then(res => res.success && setProcesses(res.data));
    // 并行加载原材料和半成品，避免竞态
    const [rawRes, semiRes] = await Promise.all([
      api.get('/products?category=原材料'),
      api.get('/products?category=半成品'),
    ]);
    setRawMaterials([
      ...(rawRes.success ? rawRes.data : []),
      ...(semiRes.success ? semiRes.data : []),
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
    setModal({ open: true, product, productProcesses: enriched });
  };
  
  const closeModal = () => {
    setModal({ open: false, product: null, productProcesses: [] });
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
          <ProcessConfigPanel
              processes={processes}
              productProcesses={modal.productProcesses}
              rawMaterials={rawMaterials}
              materialCategoryId={modal.product?.material_category_id}
              materialCategories={[]}
              onChange={handleProcessChange}
            />
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
      if (!confirm(`本次报工数量(${outputQuantity + defectQuantity}) 超过剩余待完成量(${remainingQty})，确定继续吗？`)) return;
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm bg-gray-50 p-3 rounded-lg">
            <div><strong>生产工单：</strong>{modal.item?.order_no}</div>
            <div><strong>产品：</strong>{modal.item?.product_name}</div>
            <div><strong>计划数量：</strong>{modal.item?.quantity} {unit}</div>
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
                    <div key={i} className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          <i className="fas fa-cube mr-1 text-blue-400"></i>{m.material_name}
                          <span className="text-gray-400 ml-1">({m.material_code})</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          单位用量: {m.quantity} {m.unit || '公斤'}/件
                        </div>
                      </div>
                      <div className="shrink-0 w-36">
                        <label className="block text-xs text-gray-500 mb-0.5">实际用量 ({m.unit || '公斤'})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={materialConsumption[m.material_id] ?? ''}
                          onChange={e => setMaterialConsumption(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-400"
                          placeholder="留空=自动"
                        />
                      </div>
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
