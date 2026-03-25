import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import Table from '../components/Table';
import SimpleCRUDManager from '../components/SimpleCRUDManager';
import ProcessConfigPanel from '../components/ProcessConfigPanel';

const SupplierManager = () => (
  <SimpleCRUDManager
    title="供应商"
    apiPath="suppliers"
    searchFields={['code', 'name', 'contact_person']}
    columns={[
      { key: 'code', title: '编码' },
      { key: 'name', title: '名称' },
      { key: 'contact_person', title: '联系人' },
      { key: 'phone', title: '电话' },
      { key: 'status', title: '状态', render: v => v === 1 ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span> }
    ]}
    fields={[
      { name: 'code', label: '编码', required: true },
      { name: 'name', label: '名称', required: true },
      { name: 'contact_person', label: '联系人' },
      { name: 'phone', label: '电话' },
      { name: 'email', label: '邮箱', type: 'email' },
      { name: 'address', label: '地址' }
    ]}
    filters={[{ key: 'status', label: '状态', options: [{ value: '1', label: '启用' }, { value: '0', label: '禁用' }] }]}
    editPermission="basic_data_edit"
    deletePermission="basic_data_delete"
    hasStatus={true}
  />
);

const CustomerManager = () => (
  <SimpleCRUDManager
    title="客户"
    apiPath="customers"
    searchFields={['code', 'name', 'contact_person']}
    columns={[
      { key: 'code', title: '编码' },
      { key: 'name', title: '名称' },
      { key: 'contact_person', title: '联系人' },
      { key: 'phone', title: '电话' },
      { key: 'credit_level', title: '信用等级' },
      { key: 'status', title: '状态', render: v => v === 1 ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span> }
    ]}
    fields={[
      { name: 'code', label: '编码', required: true },
      { name: 'name', label: '名称', required: true },
      { name: 'contact_person', label: '联系人' },
      { name: 'phone', label: '电话' },
      { name: 'email', label: '邮箱', type: 'email' },
      { name: 'credit_level', label: '信用等级', type: 'select', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }] },
      { name: 'address', label: '地址', fullWidth: true }
    ]}
    filters={[
      { key: 'status', label: '状态', options: [{ value: '1', label: '启用' }, { value: '0', label: '禁用' }] },
      { key: 'credit_level', label: '信用等级', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }] }
    ]}
    editPermission="basic_data_edit"
    deletePermission="basic_data_delete"
    hasStatus={true}
  />
);

const DepartmentManager = () => (
  <SimpleCRUDManager
    title="部门"
    apiPath="departments"
    searchFields={['name', 'description']}
    columns={[
      { key: 'id', title: 'ID' },
      { key: 'name', title: '部门名称' },
      { key: 'description', title: '描述' },
      { key: 'created_at', title: '创建时间', render: v => v?.slice(0, 10) }
    ]}
    fields={[
      { name: 'name', label: '部门名称', required: true, fullWidth: true },
      { name: 'description', label: '描述', type: 'textarea', fullWidth: true, rows: 3 }
    ]}
    editPermission="basic_data_edit"
    deletePermission="basic_data_delete"
  />
);

