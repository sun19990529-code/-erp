import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import { useConfirm } from '../components/ConfirmModal';

const StocktakePage = () => {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [operators, setOperators] = useState([]);
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState({ open: false, item: null, mode: 'list' });
  const [confirm, ConfirmDialog] = useConfirm();
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, pageSize: 20 });
  const [newProduct, setNewProduct] = useState({ product_id: '', batch_no: '', actual_quantity: '' });

  const load = async (page = 1) => {
    const qs = new URLSearchParams({ page, pageSize: 20 });
    if (statusFilter) qs.set('status', statusFilter);
    const [res, whRes, opRes, prRes] = await Promise.all([
      api.get(`/stocktake?${qs}`),
      api.get('/warehouses'),
      api.get('/operators'),
      api.get('/products')
    ]);
    if (res.success) {
      setData(res.data);
      if (res.pagination) setPagination(res.pagination);
    }
    if (whRes.success) setWarehouses(whRes.data);
    if (opRes?.success) setOperators(opRes.data);
    if (prRes?.success) setProducts(prRes.data);
  };

  useEffect(() => { load(); }, []);

  const addNewItem = () => {
    if (!newProduct.product_id) return window.__toast?.error('请选择需要挂载补录的物料');
    if (!newProduct.actual_quantity) return window.__toast?.error('请填写实际盘得数量');
    
    const prod = products.find(p => p.id === parseInt(newProduct.product_id));
    const newItem = {
      is_new: true,
      product_id: prod.id,
      product_code: prod.code,
      product_name: prod.name,
      batch_no: newProduct.batch_no || '-',
      system_quantity: 0,
      actual_quantity: parseFloat(newProduct.actual_quantity),
      difference: parseFloat(newProduct.actual_quantity),
      remark: '手工补录'
    };
    
    setModal({
      ...modal,
      item: { ...modal.item, items: [...(modal.item.items || []), newItem] }
    });
    setNewProduct({ product_id: '', batch_no: '', actual_quantity: '' });
  };

  const create = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await api.post('/stocktake', {
      warehouse_id: fd.get('warehouse_id'),
      operator: fd.get('operator'),
      remark: fd.get('remark')
    });
    if (res.success) {
      window.__toast?.success(`盘点单 ${res.data.order_no} 创建成功，已自动拉取库存数据`);
      setModal({ open: false });
      load();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const openDetail = async (item) => {
    const res = await api.get(`/stocktake/${item.id}`);
    if (res.success) {
      setModal({ open: true, item: res.data, mode: 'detail' });
    }
  };

  const saveItems = async () => {
    const res = await api.put(`/stocktake/${modal.item.id}/items`, { items: modal.item.items });
    if (res.success) {
      window.__toast?.success('实际数量已保存');
      openDetail(modal.item);
    } else {
      window.__toast?.error(res.message);
    }
  };

  const confirmStocktake = async (item) => {
    if (!await confirm('确认盘点？确认后将按差异调整库存，此操作不可撤销！')) return;
    const res = await api.put(`/stocktake/${item.id}/confirm`);
    if (res.success) {
      window.__toast?.success('盘点已确认，库存已调整');
      setModal({ open: false });
      load();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const del = async (item) => {
    if (!await confirm('确定删除该盘点单？')) return;
    const res = await api.del(`/stocktake/${item.id}`);
    if (res.success) load();
    else window.__toast?.error(res.message);
  };

  const updateItemField = (index, field, value) => {
    const newItems = [...modal.item.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'actual_quantity') {
      const actual = parseFloat(value) || 0;
      newItems[index].difference = actual - (newItems[index].system_quantity || 0);
    }
    setModal({ ...modal, item: { ...modal.item, items: newItems } });
  };

  const statusMap = { draft: '草稿', counting: '盘点中', confirmed: '已确认' };

  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">库存盘点</h2>
          <p className="text-sm text-gray-500 mt-1">创建盘点单，录入实际数量，确认后自动调整库存</p>
        </div>
        <button onClick={() => setModal({ open: true, mode: 'create' })} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors">
          <i className="fas fa-clipboard-list mr-2"></i>新建盘点单
        </button>
      </div>

      {/* 状态筛选 */}
      <div className="flex items-center gap-3 mb-4">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="counting">盘点中</option>
          <option value="confirmed">已确认</option>
        </select>
        <button onClick={() => load(1)} className="text-sm text-teal-600 hover:text-teal-800">
          <i className="fas fa-search mr-1"></i>查询
        </button>
      </div>

      {/* 盘点单列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">盘点单号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">仓库</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">盘点人</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">创建时间</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                <i className="fas fa-clipboard-list text-4xl mb-3 block opacity-30"></i>暂无盘点单
              </td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-teal-600 font-medium">{item.order_no}</td>
                <td className="px-4 py-3 text-sm">{item.warehouse_name}</td>
                <td className="px-4 py-3 text-sm">{item.operator || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${
                    item.status === 'confirmed' ? 'bg-green-100 text-green-700' : 
                    item.status === 'counting' ? 'bg-blue-100 text-blue-700' : 
                    'bg-gray-100 text-gray-600'
                  }`}>{statusMap[item.status] || item.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => openDetail(item)} className="text-teal-600 hover:text-teal-800">
                    <i className="fas fa-eye mr-1"></i>详情
                  </button>
                  {item.status !== 'confirmed' && (
                    <button onClick={() => del(item)} className="text-red-500 hover:text-red-700">
                      <i className="fas fa-trash mr-1"></i>删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination.total > pagination.pageSize && (
          <div className="p-4 border-t border-gray-100">
            <Pagination current={pagination.page} total={pagination.total} pageSize={pagination.pageSize} onChange={p => load(p)} />
          </div>
        )}
      </div>

      {/* 创建/详情弹窗 */}
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false })} title={modal.mode === 'create' ? '新建盘点单' : `盘点单详情 — ${modal.item?.order_no || ''}`} size="max-w-4xl">
        {modal.mode === 'create' ? (
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择仓库 *</label>
                <select name="warehouse_id" required className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">请选择仓库</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">盘点人</label>
                <select name="operator" defaultValue={user?.real_name || user?.username} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">请选择盘点人 (默认本人)</option>
                  {operators.map(group => (
                    <optgroup key={group.department} label={group.department}>
                      {group.members.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea name="remark" className="w-full border border-gray-300 rounded-lg px-3 py-2" rows="2" placeholder="备注信息"></textarea>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <i className="fas fa-info-circle mr-2"></i>创建后系统将自动拉取该仓库所有库存数据作为系统数量
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setModal({ open: false })} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
              <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">创建盘点单</button>
            </div>
          </form>
        ) : modal.item && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4 text-sm bg-gray-50 rounded-lg p-4">
              <div><span className="text-gray-500">仓库：</span><span className="font-medium">{modal.item.warehouse_name}</span></div>
              <div><span className="text-gray-500">盘点人：</span><span className="font-medium">{modal.item.operator || '-'}</span></div>
              <div><span className="text-gray-500">状态：</span><span className={`font-medium ${modal.item.status === 'confirmed' ? 'text-green-600' : 'text-blue-600'}`}>{statusMap[modal.item.status]}</span></div>
              <div><span className="text-gray-500">创建：</span><span className="font-medium">{modal.item.created_at?.slice(0, 10)}</span></div>
            </div>
            
            {/* 盘点明细表 */}
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">物料编码</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">物料名称</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">批次</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">系统数量</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">实际数量</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">差异</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(modal.item.items || []).map((it, i) => (
                    <tr key={it.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-sm font-mono">{it.product_code}</td>
                      <td className="px-3 py-2 text-sm font-medium">{it.product_name}</td>
                      <td className="px-3 py-2 text-sm text-gray-500">{it.batch_no}</td>
                      <td className="px-3 py-2 text-sm text-right font-mono">{it.system_quantity}</td>
                      <td className="px-3 py-2 text-sm text-right">
                        {modal.item.status === 'confirmed' ? (
                          <span className="font-mono">{it.actual_quantity}</span>
                        ) : (
                          <input type="number" step="0.01" value={it.actual_quantity ?? ''} onChange={e => updateItemField(i, 'actual_quantity', e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm" placeholder="输入" />
                        )}
                      </td>
                      <td className={`px-3 py-2 text-sm text-right font-mono font-bold ${
                        (it.difference || 0) > 0 ? 'text-green-600' : (it.difference || 0) < 0 ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {it.actual_quantity != null ? ((it.difference || 0) > 0 ? '+' : '') + (it.difference || 0).toFixed(2) : '-'}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {modal.item.status !== 'confirmed' ? (
                          <input type="text" value={it.remark || ''} onChange={e => updateItemField(i, 'remark', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="备注" />
                        ) : (it.remark || '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 手工挂载漏盘项 */}
            {modal.item.status !== 'confirmed' && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg shadow-inner">
                <i className="fas fa-plus-circle text-teal-600 ml-1"></i>
                <div className="flex-1">
                  <select
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:ring-teal-500 focus:border-teal-500"
                    value={newProduct.product_id}
                    onChange={e => setNewProduct({ ...newProduct, product_id: e.target.value })}
                  >
                    <option value="">-- 选择无库存记录/漏盘的物料进行补足挂载 --</option>
                    {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name} {p.specification ? `(${p.specification})` : ''}</option>)}
                  </select>
                </div>
                <div className="w-32">
                  <input type="text" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-teal-500" placeholder="批次号(可选)"
                    value={newProduct.batch_no} onChange={e => setNewProduct({ ...newProduct, batch_no: e.target.value })} />
                </div>
                <div className="w-24">
                  <input type="number" step="0.01" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-teal-500" placeholder="盘得数量"
                    value={newProduct.actual_quantity} onChange={e => setNewProduct({ ...newProduct, actual_quantity: e.target.value })} />
                </div>
                <button onClick={addNewItem} className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 font-medium whitespace-nowrap">
                  添加行
                </button>
              </div>
            )}

            {/* 差异汇总 */}
            {modal.item.items?.some(it => it.actual_quantity != null) && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{modal.item.items.length}</div>
                  <div className="text-xs text-blue-500 mt-1">盘点品种数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{modal.item.items.filter(it => (it.difference || 0) == 0 && it.actual_quantity != null).length}</div>
                  <div className="text-xs text-green-500 mt-1">无差异</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{modal.item.items.filter(it => (it.difference || 0) != 0).length}</div>
                  <div className="text-xs text-red-500 mt-1">有差异</div>
                </div>
              </div>
            )}

            {/* 操作区 */}
            {modal.item.status !== 'confirmed' && (
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={saveItems} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <i className="fas fa-save mr-2"></i>保存实际数量
                </button>
                <button onClick={() => confirmStocktake(modal.item)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  <i className="fas fa-check-circle mr-2"></i>确认盘点 & 调整库存
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StocktakePage;
