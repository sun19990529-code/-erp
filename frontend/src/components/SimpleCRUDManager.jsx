import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Drawer from './Drawer';
import Pagination from './Pagination';
import SearchFilter from './SearchFilter';
import Table from './Table';

const SimpleCRUDManager = ({ 
  title, 
  apiPath, 
  columns, 
  fields, 
  searchFields = ['code', 'name'],
  filters = [],
  editPermission,
  deletePermission
}) => {
  const [data, setData] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null });
  const [searchText, setSearchText] = useState('');
  const [filterValues, setFilterValues] = useState({});
  
  const load = () => api.get(`/${apiPath}`).then(res => res.success && setData(res.data));
  useEffect(() => { load(); }, []);
  
  const filteredData = data.filter(item => {
    const matchSearch = !searchText || searchFields.some(f => 
      (item[f] || '').toLowerCase().includes(searchText.toLowerCase())
    );
    const matchFilters = filters.every(f => !filterValues[f.key] || item[f.key] == filterValues[f.key]);
    return matchSearch && matchFilters;
  });
  
  const resetFilters = () => { setSearchText(''); setFilterValues({}); };
  
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const obj = {};
    fields.forEach(f => obj[f.name] = fd.get(f.name));
    const res = modal.item ? await api.put(`/${apiPath}/${modal.item.id}`, obj) : await api.post(`/${apiPath}`, obj);
    if (res.success) { setModal({ open: false, item: null }); load(); }
    else window.__toast?.error(res.message);
  };
  
  const del = async (item) => {
    if (!confirm('确定删除？')) return;
    const res = await api.del(`/${apiPath}/${item.id}`);
    res.success ? load() : window.__toast?.error(res.message);
  };

  const renderField = (f) => {
    if (f.type === 'select') {
      return (
        <select name={f.name} defaultValue={modal.item?.[f.name]} className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors">
          {f.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return (
        <textarea 
          name={f.name} 
          defaultValue={modal.item?.[f.name]} 
          className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors" 
          rows={f.rows || 3}
          placeholder={f.placeholder}
        />
      );
    }
    return (
      <input 
        name={f.name} 
        type={f.type || 'text'} 
        defaultValue={modal.item?.[f.name]} 
        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors" 
        required={f.required}
        placeholder={f.placeholder}
      />
    );
  };

  return (
    <div className="fade-in h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-bold text-gray-800">{title}管理</h2>
        <button onClick={() => setModal({ open: true, item: null })} className="bg-teal-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-teal-500 hover:shadow-md transition-all text-sm font-medium flex items-center gap-2"><i className="fas fa-plus"></i>新增记录</button>
      </div>
      <SearchFilter
        searchPlaceholder={`搜索${searchFields.join('/')}...`}
        searchValue={searchText}
        onSearchChange={setSearchText}
        filters={filters.map(f => ({ ...f, value: filterValues[f.key] }))}
        onFilterChange={(key, val) => setFilterValues(prev => ({ ...prev, [key]: val }))}
        onReset={resetFilters}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 overflow-hidden">
        <Table columns={columns} data={filteredData} onEdit={item => setModal({ open: true, item })} onDelete={del} editPermission={editPermission} deletePermission={deletePermission} />
      </div>

      <Drawer isOpen={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? `编辑${title}` : `新增${title}`}>
        <form onSubmit={save} className="flex flex-col h-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 flex-1">
            {fields.map(f => (
              <div key={f.name} className={f.fullWidth ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</label>
                {renderField(f)}
              </div>
            ))}
          </div>
          {/* 底部固定操作栏 */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-100 sticky bottom-0 bg-white pb-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors font-medium">取消</button>
            <button type="submit" className="px-5 py-2.5 bg-teal-600 shadow-sm shadow-teal-500/30 text-white rounded-lg hover:bg-teal-500 transition-all font-medium">保存提交</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};

export default SimpleCRUDManager;
