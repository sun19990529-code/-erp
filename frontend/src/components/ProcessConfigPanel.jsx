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
  materialCategoryId = '',
  materialCategories = [],
  onChange,
}) => {
  const [expandedMaterial, setExpandedMaterial] = useState({});

  const updateProcesses = (newList) => onChange(newList);

  const addProcessRow = () => {
    updateProcesses([
      ...productProcesses,
      { process_id: '', sequence: productProcesses.length + 1, is_outsourced: 0, remark: '', materials: [] }
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
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium">加工工序流程</label>
        <button type="button" onClick={addProcessRow} className="text-teal-600 text-sm">
          <i className="fas fa-plus mr-1"></i>添加工序
        </button>
      </div>
      <div className="space-y-2">
        {productProcesses.map((p, i) => {
          const processName = processes.find(pr => pr.id == p.process_id)?.name || '';
          const matCount = (p.materials || []).filter(m => m.material_id).length;
          return (
            <div key={i} className="border rounded-lg overflow-hidden">
              {/* 工序主行 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white">
                <input type="number" value={p.sequence}
                  onChange={e => updateProcessRow(i, 'sequence', parseInt(e.target.value) || 1)}
                  className="w-12 border rounded px-2 py-1 text-center text-sm" />
                <select value={p.process_id}
                  onChange={e => updateProcessRow(i, 'process_id', e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-sm">
                  <option value="">选择工序</option>
                  {processes.length > 0
                    ? processes.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)
                    : <option disabled>未获取到工序数据</option>}
                </select>
                <label className="flex items-center gap-1 cursor-pointer text-sm whitespace-nowrap">
                  <input type="checkbox" checked={p.is_outsourced}
                    onChange={e => updateProcessRow(i, 'is_outsourced', e.target.checked ? 1 : 0)}
                    className="w-4 h-4" />
                  委外
                </label>
                <input value={p.remark || ''}
                  onChange={e => updateProcessRow(i, 'remark', e.target.value)}
                  className="w-28 border rounded px-2 py-1 text-sm" placeholder="备注" />
                <button type="button"
                  onClick={() => setExpandedMaterial(prev => ({ ...prev, [i]: !prev[i] }))}
                  className={`text-xs px-2 py-1 rounded whitespace-nowrap transition-colors ${
                    matCount > 0
                      ? 'bg-blue-50 text-blue-600 border border-blue-200'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                  title="配置该工序所需物料">
                  <i className="fas fa-cubes mr-1"></i>物料{matCount > 0 ? `(${matCount})` : ''}
                </button>
                <button type="button" onClick={() => removeProcessRow(i)}
                  className="text-red-400 hover:text-red-600 px-1">
                  <i className="fas fa-trash text-sm"></i>
                </button>
              </div>

              {/* 物料绑定子面板 */}
              {expandedMaterial[i] && (
                <div className="bg-blue-50/40 border-t border-blue-100 px-4 py-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-blue-700">
                      <i className="fas fa-cubes mr-1"></i>工序「{processName || '未选择'}」所需物料
                    </span>
                    <button type="button" onClick={() => addMaterialRow(i)}
                      className="text-xs text-blue-600 hover:text-blue-800">
                      <i className="fas fa-plus mr-1"></i>添加物料
                    </button>
                  </div>
                  {(p.materials || []).length === 0 ? (
                    <div className="text-center text-xs text-gray-400 py-2">
                      暂未配置物料，点击"添加物料"以绑定该工序所需的原材料
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {p.materials.map((m, mi) => (
                        <div key={mi} className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-blue-100">
                          <select value={m.material_id}
                            onChange={e => updateMaterialRow(i, mi, 'material_id', e.target.value)}
                            className="flex-1 border rounded px-2 py-1 text-sm">
                            <option value="">选择原材料</option>
                            {filteredMaterials.length > 0
                              ? filteredMaterials.map(rm => (
                                  <option key={rm.id} value={rm.id}>
                                    [{rm.category}] {rm.name} ({rm.specification || rm.code})
                                  </option>
                                ))
                              : <option disabled>{catName ? `无「${catName}」材质的原材料` : '无可用原材料'}</option>}
                          </select>
                          <button type="button" onClick={() => removeMaterialRow(i, mi)}
                            className="text-red-400 hover:text-red-600">
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
          <div className="text-center text-gray-500 py-8 border rounded-lg">
            暂无工序配置，点击上方"添加工序"按钮
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessConfigPanel;
