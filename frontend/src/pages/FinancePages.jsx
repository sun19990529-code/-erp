import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

const FinancePages = ({ type = 'payable' }) => {
  const isPayable = type === 'payable';
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [modal, setModal] = useState({ open: false, item: null });
  const [overviewData, setOverviewData] = useState(null);
  const [payRecords, setPayRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  const load = async (page = 1) => {
    const endpoint = isPayable ? '/finance/payables' : '/finance/receivables';
    const qs = new URLSearchParams({ page, pageSize: pagination.pageSize });
    if (statusFilter) qs.set('status', statusFilter);
    const res = await api.get(`${endpoint}?${qs}`);
    if (res.success) {
      setData(res.data);
      if (res.pagination) setPagination(res.pagination);
      if (res.summary) setSummary(res.summary);
    }
    // 加载总览
    const overRes = await api.get('/finance/summary');
    if (overRes.success) setOverviewData(overRes.data);
  };

  useEffect(() => { load(); }, [type]);

  const openPay = async (item) => {
    setModal({ open: true, item, amount: '' });
    // 加载该单的付款记录
    const param = isPayable ? `payable_id=${item.id}` : `receivable_id=${item.id}`;
    const res = await api.get(`/finance/payment-records?${param}`);
    if (res.success) setPayRecords(res.data);
  };

  const submitPay = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = parseFloat(fd.get('amount'));
    if (!amount || amount <= 0) { window.__toast?.warning('请输入有效金额'); return; }
    const endpoint = isPayable
      ? `/finance/payables/${modal.item.id}/pay`
      : `/finance/receivables/${modal.item.id}/receive`;
    const res = await api.post(endpoint, {
      amount, payment_method: fd.get('payment_method'), operator: fd.get('operator'), remark: fd.get('remark')
    });
    if (res.success) {
      window.__toast?.success(isPayable ? '付款成功' : '收款成功');
      setModal({ open: false });
      load(pagination.page);
    } else {
      window.__toast?.error(res.message);
    }
  };

  const statusMap = { unpaid: '未付', partial: '部分', paid: '已付清' };
  const statusColor = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700' };
  
  const overview = isPayable ? overviewData?.payable : overviewData?.receivable;
  const unpaidInfo = isPayable ? overviewData?.unpaid_payables : overviewData?.unreceived_receivables;

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{isPayable ? '应付账款' : '应收账款'}</h2>
          <p className="text-sm text-gray-500 mt-1">{isPayable ? '管理供应商的采购/委外应付款' : '管理客户的销售应收款'}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">全部状态</option>
            <option value="unpaid">未付</option>
            <option value="partial">部分</option>
            <option value="paid">已付清</option>
          </select>
          <button onClick={() => load(1)} className="text-sm text-teal-600 hover:text-teal-800 font-medium">
            <i className="fas fa-search mr-1"></i>查询
          </button>
        </div>
      </div>

      {/* 总览卡片 */}
      {overview && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-gray-500 text-xs font-medium uppercase mb-1">累计{isPayable ? '应付' : '应收'}</div>
            <div className="text-2xl font-bold text-gray-800">¥{(overview.total || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-gray-500 text-xs font-medium uppercase mb-1">已{isPayable ? '付款' : '收款'}</div>
            <div className="text-2xl font-bold text-green-600">¥{((isPayable ? overview.paid : overview.received) || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-gray-500 text-xs font-medium uppercase mb-1">未{isPayable ? '付' : '收'}余额</div>
            <div className="text-2xl font-bold text-red-600">¥{(unpaidInfo?.amount || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="text-gray-500 text-xs font-medium uppercase mb-1">待处理笔数</div>
            <div className="text-2xl font-bold text-orange-600">{unpaidInfo?.count || 0}</div>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">单号</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{isPayable ? '供应商' : '客户'}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">金额</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">已{isPayable ? '付' : '收'}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">余额</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">日期</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.length === 0 ? (
              <tr><td colSpan="9" className="px-4 py-12 text-center text-gray-400">
                <i className={`fas ${isPayable ? 'fa-file-invoice-dollar' : 'fa-hand-holding-usd'} text-4xl mb-3 block opacity-30`}></i>
                暂无{isPayable ? '应付' : '应收'}记录
              </td></tr>
            ) : data.map(item => {
              const paid = isPayable ? item.paid_amount : item.received_amount;
              const remaining = item.amount - paid;
              return (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-teal-600 font-medium">{item.order_no}</td>
                  <td className="px-4 py-3 text-sm font-medium">{isPayable ? item.supplier_name : item.customer_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{item.type}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-bold">¥{(item.amount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-green-600">¥{(paid || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-red-600 font-bold">¥{remaining.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${statusColor[item.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusMap[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{item.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.status !== 'paid' && (
                      <button onClick={() => openPay(item)} className="text-teal-600 hover:text-teal-800 font-medium">
                        <i className={`fas ${isPayable ? 'fa-money-bill-wave' : 'fa-hand-holding-usd'} mr-1`}></i>
                        {isPayable ? '付款' : '收款'}
                      </button>
                    )}
                    {item.status === 'paid' && <span className="text-green-500 text-xs"><i className="fas fa-check-circle mr-1"></i>已完成</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pagination.total > pagination.pageSize && (
          <div className="p-4 border-t border-gray-100">
            <Pagination current={pagination.page} total={pagination.total} pageSize={pagination.pageSize} onChange={(p) => load(p)} />
          </div>
        )}
      </div>

      {/* 付款/收款弹窗 */}
      <Modal isOpen={modal.open} onClose={() => setModal({ open: false })} title={`${isPayable ? '付款' : '收款'} — ${modal.item?.order_no || ''}`} size="max-w-lg">
        {modal.item && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 text-sm grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">{isPayable ? '供应商' : '客户'}：</span><span className="font-medium">{isPayable ? modal.item.supplier_name : modal.item.customer_name}</span></div>
              <div><span className="text-gray-500">总金额：</span><span className="font-bold">¥{(modal.item.amount || 0).toFixed(2)}</span></div>
              <div><span className="text-gray-500">已{isPayable ? '付' : '收'}：</span><span className="text-green-600 font-medium">¥{((isPayable ? modal.item.paid_amount : modal.item.received_amount) || 0).toFixed(2)}</span></div>
              <div><span className="text-gray-500">余额：</span><span className="text-red-600 font-bold">¥{(modal.item.amount - ((isPayable ? modal.item.paid_amount : modal.item.received_amount) || 0)).toFixed(2)}</span></div>
            </div>
            
            {/* 历史记录 */}
            {payRecords.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2">{isPayable ? '付款' : '收款'}记录</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {payRecords.map(r => (
                    <div key={r.id} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2 text-sm">
                      <span className="text-gray-500">{r.created_at?.slice(0, 16)}</span>
                      <span className="font-mono text-green-600 font-bold">¥{(r.amount || 0).toFixed(2)}</span>
                      <span className="text-gray-400 text-xs">{r.payment_method === 'bank' ? '银行转账' : r.payment_method === 'cash' ? '现金' : r.payment_method || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={submitPay} className="space-y-3 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{isPayable ? '付款' : '收款'}金额 *</label>
                  <input name="amount" type="number" step="0.01" required className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="输入金额" max={modal.item.amount - (isPayable ? modal.item.paid_amount : modal.item.received_amount || 0)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">方式</label>
                  <select name="payment_method" className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option value="bank">银行转账</option>
                    <option value="cash">现金</option>
                    <option value="check">支票</option>
                    <option value="other">其他</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">经办人</label>
                <input name="operator" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="经办人姓名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <input name="remark" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="备注" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setModal({ open: false })} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
                <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
                  <i className={`fas ${isPayable ? 'fa-money-bill-wave' : 'fa-hand-holding-usd'} mr-2`}></i>确认{isPayable ? '付款' : '收款'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FinancePages;
