import React, { useState } from 'react';

/**
 * 工序配置面板 — 共享组件
 * 用于 BasicDataPages（成品编辑/独立工序配置弹窗）和 ProcessPages（工序流转配置）
 * 
 * Props:
 *   processes        - 可选工序列表 [{id, name}]
 *   productProcesses - 当前配置的工序列表 (带 materials)
 *   rawMaterials     - 可选原材料列表 [{id, name, code, category, specification, material_category_id}]
 *   materialCategoryId - 成品的材质分类 ID，用于过滤原材料
 *   materialCategories - 材质分类列表（用于显示分类名）
 *   onChange         - (newProductProcesses) => void
 */
const ProcessConfigPanel = ({
  processes = [],
  productProcesses = [],
  rawMaterials = [],
  allProducts = [],
  materialCategoryId = '',
  materialCategories = [],
  onChange,
}) => {
  const [expandedMaterial, setExpandedMaterial] = useState({});

  const updateProcesses = (newList) => onChange(newList);

  const addProcessRow = () => {
    updateProcesses([
      ...productProcesses,
      { process_id: '', sequence: productProcesses.length + 1, is_outsourced: 0, remark: '', materials: [], output_product_id: '' }
    ]);
  };

  const removeProcessRow = (index) => {
    const newList = productProcesses.filter((_, i) => i !== index);
    newList.forEach((p, i) => p.sequence = i + 1);
    updateProcesses(newList);
    setExpandedMaterial(prev => {
      const next = {};
      Object.keys(prev).forEach(k => {
        const ki = parseInt(k);
        if (ki < index) next[ki] = prev[ki];
        else if (ki > index) next[ki - 1] = prev[ki];
      });
      return next;
    });
  };

  const updateProcessRow = (index, field, value) => {
    const newList = [...productProcesses];
    newList[index] = { ...newList[index], [field]: value };
    updateProcesses(newList);
  };

  const addMaterialRow = (processIndex) => {
    const newList = [...productProcesses];
    const mats = newList[processIndex].materials || [];
    newList[processIndex] = { ...newList[processIndex], materials: [...mats, { material_id: '' }] };
    updateProcesses(newList);
  };

  const removeMaterialRow = (processIndex, matIndex) => {
    const newList = [...productProcesses];
    newList[processIndex].materials = newList[processIndex].materials.filter((_, i) => i !== matIndex);
    updateProcesses(newList);
  };

  const updateMaterialRow = (processIndex, matIndex, field, value) => {
    const newList = [...productProcesses];
    const mats = [...(newList[processIndex].materials || [])];
    mats[matIndex] = { ...mats[matIndex], [field]: value };
    newList[processIndex] = { ...newList[processIndex], materials: mats };
    updateProcesses(newList);
  };

  // 按材质过滤原材料
  const getFilteredMaterials = () => {
    const catId = materialCategoryId;
    if (!catId) return rawMaterials;
    return rawMaterials.filter(rm => String(rm.material_category_id) === String(catId));
  };

  const filteredMaterials = getFilteredMaterials();
  const catName = materialCategoryId
    ? materialCategories.find(c => c.id == materialCategoryId)?.name
    : null;

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <label className="text-sm font-medium">加工工序流程</label>
        <button type="button" onClick={addProcessRow} className="text-teal-600 text-sm px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 active:bg-teal-100 transition-colors">
          <i className="fas fa-plus mr-1"></i>添加工序
        </button>
      </div>
      <div className="space-y-3">
        {productProcesses.map((p, i) => {
          const processName = processes.find(pr => pr.id == p.process_id)?.name || '';
          const matCount = (p.materials || []).filter(m => m.material_id).length;
          return (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* 工序主区域 — 桌面端横排 / 移动端纵排 */}
              <div className="bg-white p-3">
                {/* 第一行：序号 + 工序选择 + 删除按钮 */}
                <div className="flex items-center gap-2 mb-2 md:mb-0">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-gray-400 hidden md:inline">序号</span>
                    <input type="number" value={p.sequence !== undefined ? p.sequence : ''}
                      onChange={e => updateProcessRow(i, 'sequence', e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-12 border border-gray-200 rounded-lg px-2 py-2 md:py-1 text-center text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                  <select value={p.process_id}
                    onChange={e => updateProcessRow(i, 'process_id', e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 md:py-1 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                    <option value="">选择工序</option>
                    {processes.length > 0
                      ? processes.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)
                      : <option disabled>未获取到工序数据</option>}
                  </select>
                  <button type="button" onClick={() => removeProcessRow(i)}
                    className="shrink-0 w-9 h-9 md:w-7 md:h-7 rounded-lg bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors active:bg-red-200">
                    <i className="fas fa-trash text-sm"></i>
                  </button>
                </div>

                {/* 第二行：输出产物 + 委外 + 备注（移动端两列网格） */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className="text-[11px] text-gray-400 mb-0.5 block md:hidden">输出产物（可选）</label>
                    <select value={p.output_product_id || ''}
                      onChange={e => updateProcessRow(i, 'output_product_id', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 md:py-1 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" title="该工序完成后产出的半成品/成品">
                      <option value="">输出产物(可选)</option>
                      {allProducts.map(ap => <option key={ap.id} value={ap.id}>[{ap.category}] {ap.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 mb-0.5 block md:hidden">备注</label>
                    <input value={p.remark || ''}
                      onChange={e => updateProcessRow(i, 'remark', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 md:py-1 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" placeholder="备注" />
                  </div>
                  <div className="flex items-center gap-3 md:gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap bg-gray-50 md:bg-transparent px-3 py-2 md:p-0 rounded-lg border border-gray-200 md:border-none flex-1 md:flex-initial justify-center md:justify-start active:bg-gray-100 transition-colors">
                      <input type="checkbox" checked={p.is_outsourced}
                        onChange={e => updateProcessRow(i, 'is_outsourced', e.target.checked ? 1 : 0)}
                        className="w-5 h-5 md:w-4 md:h-4 text-teal-600 rounded" />
                      <span>委外加工</span>
                    </label>
                    <button type="button"
                      onClick={() => setExpandedMaterial(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`flex items-center gap-1.5 text-sm px-3 py-2 md:py-1 rounded-lg whitespace-nowrap transition-colors flex-1 md:flex-initial justify-center active:scale-95 ${
                        matCount > 0
                          ? 'bg-blue-50 text-blue-600 border border-blue-200 font-medium'
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600'
                      }`}
                      title="配置该工序所需物料">
                      <i className={`fas fa-cubes ${expandedMaterial[i] ? 'fa-rotate-90' : ''} transition-transform`}></i>
                      <span>物料{matCount > 0 ? ` (${matCount})` : ''}</span>
                      <i className={`fas fa-chevron-${expandedMaterial[i] ? 'up' : 'down'} text-[10px] ml-0.5`}></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* 物料绑定子面板 */}
              {expandedMaterial[i] && (
                <div className="bg-blue-50/40 border-t border-blue-100 px-3 md:px-4 py-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-blue-700">
                      <i className="fas fa-cubes mr-1"></i>工序「{processName || '未选择'}」所需物料
                    </span>
                    <button type="button" onClick={() => addMaterialRow(i)}
                      className="text-xs text-blue-600 hover:text-blue-800 bg-white px-2.5 py-1.5 rounded-lg border border-blue-200 active:bg-blue-50 transition-colors">
                      <i className="fas fa-plus mr-1"></i>添加物料
                    </button>
                  </div>
                  {(p.materials || []).length === 0 ? (
                    <div className="text-center text-xs text-gray-400 py-4 bg-white/60 rounded-lg border border-dashed border-blue-200">
                      <i className="fas fa-inbox text-lg text-gray-300 mb-1 block"></i>
                      暂未配置物料，点击"添加物料"以绑定该工序所需的原材料
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {p.materials.map((m, mi) => (
                        <div key={mi} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100 shadow-sm">
                          <select value={m.material_id}
                            onChange={e => updateMaterialRow(i, mi, 'material_id', e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 md:py-1 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400">
                            <option value="">选择物料</option>
                            {(() => {
                              const raw = filteredMaterials.filter(m => m.category === '原材料');
                              const semi = filteredMaterials.filter(m => m.category === '半成品');
                              const fmtMat = (rm) => {
                                const prefix = rm.suppliers?.length ? `[${rm.suppliers.map(s => s.supplier_name).join('/')}] ` : '';
                                return `${prefix}${rm.name} (${rm.specification || rm.code})`;
                              };
                              if (filteredMaterials.length === 0) return <option disabled>{catName ? `无「${catName}」材质的物料` : '无可用物料'}</option>;
                              return (<>
                                {raw.length > 0 && <optgroup label="原材料">{raw.map(rm => <option key={rm.id} value={rm.id}>{fmtMat(rm)}</option>)}</optgroup>}
                                {semi.length > 0 && <optgroup label="半成品">{semi.map(rm => <option key={rm.id} value={rm.id}>{fmtMat(rm)}</option>)}</optgroup>}
                              </>);
                            })()}
                          </select>
                          <button type="button" onClick={() => removeMaterialRow(i, mi)}
                            className="shrink-0 w-9 h-9 md:w-7 md:h-7 rounded-lg bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors">
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {productProcesses.length === 0 && (
          <div className="text-center text-gray-400 py-10 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <i className="fas fa-stream text-3xl mb-2 text-gray-300 block"></i>
            <p className="text-sm">暂无工序配置</p>
            <p className="text-xs text-gray-400 mt-1">点击上方"添加工序"按钮开始配置生产流程</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessConfigPanel;
