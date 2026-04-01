import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useConfirm } from '../components/ConfirmModal';

const WorkstationQRPage = () => {
  const [stations, setStations] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [form, setForm] = useState({ code: '', name: '', process_id: '', remark: '' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, ConfirmDialog] = useConfirm();

  const load = async () => {
    const [s, p] = await Promise.all([
      api.get('/workstation'),
      api.get('/production/processes')
    ]);
    if (s.success) setStations(s.data);
    if (p.success) setProcesses(p.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getQRUrl = (code) => `${window.location.origin}/ws/${code}`;

  const escapeHtml = (unsafe) => {
    return (unsafe || '').toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return window.__toast?.warning('编码和名称不能为空');
    const res = editing
      ? await api.put(`/workstation/${editing}`, form)
      : await api.post('/workstation', form);
    if (res.success) {
      window.__toast?.success(editing ? '修改成功' : '创建成功');
      setForm({ code: '', name: '', process_id: '', remark: '' });
      setEditing(null);
      load();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const remove = async (id) => {
    if (!await confirm('确认删除此工位？')) return;
    const res = await api.delete(`/workstation/${id}`);
    if (res.success) { window.__toast?.success('删除成功'); load(); }
  };

  const printSingle = (station) => {
    const url = getQRUrl(station.code);
    const qrEl = document.getElementById(`qr-${station.id}`);
    if (!qrEl) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>工位码 - ${station.name}</title>
      <style>
        body { font-family: 'Microsoft YaHei', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { text-align: center; border: 3px solid #333; border-radius: 12px; padding: 30px 40px; }
        .card h1 { font-size: 28px; margin: 0 0 4px; }
        .card h2 { font-size: 16px; color: #666; margin: 0 0 16px; font-weight: normal; }
        .card .url { font-size: 11px; color: #999; margin-top: 12px; word-break: break-all; }
        .card .process { font-size: 14px; color: #0d9488; margin-top: 8px; }
      </style></head><body>
      <div class="card">
        <h1>${escapeHtml(station.name)}</h1>
        <h2>工位编码: ${escapeHtml(station.code)}</h2>
        <div>${qrEl.innerHTML}</div>
        <div class="process">${escapeHtml(station.process_name || '')}</div>
        <div class="url">${escapeHtml(url)}</div>
      </div>
      <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const cards = stations.map(s => {
      const url = getQRUrl(s.code);
      const qrEl = document.getElementById(`qr-${s.id}`);
      return `<div class="card">
        <h1>${escapeHtml(s.name)}</h1>
        <h2>${escapeHtml(s.code)}</h2>
        <div>${qrEl?.innerHTML || ''}</div>
        <div class="process">${escapeHtml(s.process_name || '')}</div>
        <div class="url">${escapeHtml(url)}</div>
      </div>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>全部工位码</title>
      <style>
        body { font-family: 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .card { text-align: center; border: 2px solid #333; border-radius: 10px; padding: 20px; page-break-inside: avoid; }
        .card h1 { font-size: 20px; margin: 0 0 2px; }
        .card h2 { font-size: 12px; color: #666; margin: 0 0 10px; font-weight: normal; }
        .card .url { font-size: 9px; color: #999; margin-top: 8px; word-break: break-all; }
        .card .process { font-size: 12px; color: #0d9488; margin-top: 6px; }
        @media print { .grid { grid-template-columns: repeat(3, 1fr); } }
      </style></head><body>
      <div class="grid">${cards}</div>
      <script>window.onload = function() { window.print(); window.close(); }<\/script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="fade-in">
      <ConfirmDialog />
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">工位二维码管理</h2>
          <p className="text-sm text-gray-500 mt-1">管理工位、生成并打印工位二维码，工人/检验员扫码即可操作</p>
        </div>
        {stations.length > 0 && (
          <button onClick={printAll} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm">
            <i className="fas fa-print mr-2"></i>打印全部工位码
          </button>
        )}
      </div>

      {/* 新增/编辑表单 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-bold text-gray-700 mb-3 text-sm">
          <i className="fas fa-plus-circle mr-2 text-teal-600"></i>{editing ? '编辑工位' : '添加工位'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none" placeholder="工位编码 *（如 CNC-01）" />
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none" placeholder="工位名称 *（如 数控车床1号）" />
          <select value={form.process_id} onChange={e => setForm({ ...form, process_id: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none">
            <option value="">关联工序（选填）</option>
            {processes.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none" placeholder="备注（选填）" />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium">
              {editing ? '保存' : '添加'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm({ code: '', name: '', process_id: '', remark: '' }); }}
                className="px-3 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 text-sm">取消</button>
            )}
          </div>
        </div>
      </div>

      {/* 工位卡片网格 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400"><i className="fas fa-spinner fa-spin text-2xl"></i></div>
      ) : stations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <i className="fas fa-desktop text-4xl mb-3 block opacity-30"></i>
          <div className="text-lg">暂无工位</div>
          <div className="text-sm mt-1">请在上方添加第一个工位</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stations.map(s => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
              <div className="p-4 text-center">
                <div className="font-bold text-gray-800 text-lg">{s.name}</div>
                <div className="text-xs text-gray-500 mb-3">{s.code} · {s.process_name || '未关联工序'}</div>
                <div id={`qr-${s.id}`} className="inline-block bg-white p-2 rounded-lg border border-gray-200">
                  <QRCodeSVG value={getQRUrl(s.code)} size={140} level="H" />
                </div>
                <div className="text-[10px] text-gray-400 mt-2 break-all">{getQRUrl(s.code)}</div>
              </div>
              <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between bg-gray-50/50">
                <div className="flex gap-1">
                  <button onClick={() => printSingle(s)} className="text-xs text-teal-600 hover:text-teal-800 px-2 py-1 rounded hover:bg-teal-50">
                    <i className="fas fa-print mr-1"></i>打印
                  </button>
                  <button onClick={() => { setEditing(s.id); setForm({ code: s.code, name: s.name, process_id: s.process_id || '', remark: s.remark || '' }); }}
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                    <i className="fas fa-edit mr-1"></i>编辑
                  </button>
                  <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                    <i className="fas fa-trash mr-1"></i>删除
                  </button>
                </div>
                <a href={`/ws/${s.code}`} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-gray-600">
                  <i className="fas fa-external-link-alt mr-1"></i>预览
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkstationQRPage;
