import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import SearchFilter from '../components/SearchFilter';
import SearchSelect from '../components/SearchSelect';
import Table from '../components/Table';

const RoleManager = () => {
  const [data, setData] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, permissionIds: [] });
  const [searchText, setSearchText] = useState('');
  
  const load = () => {
    api.get('/roles').then(res => res.success && setData(res.data));
    api.get('/permissions').then(res => res.success && setPermissions(res.data));
  };
  useEffect(() => { load(); }, []);
  
  const filteredData = data.filter(item => {
    return !searchText || 
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase());
  });
  
  const resetFilters = () => setSearchText('');
  
  const openEdit = async (item) => {
    const res = await api.get(`/roles/${item.id}/permissions`);
    setModal({ open: true, item, permissionIds: res.success ? res.data.map(p => p.id) : [] });
  };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = { name: fd.get('name'), code: fd.get('code'), description: fd.get('description') };
    const res = modal.item ? await api.put(`/roles/${modal.item.id}`, obj) : await api.post('/roles', obj);
    if (res.success) { setModal({ open: false, item: null, permissionIds: [] }); load(); }
    else window.__toast?.error(res.message);
  };
  
  const savePermissions = async () => {
    const res = await api.put(`/roles/${modal.item.id}/permissions`, { permissionIds: modal.permissionIds });
    if (res.success) { setModal({ open: false, item: null, permissionIds: [] }); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    if (!confirm('确定删除？')) return;
    const res = await api.del(`/roles/${item.id}`);
    res.success ? load() : window.__toast?.error(res.message);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">角色管理</h2>
        <button onClick={() => setModal({ open: true, item: null, permissionIds: [] })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索编码/名称/描述..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow"><Table columns={[{ key: 'code', title: '编码' }, { key: 'name', title: '名称' }, { key: 'description', title: '描述' }]} data={filteredData} onEdit={openEdit} onDelete={del} editPermission="basic_data_edit" deletePermission="basic_data_delete" /></div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null, permissionIds: [] })} title={modal.item ? '编辑角色' : '新增角色'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">编码 *</label><input name="code" defaultValue={modal.item?.code} className="w-full border rounded-lg px-3 py-2" required /></div>
            <div><label className="block text-sm font-medium mb-1">名称 *</label><input name="name" defaultValue={modal.item?.name} className="w-full border rounded-lg px-3 py-2" required /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">描述</label><input name="description" defaultValue={modal.item?.description} className="w-full border rounded-lg px-3 py-2" /></div>
          {modal.item && (
            <div>
              <label className="block text-sm font-medium mb-2">权限设置</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-lg p-3 max-h-40 overflow-y-auto">
                {permissions.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={modal.permissionIds.includes(p.id)} onChange={(e) => {
                      if (e.target.checked) setModal({ ...modal, permissionIds: [...modal.permissionIds, p.id] });
                      else setModal({ ...modal, permissionIds: modal.permissionIds.filter(id => id !== p.id) });
                    }} className="w-4 h-4" />
                    <span className="text-sm">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setModal({ open: false, item: null, permissionIds: [] })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            {modal.item && <button type="button" onClick={savePermissions} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存权限</button>}
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const PermissionManager = () => {
  const [data, setData] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });
  const [searchText, setSearchText] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  
  const load = () => api.get('/permissions').then(res => res.success && setData(res.data));
  useEffect(() => { load(); }, []);
  
  const modules = [...new Set(data.map(item => item.module))];
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase());
    const matchModule = !moduleFilter || item.module === moduleFilter;
    return matchSearch && matchModule;
  });
  
  const resetFilters = () => { setSearchText(''); setModuleFilter(''); };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = { name: fd.get('name'), code: fd.get('code'), module: fd.get('module'), description: fd.get('description') };
    const res = modal.item ? await api.put(`/permissions/${modal.item.id}`, obj) : await api.post('/permissions', obj);
    if (res.success) { setModal({ open: false, item: null }); load(); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    if (!confirm('确定删除该权限？')) return;
    const res = await api.del(`/permissions/${item.id}`);
    res.success ? load() : window.__toast?.error(res.message);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">权限管理</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索编码/名称..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={[{ key: 'module', label: '模块', value: moduleFilter, options: modules.map(m => ({ value: m, label: m })) }]}
        onFilterChange={(key, val) => key === 'module' && setModuleFilter(val)}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow">
        <Table 
          columns={[
            { key: 'code', title: '编码', render: v => <span className="font-mono text-sm">{v}</span> },
            { key: 'name', title: '名称' },
            { key: 'module', title: '模块', render: v => <span className="px-2 py-1 bg-gray-100 rounded text-xs">{v}</span> },
            { key: 'description', title: '描述', render: v => <span className="text-gray-500">{v || '-'}</span> }
          ]} 
          data={filteredData} 
          onEdit={item => setModal({ open: true, item })} 
          onDelete={del}
          editPermission="basic_data_edit"
          deletePermission="basic_data_delete"
        />
      </div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? '编辑权限' : '新增权限'}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">编码 *</label><input name="code" defaultValue={modal.item?.code} className="w-full border rounded-lg px-3 py-2" placeholder="如：order_view" required /></div>
            <div><label className="block text-sm font-medium mb-1">名称 *</label><input name="name" defaultValue={modal.item?.name} className="w-full border rounded-lg px-3 py-2" placeholder="如：订单管理-查看" required /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">模块 *</label>
              <select name="module" defaultValue={modal.item?.module} className="w-full border rounded-lg px-3 py-2" required>
                <option value="">请选择模块</option>
                {[...new Set([...modules, '仓库管理', '订单管理', '生产管理', '质量检验', '采购管理', '委外加工', '基础数据'])].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium mb-1">描述</label><input name="description" defaultValue={modal.item?.description} className="w-full border rounded-lg px-3 py-2" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const UserManager = ({ userType }) => {
  const [data, setData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [extUserType, setExtUserType] = useState('supplier');
  
  const load = () => {
    api.get(`/users?user_type=${userType}`).then(res => res.success && setData(res.data));
    api.get('/departments').then(res => res.success && setDepartments(res.data));
    api.get('/roles').then(res => res.success && setRoles(res.data));
    api.get('/suppliers').then(res => res.success && setSuppliers(res.data));
    api.get('/customers').then(res => res.success && setCustomers(res.data));
  };
  useEffect(() => { load(); }, [userType]);
  
  const externalType = userType === 'external';

  // 打开 modal 时同步 extUserType
  const openModal = (item) => {
    setExtUserType(item?.user_type || 'supplier');
    setModal({ open: true, item });
  };
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || 
      (item.username || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.real_name || '').toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || item.status == statusFilter;
    const matchDept = externalType || !departmentFilter || item.department_name === departmentFilter;
    return matchSearch && matchStatus && matchDept;
  });
  
  const resetFilters = () => { setSearchText(''); setStatusFilter(''); setDepartmentFilter(''); };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = {
      username: fd.get('username'), password: fd.get('password'), real_name: fd.get('real_name'),
      user_type: externalType ? extUserType : 'internal',
      department_id: fd.get('department_id') ? parseInt(fd.get('department_id')) : null,
      role_id: fd.get('role_id') ? parseInt(fd.get('role_id')) : null,
      supplier_id: fd.get('supplier_id') ? parseInt(fd.get('supplier_id')) : null,
      customer_id: fd.get('customer_id') ? parseInt(fd.get('customer_id')) : null,
      status: fd.get('status') ? 1 : 0
    };
    if (!obj.password) delete obj.password;
    const res = modal.item ? await api.put(`/users/${modal.item.id}`, obj) : await api.post('/users', obj);
    if (res.success) { setModal({ open: false, item: null }); load(); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    if (!confirm('确定删除？')) return;
    const res = await api.del(`/users/${item.id}`);
    res.success ? load() : window.__toast?.error(res.message);
  };

  const title = userType === 'internal' ? '内部用户' : '外部用户';
  
  const columns = [
    { key: 'username', title: '用户名' },
    { key: 'real_name', title: '姓名' },
    { key: 'department_name', title: '部门' },
    { key: 'role_name', title: '角色' },
    { key: 'supplier_name', title: '供应商' },
    { key: 'customer_name', title: '客户' },
    { key: 'status', title: '状态', render: v => v === 1 ? <span className="text-green-600">启用</span> : <span className="text-red-600">禁用</span> }
  ];
  
  const filterOptions = externalType ? [
    { key: 'status', label: '状态', value: statusFilter, options: [{ value: '1', label: '启用' }, { value: '0', label: '禁用' }] }
  ] : [
    { key: 'department', label: '部门', value: departmentFilter, options: departments.map(d => ({ value: d.name, label: d.name })) },
    { key: 'status', label: '状态', value: statusFilter, options: [{ value: '1', label: '启用' }, { value: '0', label: '禁用' }] }
  ];

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <button onClick={() => openModal(null)} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"><i className="fas fa-plus mr-2"></i>新增</button>
      </div>
      <SearchFilter
        searchPlaceholder="搜索用户名/姓名..."
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={filterOptions}
        onFilterChange={(key, val) => { key === 'status' && setStatusFilter(val); key === 'department' && setDepartmentFilter(val); }}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow"><Table columns={columns.filter(c => !externalType || ['username', 'real_name', 'supplier_name', 'customer_name', 'status'].includes(c.key))} data={filteredData} onEdit={item => openModal(item)} onDelete={del} editPermission="basic_data_edit" deletePermission="basic_data_delete" /></div>
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? `编辑${title}` : `新增${title}`}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">用户名 *</label><input name="username" defaultValue={modal.item?.username} className="w-full border rounded-lg px-3 py-2" required /></div>
            <div><label className="block text-sm font-medium mb-1">姓名 *</label><input name="real_name" defaultValue={modal.item?.real_name} className="w-full border rounded-lg px-3 py-2" required /></div>
            <div><label className="block text-sm font-medium mb-1">密码 {modal.item && '(留空不修改)'}</label><input name="password" type="password" className="w-full border rounded-lg px-3 py-2" required={!modal.item} /></div>
            {!externalType && <>
              <div><label className="block text-sm font-medium mb-1">部门</label>
                <SearchSelect name="department_id" options={departments} value={modal.item?.department_id} placeholder="无" />
              </div>
              <div><label className="block text-sm font-medium mb-1">角色</label>
                <SearchSelect name="role_id" options={roles} value={modal.item?.role_id} placeholder="无" />
              </div>
            </>}
            {externalType && <>
              <div><label className="block text-sm font-medium mb-1">用户类型 *</label>
                <select name="user_type" value={extUserType} onChange={e => setExtUserType(e.target.value)} className="w-full border rounded-lg px-3 py-2" required>
                  <option value="supplier">供应商</option>
                  <option value="customer">客户</option>
                </select>
              </div>
              {extUserType === 'supplier' && (
                <div><label className="block text-sm font-medium mb-1">关联供应商</label>
                  <SearchSelect name="supplier_id" options={suppliers} value={modal.item?.supplier_id} placeholder="无" />
                </div>
              )}
              {extUserType === 'customer' && (
                <div><label className="block text-sm font-medium mb-1">关联客户</label>
                  <SearchSelect name="customer_id" options={customers} value={modal.item?.customer_id} placeholder="无" />
                </div>
              )}
            </>}
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="status" defaultChecked={modal.item?.status !== 0} className="w-4 h-4" />
                <span className="text-sm">启用</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export { RoleManager, PermissionManager, UserManager };
