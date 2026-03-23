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
    api.get('/processes').then(res => res.success && setProcesses(res.data));
    api.get('/suppliers').then(res => res.success && setAllSuppliers(res.data));
    api.get('/customers').then(res => res.success && setAllCustomers(res.data));
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
      length: dimensions.length ? parseFloat(dimensions.length) : null
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
  
  // 工序材料操作
  const addMaterialRow = (processIndex) => {
    const newProcesses = [...modal.productProcesses];
    if (!newProcesses[processIndex].materials) {
      newProcesses[processIndex].materials = [];
    }
    newProcesses[processIndex].materials.push({ material_id: '', quantity: 1, unit: '公斤', remark: '' });
    setModal({ ...modal, productProcesses: newProcesses });
  };
  
  const removeMaterialRow = (processIndex, materialIndex) => {
    const newProcesses = [...modal.productProcesses];
    newProcesses[processIndex].materials = newProcesses[processIndex].materials.filter((_, i) => i !== materialIndex);
    setModal({ ...modal, productProcesses: newProcesses });
  };
  
  const updateMaterialRow = (processIndex, materialIndex, field, value) => {
    const newProcesses = [...modal.productProcesses];
    newProcesses[processIndex].materials[materialIndex] = { 
      ...newProcesses[processIndex].materials[materialIndex], 
      [field]: value 
    };
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
            if (row.unit === '支' && row.outer_diameter && row.wall_thickness && row.length) {
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
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">加工工序流程</label>
                <button onClick={addProcessRow} className="text-teal-600 text-sm"><i className="fas fa-plus mr-1"></i>添加工序</button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs w-16">顺序</th>
                      <th className="px-3 py-2 text-left text-xs">工序</th>
                      <th className="px-3 py-2 text-left text-xs w-24">委外加工</th>
                      <th className="px-3 py-2 text-left text-xs">备注</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.productProcesses.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          <input type="number" value={p.sequence} onChange={e => updateProcessRow(i, 'sequence', parseInt(e.target.value) || 1)} className="w-12 border rounded px-2 py-1 text-center" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={p.process_id} onChange={e => updateProcessRow(i, 'process_id', e.target.value)} className="w-full border rounded px-2 py-1">
                            <option value="">选择工序</option>
                            {processes.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={p.is_outsourced} onChange={e => updateProcessRow(i, 'is_outsourced', e.target.checked ? 1 : 0)} className="w-4 h-4" />
                            <span className="text-sm">委外</span>
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <input value={p.remark || ''} onChange={e => updateProcessRow(i, 'remark', e.target.value)} className="w-full border rounded px-2 py-1" placeholder="备注" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeProcessRow(i)} className="text-red-600"><i className="fas fa-trash"></i></button>
                        </td>
                      </tr>
                    ))}
                    {modal.productProcesses.length === 0 && (
                      <tr><td colSpan="5" className="px-3 py-4 text-center text-gray-500">暂无工序配置，点击上方"添加工序"按钮</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-gray-700"><i className="fas fa-sitemap mr-2"></i>加工工序流程</h4>
                  <button type="button" onClick={addProcessRow} className="text-teal-600 text-sm"><i className="fas fa-plus mr-1"></i>添加工序</button>
                </div>
                
                {modal.productProcesses.map((p, processIndex) => (
                  <div key={processIndex} className="border rounded-lg mb-3 overflow-hidden">
                    <div className="bg-gray-50 p-3 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">顺序:</span>
                        <input type="number" value={p.sequence} onChange={e => updateProcessRow(processIndex, 'sequence', parseInt(e.target.value) || 1)} className="w-16 border rounded px-2 py-1 text-center" />
                      </div>
                      <div className="flex-1">
                        <select value={p.process_id} onChange={e => updateProcessRow(processIndex, 'process_id', e.target.value)} className="w-full border rounded px-2 py-1">
                          <option value="">选择工序</option>
                          {processes.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={p.is_outsourced} onChange={e => updateProcessRow(processIndex, 'is_outsourced', e.target.checked ? 1 : 0)} className="w-4 h-4" />
                        <span className="text-sm">委外</span>
                      </label>
                      <input value={p.remark || ''} onChange={e => updateProcessRow(processIndex, 'remark', e.target.value)} className="w-32 border rounded px-2 py-1" placeholder="备注" />
                      <button type="button" onClick={() => removeProcessRow(processIndex)} className="text-red-600"><i className="fas fa-trash"></i></button>
                    </div>
                    
                    {/* 工序材料配置 - 仅顺序为1的工序显示 */}
                    {p.sequence === 1 && (
                      <div className="p-3 border-t bg-blue-50">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-blue-700"><i className="fas fa-cubes mr-1"></i>该工序所需材料</span>
                          <button type="button" onClick={() => addMaterialRow(processIndex)} className="text-blue-600 text-sm"><i className="fas fa-plus mr-1"></i>添加材料</button>
                        </div>
                        
                        {p.materials && p.materials.length > 0 ? (
                          <div className="space-y-2">
                            {p.materials.map((m, matIndex) => (
                              <div key={matIndex} className="flex items-center gap-2 bg-white p-2 rounded">
                                <select value={m.material_id} onChange={e => updateMaterialRow(processIndex, matIndex, 'material_id', e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm">
                                  <option value="">选择材料</option>
                                  <optgroup label="原材料">
                                    {rawMaterials.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                                  </optgroup>
                                  <optgroup label="半成品">
                                    {semiProducts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                  </optgroup>
                                </select>
                                <input type="number" step="0.01" value={m.quantity} onChange={e => updateMaterialRow(processIndex, matIndex, 'quantity', parseFloat(e.target.value) || 0)} className="w-20 border rounded px-2 py-1 text-sm" placeholder="数量" />
                                <select value={m.unit || '公斤'} onChange={e => updateMaterialRow(processIndex, matIndex, 'unit', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm">
                                  <option value="公斤">公斤</option>
                                  <option value="支">支</option>
                                </select>
                                <input value={m.remark || ''} onChange={e => updateMaterialRow(processIndex, matIndex, 'remark', e.target.value)} className="w-24 border rounded px-2 py-1 text-sm" placeholder="备注" />
                                <button type="button" onClick={() => removeMaterialRow(processIndex, matIndex)} className="text-red-500 text-sm"><i className="fas fa-times"></i></button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">暂无材料配置</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {modal.productProcesses.length === 0 && (
                  <div className="border rounded-lg p-4 text-center text-gray-500">
                    暂无工序配置，点击上方"添加工序"按钮
                  </div>
                )}
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

export { SupplierManager, CustomerManager, DepartmentManager, ProductManager };