const ProductManager = ({ category }) => {
  const [data, setData] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]); // 原材料列表（用于工序材料配置）
  const [semiProducts, setSemiProducts] = useState([]); // 半成品列表（用于工序材料配置）
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [materialCategories, setMaterialCategories] = useState([]); // 材质分类（扁平）
  const [selectedMaterialCategoryId, setSelectedMaterialCategoryId] = useState('');
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState('');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, mode: 'list', productProcesses: [] });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // 尺寸字段状态
  const [dimensions, setDimensions] = useState({ outer_diameter: '', inner_diameter: '', wall_thickness: '', length: '' });
  const [selectedUnit, setSelectedUnit] = useState('');
  
  // 判断是否为成品
  const isFinishedProduct = category === '成品';
  
  // 计算壁厚：(外径 - 内径) / 2
  const calculateWallThickness = (outer, inner) => {
    if (outer && inner && !isNaN(outer) && !isNaN(inner)) {
      return ((parseFloat(outer) - parseFloat(inner)) / 2).toFixed(2);
    }
    return '';
  };
  
  // 计算每支公斤数：((外径-壁厚)*壁厚)*0.02491*长度
  const calculateKgPerPiece = (outerDiameter, wallThickness, length) => {
    if (outerDiameter && wallThickness && length) {
      const outer = parseFloat(outerDiameter) || 0;
      const wall = parseFloat(wallThickness) || 0;
      const len = parseFloat(length) || 0;
      return ((outer - wall) * wall * 0.02491 * len).toFixed(4);
    }
    return null;
  };
  
  // 处理尺寸字段变化并自动计算
  const handleDimensionChange = (field, value) => {
    const newDimensions = { ...dimensions, [field]: value };
    
    // 如果修改了外径或内径，自动计算壁厚
    if (field === 'outer_diameter' || field === 'inner_diameter') {
      const wall = calculateWallThickness(newDimensions.outer_diameter, newDimensions.inner_diameter);
      newDimensions.wall_thickness = wall;
    }
    
    setDimensions(newDimensions);
  };
  
  // 打开编辑时加载尺寸数据（成品还需加载工序配置）
  const openEdit = async (item) => {
    setDimensions({
      outer_diameter: item.outer_diameter || '',
      inner_diameter: item.inner_diameter || '',
      wall_thickness: item.wall_thickness || '',
      length: item.length || ''
    });
    setSelectedUnit(item.unit || '公斤');
    const catId = item.material_category_id || '';
    setSelectedMaterialCategoryId(catId);
    // 自动推算大类
    if (catId) {
      const cat = materialCategories.find(c => c.id == catId);
      setSelectedParentCategoryId(cat?.parent_id ? String(cat.parent_id) : String(catId));
    } else {
      setSelectedParentCategoryId('');
    }
    
    // 成品加载工序配置
    if (isFinishedProduct) {
      const res = await api.get(`/products/${item.id}/processes`);
      const processesWithMaterials = await Promise.all((res.data || []).map(async (p) => {
        const matRes = await api.get(`/product-processes/${p.id}/materials`);
        return { ...p, materials: matRes.data || [] };
      }));
      setModal({ open: true, item, mode: 'edit', productProcesses: processesWithMaterials });
    } else {
      setModal({ open: true, item, mode: 'edit', productProcesses: [] });
    }
    // 加载已绑定的供应商/客户
    setSelectedSupplierIds((item.suppliers || []).map(s => s.supplier_id));
    setSelectedCustomerIds((item.customers || []).map(c => c.customer_id));
  };
  
  const categoryLabel = category === '原材料' ? '原材料' : category === '半成品' ? '半成品' : '成品';
  const title = `${categoryLabel}管理`;
  
  const load = () => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    api.get(`/products${params}`).then(res => res.success && setData(res.data));
    api.get('/production/processes').then(res => res.success && setProcesses(res.data));
    api.get('/suppliers').then(res => res.success && setAllSuppliers(res.data));
    api.get('/customers').then(res => res.success && setAllCustomers(res.data));
    api.get('/material-categories?flat=1').then(res => res.success && setMaterialCategories(res.data));
    if (isFinishedProduct) {
      api.get('/products?category=原材料').then(res => res.success && setRawMaterials(res.data));
      api.get('/products?category=半成品').then(res => res.success && setSemiProducts(res.data));
    }
  };
  useEffect(() => { load(); }, [category]);
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.specification || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || item.status == statusFilter;
    return matchSearch && matchStatus;
  });
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); };
  
  const openProcessConfig = async (item) => {
    const res = await api.get(`/products/${item.id}/processes`);
    setModal({ open: true, item, mode: 'process', productProcesses: res.data || [] });
  };
  
  const closeModal = () => {
    setModal({ open: false, item: null, mode: 'list', productProcesses: [] });
    setDimensions({ outer_diameter: '', inner_diameter: '', wall_thickness: '', length: '' });
    setSelectedUnit('');
    setSelectedMaterialCategoryId('');
    setSelectedParentCategoryId('');
    setSelectedSupplierIds([]);
    setSelectedCustomerIds([]);
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = { 
      code: fd.get('code'), 
      name: fd.get('name'), 
      specification: fd.get('specification'), 
      unit: fd.get('unit'), 
      category: fd.get('category'), 
      min_stock: parseInt(fd.get('min_stock')) || 0,
      max_stock: parseInt(fd.get('max_stock')) || 0,
      outer_diameter: dimensions.outer_diameter ? parseFloat(dimensions.outer_diameter) : null,
      inner_diameter: dimensions.inner_diameter ? parseFloat(dimensions.inner_diameter) : null,
      wall_thickness: dimensions.wall_thickness ? parseFloat(dimensions.wall_thickness) : null,
      length: dimensions.length ? parseFloat(dimensions.length) : null,
      material_category_id: selectedMaterialCategoryId ? parseInt(selectedMaterialCategoryId) : null
    };
    
    // 保存产品
    let productId = modal.item?.id;
    let res;
    if (modal.item) {
      res = await api.put(`/products/${modal.item.id}`, obj);
    } else {
      res = await api.post('/products', obj);
      if (res.success && res.data?.id) {
        productId = res.data.id;
      }
    }
    
    // 成品保存工序配置
    if (res.success && isFinishedProduct && productId) {
      const processesToSave = modal.productProcesses.filter(p => p.process_id);
      if (processesToSave.length > 0) {
        await api.post(`/products/${productId}/processes`, { processes: processesToSave });
      }
    }
    
    // 保存供应商/客户绑定
    if (res.success && productId) {
      if (category === '原材料' || category === '半成品') {
        await api.put(`/products/${productId}/suppliers`, { supplier_ids: selectedSupplierIds });
      }
      if (category === '成品') {
        await api.put(`/products/${productId}/customers`, { customer_ids: selectedCustomerIds });
      }
    }
    
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    if (!confirm('确定删除？')) return;
    const res = await api.del(`/products/${item.id}`);
    res.success ? load() : window.__toast?.error(res.message);
  };
  
  // 工序配置更新回调
  const handleProcessChange = (newProcesses) => {
    setModal({ ...modal, productProcesses: newProcesses });
  };
  
  const saveProcesses = async () => {
    const processesToSave = modal.productProcesses.filter(p => p.process_id);
    const res = await api.post(`/products/${modal.item.id}/processes`, { processes: processesToSave });
    if (res.success) { closeModal(); load(); }
    else window.__toast?.error(res.message);
  };

  const categoryLabels = { '原材料': '原材料', '半成品': '半成品', '成品': '成品' };
  
  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={() => setModal({ open: true, item: null, mode: 'edit', productProcesses: [] })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增{categoryLabel}</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索编码/名称/规格..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[{ key: 'status', label: '状态', value: statusFilter, options: [{ value: '1', label: '启用' }, { value: '0', label: '禁用' }] }]}
        onFilterChange={(key, val) => key === 'status' && setStatusFilter(val)}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow">
        <Table columns={[
          { key: 'code', title: '编码' },
          { key: 'name', title: '名称' },
          { key: 'specification', title: '规格' },
          { key: 'category', title: '类别', render: v => <span className="px-2 py-1 bg-gray-100 rounded text-xs">{v}</span> },
          { key: 'unit', title: '单位' },
          { key: 'kg_per_piece', title: '每支公斤', render: (v, row) => {
            if (row.outer_diameter && row.wall_thickness && row.length) {
              const kgPerPiece = ((parseFloat(row.outer_diameter) - parseFloat(row.wall_thickness)) * parseFloat(row.wall_thickness) * 0.02491 * parseFloat(row.length)).toFixed(4);
              return <span className="text-teal-600 font-medium">{kgPerPiece}</span>;
            }
            return '-';
          }},
          { key: 'status', title: '状态', render: v => v === 1 ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span> },
          ...(category === '原材料' || category === '半成品' ? [{
            key: 'suppliers', title: '绑定供应商', render: (v) => {
              if (!v || v.length === 0) return <span className="text-gray-400">-</span>;
              return <span className="text-xs">{v.map(s => s.supplier_name).join(', ')}</span>;
            }
          }] : []),
          ...(category === '成品' ? [{
            key: 'customers', title: '绑定客户', render: (v) => {
              if (!v || v.length === 0) return <span className="text-gray-400">-</span>;
              return <span className="text-xs">{v.map(c => c.customer_name).join(', ')}</span>;
            }
          }] : [])
        ]} data={filteredData} 
          onEdit={openEdit} 
          onDelete={del}
          onView={isFinishedProduct ? openProcessConfig : null}
          editPermission="basic_data_edit"
          deletePermission="basic_data_delete"
        />
      </div>
      <Modal isOpen={modal.open} onClose={closeModal} title={modal.mode === 'process' ? '工序流程配置' : modal.item ? '编辑产品' : '新增产品'} size={modal.mode === 'process' ? 'max-w-3xl' : 'max-w-2xl'}>
        {modal.mode === 'process' ? (
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center gap-4">
                <span className="font-bold">{modal.item?.name}</span>
                <span className="text-gray-500">{modal.item?.code}</span>
                <span className="px-2 py-1 bg-gray-200 rounded text-xs">{modal.item?.category}</span>
              </div>
            </div>
            <ProcessConfigPanel
                processes={processes}
                productProcesses={modal.productProcesses}
                rawMaterials={rawMaterials}
                materialCategoryId={selectedMaterialCategoryId || modal.item?.material_category_id}
                materialCategories={materialCategories}
                onChange={handleProcessChange}
              />
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={saveProcesses} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存配置</button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">编码 *</label><input name="code" defaultValue={modal.item?.code} className="w-full border rounded-lg px-3 py-2" required /></div>
              <div><label className="block text-sm font-medium mb-1">名称 *</label><input name="name" defaultValue={modal.item?.name} className="w-full border rounded-lg px-3 py-2" required /></div>
              <div><label className="block text-sm font-medium mb-1">规格</label><input name="specification" defaultValue={modal.item?.specification} className="w-full border rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium mb-1">单位 *</label>
                <select name="unit" value={selectedUnit || modal.item?.unit || '公斤'} onChange={e => setSelectedUnit(e.target.value)} className="w-full border rounded-lg px-3 py-2" required>
                  <option value="公斤">公斤</option>
                  <option value="吨">吨</option>
                  <option value="支">支</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">类别 *</label>
                {category ? (
                  <input type="hidden" name="category" value={category} />
                ) : (
                  <select name="category" defaultValue={modal.item?.category} className="w-full border rounded-lg px-3 py-2" required>
                    <option value="原材料">原材料</option>
                    <option value="半成品">半成品</option>
                    <option value="成品">成品</option>
                  </select>
                )}
                {category && <span className="px-3 py-2 bg-gray-100 rounded-lg inline-block">{category}</span>}
              </div>
              <div><label className="block text-sm font-medium mb-1">最低安全库存(kg)</label><input name="min_stock" type="number" defaultValue={modal.item?.min_stock || 0} className="w-full border rounded-lg px-3 py-2" placeholder="低于此数量全系统红盘预警" /></div>
              <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1">最高库存上限(kg)</label><input name="max_stock" type="number" defaultValue={modal.item?.max_stock || 0} className="w-full border rounded-lg px-3 py-2" placeholder="到达最高限系统防呆介入" /></div>
              <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">材质分类</label>
                  {(() => {
                    const topLevels = materialCategories.filter(c => !c.parent_id);
                    const children = selectedParentCategoryId ? materialCategories.filter(c => String(c.parent_id) === String(selectedParentCategoryId)) : [];
                    return (
                      <div className="flex gap-2">
                        <select
                          value={selectedParentCategoryId}
                          onChange={e => {
                            const pid = e.target.value;
                            setSelectedParentCategoryId(pid);
                            if (!pid) { setSelectedMaterialCategoryId(''); return; }
                            const subs = materialCategories.filter(c => String(c.parent_id) === pid);
                            // 无子分类→直接选中大类本身，有子分类→等用户选
                            setSelectedMaterialCategoryId(subs.length > 0 ? '' : pid);
                          }}
                          className="flex-1 border rounded-lg px-3 py-2"
                        >
                          <option value="">选择大类</option>
                          {topLevels.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                        </select>
                        {children.length > 0 && (
                          <select
                            value={String(selectedMaterialCategoryId)}
                            onChange={e => setSelectedMaterialCategoryId(e.target.value || '')}
                            className="flex-1 border rounded-lg px-3 py-2"
                          >
                            <option value="">选择牌号</option>
                            {children.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })()}
                </div>
            </div>
            
            {/* 尺寸参数区域 */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3"><i className="fas fa-ruler-combined mr-2"></i>尺寸参数 (mm)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">外径</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={dimensions.outer_diameter} 
                    onChange={e => handleDimensionChange('outer_diameter', e.target.value)} 
                    className="w-full border rounded-lg px-3 py-2" 
                    placeholder="外径" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">内径</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={dimensions.inner_diameter} 
                    onChange={e => handleDimensionChange('inner_diameter', e.target.value)} 
                    className="w-full border rounded-lg px-3 py-2" 
                    placeholder="内径" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">壁厚 <span className="text-gray-400 text-xs">(自动计算)</span></label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={dimensions.wall_thickness} 
                    readOnly
                    className="w-full border rounded-lg px-3 py-2 bg-gray-50 text-gray-600" 
                    placeholder="(外径-内径)/2" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">长度</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={dimensions.length} 
                    onChange={e => handleDimensionChange('length', e.target.value)} 
                    className="w-full border rounded-lg px-3 py-2" 
                    placeholder="长度" 
                  />
                </div>
              </div>
              
              {/* 每支公斤数计算结果 */}
              <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-teal-800"><i className="fas fa-calculator mr-2"></i>每支公斤数：</span>
                  <span className="text-lg font-bold text-teal-700">
                    {calculateKgPerPiece(dimensions.outer_diameter, dimensions.wall_thickness, dimensions.length) || '--'} kg/支
                  </span>
                </div>
                <p className="text-xs text-teal-600 mt-1">
                  计算公式：((外径-壁厚)×壁厚)×0.02491×长度 = 单支公斤数
                </p>
              </div>
              
              <p className="text-xs text-gray-500 mt-2">提示：输入外径和内径后，壁厚将自动计算 = (外径 - 内径) / 2</p>
            </div>
            
            {/* 供应商绑定区域（原材料+半成品） */}
            {(category === '原材料' || category === '半成品') && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3"><i className="fas fa-truck mr-2"></i>绑定供应商 <span className="text-gray-400 text-xs">(可多选)</span></h4>
                <div className="flex flex-wrap gap-2">
                  {allSuppliers.map(s => (
                    <label key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      selectedSupplierIds.includes(s.id) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedSupplierIds.includes(s.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedSupplierIds([...selectedSupplierIds, s.id]);
                          else setSelectedSupplierIds(selectedSupplierIds.filter(id => id !== s.id));
                        }}
                        className="w-4 h-4 text-teal-600"
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                  {allSuppliers.length === 0 && <span className="text-gray-400 text-sm">暂无供应商数据</span>}
                </div>
              </div>
            )}
            
            {/* 客户绑定区域（成品） */}
            {category === '成品' && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3"><i className="fas fa-users mr-2"></i>绑定客户 <span className="text-gray-400 text-xs">(可多选，一个产品可供给多个客户)</span></h4>
                <div className="flex flex-wrap gap-2">
                  {allCustomers.map(c => (
                    <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      selectedCustomerIds.includes(c.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(c.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedCustomerIds([...selectedCustomerIds, c.id]);
                          else setSelectedCustomerIds(selectedCustomerIds.filter(id => id !== c.id));
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                  {allCustomers.length === 0 && <span className="text-gray-400 text-sm">暂无客户数据</span>}
                </div>
              </div>
            )}
            
            {/* 成品工序配置区域 */}
            {isFinishedProduct && (
              <div className="border-t pt-4 mt-4">
                <ProcessConfigPanel
                  processes={processes}
                  productProcesses={modal.productProcesses}
                  rawMaterials={rawMaterials}
                  materialCategoryId={selectedMaterialCategoryId || modal.item?.material_category_id}
                  materialCategories={materialCategories}
                  onChange={handleProcessChange}
                />
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==================== 材质分类管理 ====================
const MaterialCategoryManager = () => {
  const [tree, setTree] = useState([]);
  const [flat, setFlat] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });

  const load = () => {
    api.get('/material-categories').then(res => res.success && setTree(res.data));
    api.get('/material-categories?flat=1').then(res => res.success && setFlat(res.data));
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = {
      name: fd.get('name'),
      parent_id: fd.get('parent_id') || null,
      sort_order: parseInt(fd.get('sort_order')) || 0,
      description: fd.get('description')
    };
    if (modal.item?.id) {
      await api.put(`/material-categories/${modal.item.id}`, obj);
    } else {
      await api.post('/material-categories', obj);
    }
    setModal({ open: false, item: null });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定删除该分类？')) return;
    const res = await api.del(`/material-categories/${id}`);
    if (!res.success) alert(res.message);
    load();
  };

  const handleReorder = async (id, direction) => {
    await api.post('/material-categories/reorder', { id, direction });
    load();
  };

  const renderTree = (nodes, depth = 0) => (
    nodes.map((n, idx) => (
      <React.Fragment key={n.id}>
        <tr className="hover:bg-gray-50">
          <td className="px-4 py-3" style={{ paddingLeft: `${depth * 24 + 16}px` }}>
            {n.children?.length > 0 && <i className="fas fa-folder-open text-amber-500 mr-2"></i>}
            {(!n.children || n.children.length === 0) && <i className="fas fa-tag text-teal-500 mr-2"></i>}
            <span className={depth === 0 ? 'font-bold' : ''}>{n.name}</span>
          </td>
          <td className="px-4 py-3 text-sm text-gray-500">{n.description || '-'}</td>
          <td className="px-4 py-3">
            <button onClick={() => handleReorder(n.id, 'up')} className={`mr-1 ${idx === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-800'}`} disabled={idx === 0} title="上移"><i className="fas fa-arrow-up"></i></button>
            <button onClick={() => handleReorder(n.id, 'down')} className={`mr-3 ${idx === nodes.length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-800'}`} disabled={idx === nodes.length - 1} title="下移"><i className="fas fa-arrow-down"></i></button>
            <button onClick={() => setModal({ open: true, item: { parent_id: n.id } })} className="text-teal-600 hover:text-teal-800 mr-3" title="新增子分类"><i className="fas fa-plus"></i></button>
            <button onClick={() => setModal({ open: true, item: n })} className="text-blue-600 hover:text-blue-800 mr-3" title="编辑"><i className="fas fa-edit"></i></button>
            <button onClick={() => handleDelete(n.id)} className="text-red-500 hover:text-red-700" title="删除"><i className="fas fa-trash"></i></button>
          </td>
        </tr>
        {n.children && renderTree(n.children, depth + 1)}
      </React.Fragment>
    ))
  );

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">材质分类管理</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700">
          <i className="fas fa-plus mr-2"></i>新增大类
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">分类名称</th>
              <th className="px-4 py-3 text-left">描述</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tree.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">暂无分类数据</td></tr>
            ) : renderTree(tree)}
          </tbody>
        </table>
      </div>

      {/* 弹窗：根据场景区分 */}
      {(() => {
        const isEdit = !!modal.item?.id;
        const isAddChild = modal.item?.parent_id && !modal.item?.id;
        const isAddRoot = !modal.item;
        // 判断是否为顶级分类（新增大类 或 编辑没有 parent_id 的分类）
        const isTopLevel = isAddRoot || (isEdit && !modal.item?.parent_id);
        const parentName = (isAddChild || (isEdit && modal.item?.parent_id))
          ? flat.find(c => c.id === modal.item.parent_id)?.name
          : null;
        const title = isEdit
          ? (isTopLevel ? '编辑大类' : `编辑子分类 — ${parentName || ''}`)
          : isAddChild ? `新增子分类 — ${parentName || ''}` : '新增大类';

        // 自动计算排序号：同级最大值 + 1
        const calcNextSort = () => {
          if (isEdit) return modal.item.sort_order;
          const parentId = isAddChild ? modal.item.parent_id : null;
          const siblings = flat.filter(c => (c.parent_id || null) === parentId);
          if (siblings.length === 0) return 1;
          return Math.max(...siblings.map(c => c.sort_order || 0)) + 1;
        };

        return (
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title={title}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">分类名称 *</label>
            <input name="name" defaultValue={isEdit ? modal.item?.name : ''} className="w-full border rounded-lg px-3 py-2" required placeholder={isTopLevel ? '如：不锈钢、合金、铜材' : '如：304、304L、316'} />
          </div>
          {/* 顶级分类（新增大类 / 编辑大类）：隐藏父级 */}
          {isTopLevel && <input type="hidden" name="parent_id" value="" />}
          {/* 非顶级（新增子分类 / 编辑子分类）：只读显示父级 */}
          {!isTopLevel && (
            <div>
              <label className="block text-sm font-medium mb-1">所属大类</label>
              <input type="text" value={parentName || ''} disabled className="w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-500" />
              <input type="hidden" name="parent_id" value={modal.item?.parent_id} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <input name="description" defaultValue={isEdit ? modal.item?.description : ''} className="w-full border rounded-lg px-3 py-2" placeholder="可选" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存</button>
          </div>
        </form>
      </Modal>
        );
      })()}
    </div>
  );
};

export { SupplierManager, CustomerManager, DepartmentManager, ProductManager, MaterialCategoryManager };
