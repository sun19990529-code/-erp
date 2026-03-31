import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = '/api/workstation/screen';

const fetchApi = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  return res.json();
};

const WorkstationScreen = () => {
  const { stationCode } = useParams();
  const [station, setStation] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const selectedTaskIdRef = useRef(null);
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const [taskDetail, setTaskDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [countdown, setCountdown] = useState(30);
  const [modal, setModal] = useState({ type: null }); // report | inspect
  const [form, setForm] = useState({});

  // 时钟
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 加载工位任务列表
  const loadTasks = async () => {
    try {
      const res = await fetchApi(`${API_BASE}/${stationCode}`);
      if (res.success) {
        setStation(res.data.station);
        setTasks(res.data.tasks);
        setError('');
        // 自动同步当前选中的任务详情
        if (selectedTaskIdRef.current) {
          loadDetail(selectedTaskIdRef.current);
        }
      } else {
        setError(res.message);
      }
    } catch (e) {
      setError('连接服务器失败');
    }
    setLoading(false);
    setCountdown(30);
  };

  // 30秒自动刷新
  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30000);
    const cdInterval = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
    return () => { clearInterval(interval); clearInterval(cdInterval); };
  }, [stationCode]);

  // 加载工单详情
  const loadDetail = async (poId) => {
    const res = await fetchApi(`${API_BASE}/${stationCode}/${poId}`);
    if (res.success) setTaskDetail(res.data);
  };

  const openTask = (task) => {
    setSelectedTaskId(task.id);
    selectedTaskIdRef.current = task.id;
    loadDetail(task.id);
  };

  // 报工提交
  const submitReport = async () => {
    if (!form.operator?.trim()) return alert('请填写操作人');
    if (!form.output_quantity || form.output_quantity <= 0) return alert('请填写产出数量');
    const res = await fetchApi(`${API_BASE}/${stationCode}/${selectedTask.id}/report`, {
      method: 'POST', body: JSON.stringify(form)
    });
    if (res.success) {
      setModal({ type: null });
      setForm({});
      loadTasks();
      loadDetail(selectedTask.id);
    } else {
      alert(res.message);
    }
  };

  // 巡检提交
  const submitInspect = async () => {
    if (!form.inspector?.trim()) return alert('请填写检验员');
    if (!form.result) return alert('请选择检验结果');
    const res = await fetchApi(`${API_BASE}/${stationCode}/${selectedTask.id}/inspect`, {
      method: 'POST', body: JSON.stringify(form)
    });
    if (res.success) {
      setModal({ type: null });
      setForm({});
      loadTasks();
      loadDetail(selectedTask.id);
      alert(res.message);
    } else {
      alert(res.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <i className="fas fa-circle-notch fa-spin text-5xl text-blue-500"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-center p-8">
        <div>
          <i className="fas fa-exclamation-triangle text-6xl text-red-500 mb-4 block"></i>
          <div className="text-2xl text-white font-bold mb-2">工位未找到</div>
          <div className="text-gray-400">{error}</div>
          <div className="text-gray-600 mt-4 text-sm">工位编码: {stationCode}</div>
        </div>
      </div>
    );
  }

  const progress = selectedTask ? Math.round((selectedTask.completed_quantity / selectedTask.quantity) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      {/* 顶栏 */}
      <header className="h-14 sm:h-16 px-4 sm:px-6 border-b border-gray-800 bg-gray-900 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.5)]">
            <i className="fas fa-desktop text-white"></i>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white">{station?.name || stationCode}</h1>
            <div className="text-[10px] text-blue-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              {station?.process_name || '—'} · {tasks.length} 个在制任务 · {countdown}s 后刷新
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl sm:text-2xl font-mono font-bold text-white tracking-widest">
            {currentTime.toLocaleTimeString('zh-CN', { hour12: false })}
          </div>
          <div className="text-[10px] text-gray-500">
            {currentTime.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' })}
          </div>
        </div>
      </header>

      {/* 主体 */}
      <main className="flex-1 flex flex-col lg:flex-row gap-3 p-3 sm:p-4 min-h-0">
        {/* 左侧：任务列表 */}
        <div className="lg:w-80 shrink-0 flex flex-col gap-3 min-h-0">
          <div className="bg-gray-800 rounded-xl p-3 flex-1 flex flex-col min-h-0 border border-gray-700/50">
            <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center">
              <i className="fas fa-tasks text-blue-500 mr-2"></i>当前任务
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {tasks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 py-12">
                  <i className="fas fa-inbox text-4xl mb-3 opacity-30"></i>
                  <div className="text-sm">本工位暂无在制任务</div>
                </div>
              ) : tasks.map(t => (
                <button key={t.id} onClick={() => openTask(t)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedTask?.id === t.id
                      ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                      : 'bg-gray-900 border-gray-700/30 hover:border-gray-600'
                  }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-blue-400">{t.order_no}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      t.status === 'processing' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>{t.status === 'processing' ? '生产中' : '待开始'}</span>
                  </div>
                  <div className="text-sm font-bold text-white truncate">{t.product_name}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{t.specification || ''} · {t.completed_quantity || 0}/{t.quantity} {t.unit}</div>
                  <div className="w-full bg-gray-700 rounded-full h-1 mt-2">
                    <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((t.completed_quantity / t.quantity) * 100))}%` }}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：工单详情 */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {!selectedTask ? (
            <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700/50 flex items-center justify-center">
              <div className="text-center text-gray-600">
                <i className="fas fa-hand-pointer text-5xl mb-4 opacity-20 block"></i>
                <div className="text-lg font-medium">请从左侧选择一个任务</div>
                <div className="text-sm mt-1">或扫描工单二维码进入</div>
              </div>
            </div>
          ) : (
            <>
              {/* 产品信息卡 */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono bg-blue-500/20 text-blue-400 px-2 py-1 rounded">{selectedTask.order_no}</span>
                      {selectedTask.sales_order_no && <span className="text-xs text-gray-500">销售单: {selectedTask.sales_order_no}</span>}
                      {selectedTask.customer_name && <span className="text-xs text-gray-500">客户: {selectedTask.customer_name}</span>}
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{selectedTask.product_name}</h2>
                    <div className="text-sm text-gray-400">{selectedTask.product_code} · {selectedTask.specification || '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-mono font-bold text-white">{selectedTask.completed_quantity || 0}<span className="text-lg text-gray-500">/{selectedTask.quantity}</span></div>
                    <div className="text-xs text-gray-500 mt-1">{selectedTask.unit}</div>
                    <div className="w-32 bg-gray-700 rounded-full h-2 mt-2">
                      <div className={`h-2 rounded-full ${progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* 尺寸公差参数 */}
                {(selectedTask.outer_diameter || selectedTask.inner_diameter || selectedTask.wall_thickness || selectedTask.length) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-gray-700/50">
                    {[
                      { label: '外径', value: selectedTask.outer_diameter, tol: selectedTask.tolerance_od, tolL: selectedTask.tolerance_od_lower },
                      { label: '内径', value: selectedTask.inner_diameter, tol: selectedTask.tolerance_id, tolL: selectedTask.tolerance_id_lower },
                      { label: '壁厚', value: selectedTask.wall_thickness, tol: selectedTask.tolerance_wt, tolL: selectedTask.tolerance_wt_lower },
                      { label: '长度', value: selectedTask.length, tol: selectedTask.tolerance_len, tolL: selectedTask.tolerance_len_lower }
                    ].filter(d => d.value).map(d => (
                      <div key={d.label} className="bg-gray-900 rounded-lg p-2 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">{d.label}</div>
                        <div className="text-lg font-mono font-bold text-white">{d.value}</div>
                        {d.tol && <div className="text-[10px] text-teal-400">+{d.tol}{d.tolL ? ` / -${Math.abs(d.tolL)}` : ''}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 操作按钮区 */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setModal({ type: 'report' }); setForm({ output_quantity: '', defect_quantity: 0, operator: '', remark: '' }); }}
                  className="bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg shadow-green-900/30 flex items-center justify-center gap-3">
                  <i className="fas fa-clipboard-check text-2xl"></i>报工
                </button>
                <button onClick={() => { setModal({ type: 'inspect' }); setForm({ result: '', inspector: '', defect_quantity: 0, remark: '' }); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg shadow-blue-900/30 flex items-center justify-center gap-3">
                  <i className="fas fa-search text-2xl"></i>巡检
                </button>
              </div>

              {/* 工序进度 + 物料 & 检验记录 */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
                {/* 工序进度 */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50 flex flex-col min-h-0">
                  <h3 className="text-sm font-bold text-gray-300 mb-3"><i className="fas fa-stream text-teal-500 mr-2"></i>工序进度</h3>
                  <div className="flex-1 overflow-y-auto space-y-1.5">
                    {taskDetail?.processRecords?.map((pr, i) => (
                      <div key={pr.id} className={`flex items-center gap-3 p-2 rounded-lg ${
                        pr.process_code === station?.process_code ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-gray-900/50'
                      }`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          pr.status === 'completed' ? 'bg-green-500 text-white' : pr.process_code === station?.process_code ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-700 text-gray-400'
                        }`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${pr.process_code === station?.process_code ? 'text-blue-300' : 'text-gray-300'}`}>{pr.process_name}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          pr.status === 'completed' ? 'bg-green-500/20 text-green-400' : pr.status === 'processing' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'
                        }`}>{pr.status === 'completed' ? '完成' : pr.status === 'processing' ? '进行中' : '待开始'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 物料 + 检验 */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50 flex flex-col min-h-0">
                  <h3 className="text-sm font-bold text-gray-300 mb-3"><i className="fas fa-boxes text-orange-500 mr-2"></i>本工序物料</h3>
                  <div className="flex-1 overflow-y-auto space-y-1.5 mb-4">
                    {taskDetail?.materials?.length > 0 ? taskDetail.materials.map(m => (
                      <div key={m.id} className="flex items-center justify-between bg-gray-900/50 rounded-lg p-2 text-xs">
                        <span className="text-gray-300">{m.material_name}</span>
                        <span className="text-orange-400 font-mono">{m.quantity} {m.material_unit}</span>
                      </div>
                    )) : <div className="text-xs text-gray-600 text-center py-4">本工序无绑定物料</div>}
                  </div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2"><i className="fas fa-clipboard-list text-purple-500 mr-2"></i>最近检验</h3>
                  <div className="overflow-y-auto space-y-1.5">
                    {taskDetail?.recentInspections?.length > 0 ? taskDetail.recentInspections.map(insp => (
                      <div key={insp.id} className="flex items-center justify-between bg-gray-900/50 rounded-lg p-2 text-xs">
                        <span className="text-gray-400">{insp.inspector} · {insp.created_at?.slice(5, 16)}</span>
                        <span className={`font-bold ${insp.result === 'pass' ? 'text-green-400' : 'text-red-400'}`}>
                          {insp.result === 'pass' ? '✓ 通过' : '✗ 不合格'}
                        </span>
                      </div>
                    )) : <div className="text-xs text-gray-600 text-center py-2">暂无巡检记录</div>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* 报工弹窗 */}
      {modal.type === 'report' && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setModal({ type: null })}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-600" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4"><i className="fas fa-clipboard-check text-green-500 mr-2"></i>报工</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">操作人 *</label>
                <input value={form.operator || ''} onChange={e => setForm({ ...form, operator: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none text-lg" placeholder="请输入姓名" autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">产出数量 *</label>
                <input type="number" value={form.output_quantity || ''} onChange={e => setForm({ ...form, output_quantity: parseInt(e.target.value) || '' })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none text-lg" placeholder="请输入产出数量" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">不良数</label>
                <input type="number" value={form.defect_quantity || ''} onChange={e => setForm({ ...form, defect_quantity: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">备注</label>
                <input value={form.remark || ''} onChange={e => setForm({ ...form, remark: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-green-500 focus:outline-none" placeholder="选填" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal({ type: null })} className="flex-1 py-3 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 font-medium">取消</button>
              <button onClick={submitReport} className="flex-1 py-3 rounded-lg bg-green-600 text-white hover:bg-green-500 font-bold text-lg">确认报工</button>
            </div>
          </div>
        </div>
      )}

      {/* 巡检弹窗 */}
      {modal.type === 'inspect' && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setModal({ type: null })}>
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-600" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4"><i className="fas fa-search text-blue-500 mr-2"></i>巡检</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">检验员 *</label>
                <input value={form.inspector || ''} onChange={e => setForm({ ...form, inspector: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none text-lg" placeholder="请输入姓名" autoFocus />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">检验结果 *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setForm({ ...form, result: 'pass' })}
                    className={`py-4 rounded-xl font-bold text-lg transition-all ${form.result === 'pass' ? 'bg-green-600 text-white ring-2 ring-green-400' : 'bg-gray-900 text-gray-500 border border-gray-600'}`}>
                    <i className="fas fa-check-circle mr-2"></i>通过
                  </button>
                  <button onClick={() => setForm({ ...form, result: 'fail' })}
                    className={`py-4 rounded-xl font-bold text-lg transition-all ${form.result === 'fail' ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-gray-900 text-gray-500 border border-gray-600'}`}>
                    <i className="fas fa-times-circle mr-2"></i>不合格
                  </button>
                </div>
              </div>
              {form.result === 'fail' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">不良数量</label>
                  <input type="number" value={form.defect_quantity || ''} onChange={e => setForm({ ...form, defect_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none" />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">备注</label>
                <input value={form.remark || ''} onChange={e => setForm({ ...form, remark: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none" placeholder="选填" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal({ type: null })} className="flex-1 py-3 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 font-medium">取消</button>
              <button onClick={submitInspect} className="flex-1 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-bold text-lg">确认提交</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkstationScreen;
