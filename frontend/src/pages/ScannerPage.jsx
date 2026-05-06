import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import CameraScanner from '../components/CameraScanner';

const ScannerPage = () => {
  const [barcode, setBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [ticket, setTicket] = useState(null); // 解析到的生产流转信息
  const [errorMsg, setErrorMsg] = useState('');
  
  // 手机摄像头模式控制
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  // 报工表单状态
  const [operator, setOperator] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 隐藏的输入框，用于吸附扫码枪输入
  const hiddenInputRef = useRef(null);

  // 页面加载及错误恢复时，强制高亮隐式扫码输入框
  const focusScanner = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  useEffect(() => {
    // 组件挂载时自动聚焦，并监听任意键盘动作防丢焦
    focusScanner();
    const handleGlobalClick = () => focusScanner();
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // 监听扫码枪输入完成 (Enter 键)
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    const scannedCode = barcode.trim();
    if (!scannedCode) return;
    
    setIsScanning(true);
    setErrorMsg('');
    setTicket(null);
    setBarcode(''); // 立即重置等下一次扫描

    try {
      const res = await api.get(`/production/scan/${scannedCode}`);
      if (res.success) {
        setTicket(res.data);
        // 初始化预设值：默认投入=工单总数 - 已累计报工
        const remaining = (res.data.quantity || 0) - (res.data.cumulative_output || 0);
        setInputQty(remaining > 0 ? remaining : '');
        setOutputQty('');
        setDefectQty('');
        window.__toast?.success('扫码解析成功：即将进入【' + res.data.process_name + '】节点');
      } else {
        setErrorMsg(res.message);
        window.__toast?.error(res.message);
      }
    } catch (err) {
      setErrorMsg('网络异常或服务器故障，请重试');
    } finally {
      setIsScanning(false);
    }
  };

  // 处理手机摄像头扫码结果
  const handleCameraScan = (code) => {
    setIsCameraOpen(false);
    setBarcode(code);
    // 模拟提交事件
    handleBarcodeSubmit({ preventDefault: () => {} }, code);
  };

  // 由于 handleSubmit 依赖于 state barcode，如果直接调用 handleBarcodeSubmit 可能会拿到旧的 state，
  // 我们稍微调整 handleBarcodeSubmit，使其可以接收显式的 code
  const submitBarcode = async (scannedCode) => {
    if (!scannedCode) return;
    
    setIsScanning(true);
    setErrorMsg('');
    setTicket(null);
    setBarcode(''); // 立即重置等下一次扫描

    try {
      const res = await api.get(`/production/scan/${scannedCode}`);
      if (res.success) {
        setTicket(res.data);
        const remaining = (res.data.quantity || 0) - (res.data.cumulative_output || 0);
        setInputQty(remaining > 0 ? remaining : '');
        setOutputQty('');
        setDefectQty('');
        window.__toast?.success('扫码解析成功：即将进入【' + res.data.process_name + '】节点');
      } else {
        setErrorMsg(res.message);
        window.__toast?.error(res.message);
      }
    } catch (err) {
      setErrorMsg('网络异常或服务器故障，请重试');
    } finally {
      setIsScanning(false);
    }
  };

  const handleBarcodeSubmitEvent = (e) => {
    e.preventDefault();
    submitBarcode(barcode.trim());
  };

  // 提交报工信息
  const handleSubmitReport = async () => {
    if (!ticket) return;
    if (!outputQty && outputQty !== 0) {
      window.__toast?.error('请填写合格产出数量');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        process_id: ticket.process_id,
        operator: operator,
        input_quantity: parseInt(inputQty) || parseInt(outputQty), // 如果不填投入默认等于产出
        output_quantity: parseInt(outputQty) || 0,
        defect_quantity: parseInt(defectQty) || 0,
        remark: '扫码工作台无人工快速录入',
      };
      
      const res = await api.post(`/production/${ticket.production_order_id}/process`, payload);
      if (res.success) {
        window.__toast?.success('✅ 报工提交成功！');
        // 重置回等待下一把枪的工作状态
        setTicket(null);
        setTimeout(focusScanner, 100);
      } else {
        window.__toast?.error('跨级拦截或报错：' + res.message);
      }
    } catch (err) {
      window.__toast?.error('网络故障或保存失败');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 取消并回到初始扫码态
  const handleCancel = () => {
    setTicket(null);
    setErrorMsg('');
    focusScanner();
  };

  return (
    <div className="absolute inset-0 bg-[#0f172a] text-white flex flex-col justify-center items-center overflow-hidden z-[999]">
      {/* 隐形捕捉器，吸收任何物理枪发来的键盘模拟信号 */}
      <form onSubmit={handleBarcodeSubmitEvent} className="absolute opacity-0 pointer-events-none">
        <input 
          ref={hiddenInputRef}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onBlur={() => { if(!ticket) setTimeout(focusScanner, 500); }} 
          autoFocus 
          autoComplete="off" 
        />
        <button type="submit">Submit</button>
      </form>

      {/* 头部大屏版状态条 */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <i className="fas fa-industry text-4xl text-teal-400"></i>
          <div>
            <h1 className="text-2xl font-bold tracking-widest text-[#f8fafc]">车间极速报工台</h1>
            <p className="text-gray-400 text-sm mt-1 font-mono">STATION-SCAN-01</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium bg-red-500/20 text-red-400 px-4 py-2 rounded-full border border-red-500/30 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
            等待流转卡输入
          </div>
        </div>
      </div>

      {/* 主工作区 */}
      <div className="w-full max-w-4xl px-4 mt-16 flex flex-col items-center">
        {!ticket ? (
          /* 等待扫码动画态 */
          <div className="flex flex-col items-center justify-center space-y-12 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-teal-500/20 blur-[100px] rounded-full"></div>
              <div className="w-64 h-64 rounded-full border-2 border-dashed border-teal-500/50 flex items-center justify-center relative overflow-hidden group">
                <i className="fas fa-barcode text-8xl text-teal-300 drop-shadow-[0_0_15px_rgba(45,212,191,0.8)] opacity-80 group-hover:scale-110 transition-transform"></i>
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,1)] animate-scan"></div>
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-bold text-gray-100 uppercase tracking-widest">请扫描流转单上的二维码</h2>
              <p className="text-gray-400 text-lg mb-6">支持条码 / QR Code 二维码枪极速解析</p>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // 防止触发全局焦点点击
                  setIsCameraOpen(true);
                }}
                className="mt-6 inline-flex items-center gap-3 bg-gradient-to-r from-teal-600 to-teal-800 hover:from-teal-500 hover:to-teal-700 text-white px-8 py-4 rounded-full font-bold shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all transform hover:scale-105"
              >
                <i className="fas fa-camera text-2xl"></i>
                使用设备摄像头扫码
              </button>
              
              {isScanning && (
                <div className="mt-8 flex justify-center items-center gap-3 text-teal-400">
                  <i className="fas fa-circle-notch fa-spin text-2xl"></i>
                  <span className="text-xl">高速解析中...</span>
                </div>
              )}
              
              {errorMsg && (
                <div className="mt-8 bg-red-500/10 border border-red-500/50 px-6 py-4 rounded-2xl max-w-xl text-red-400 flex flex-col items-center gap-2">
                  <i className="fas fa-sensor-alert text-3xl"></i>
                  <div className="font-bold text-lg">{errorMsg}</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 解析成功 - 数据填报态 */
          <div className="w-full bg-slate-800/80 backdrop-blur-md rounded-3xl border border-slate-700 shadow-2xl overflow-hidden animate-slide-up">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-6 flex justify-between items-center shadow-inner">
              <div>
                <div className="text-teal-100 text-sm font-bold uppercase tracking-wider mb-1">匹配成功 / 流转单加载完毕</div>
                <div className="text-3xl font-mono font-bold text-white tracking-widest">{ticket.order_no}</div>
              </div>
              <div className="text-right">
                <div className="text-teal-100 text-sm mb-1">正在进行工序</div>
                <div className="text-3xl font-black text-white bg-black/20 px-4 py-1 rounded-xl">{ticket.process_name}</div>
              </div>
            </div>
            
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* 左侧信息大盘 */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-400 text-sm font-medium mb-1">加工产品</h3>
                  <div className="text-2xl font-bold text-slate-100">{ticket.product_name} <span className="text-slate-500 text-lg ml-2">{ticket.product_code}</span></div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                    <div className="text-slate-400 text-sm mb-1">目标总计</div>
                    <div className="text-3xl font-bold text-white font-mono">{ticket.quantity} <span className="text-base text-slate-500">{ticket.unit}</span></div>
                  </div>
                  <div className="bg-teal-900/30 p-4 rounded-2xl border border-teal-700/30 text-center relative overflow-hidden">
                    <div className="text-teal-400/80 text-sm mb-1 z-10 relative">本序已累计产出</div>
                    <div className="text-3xl font-bold text-teal-400 font-mono z-10 relative">{ticket.cumulative_output} <span className="text-base text-teal-600/50">{ticket.unit}</span></div>
                    {/* 微背景进度 */}
                    <div className="absolute bottom-0 left-0 h-1 bg-teal-500" style={{width: `${Math.min(100, (ticket.cumulative_output / ticket.quantity) * 100)}%`}}></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <label className="block text-slate-400 text-sm font-medium mb-2">报工人 (可选)</label>
                  <div className="text-black">
                     <OperatorSelect value={operator} onChange={setOperator} className="w-full text-lg py-3 rounded-xl" />
                  </div>
                </div>
              </div>
              
              {/* 右侧超大号输入区 */}
              <div className="bg-slate-900 rounded-3xl p-6 border border-slate-700 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="flex justify-between text-slate-300 font-medium mb-2 text-lg">
                      <span className="text-emerald-400"><i className="fas fa-check-circle mr-2"></i>合格产出产出</span>
                      <span className="text-slate-500 text-sm pt-1">单位: {ticket.unit}</span>
                    </label>
                    <input 
                      type="number" 
                      value={outputQty}
                      onChange={e => setOutputQty(e.target.value)}
                      className="w-full bg-slate-800 border-2 border-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 text-white text-5xl font-mono font-bold text-center rounded-2xl py-4 pt-5 outline-none transition-all placeholder:text-slate-700"
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  
                  <div>
                    <label className="flex justify-between text-slate-400 font-medium mb-2">
                      <span className="text-red-400"><i className="fas fa-times-circle mr-2"></i>不良废品</span>
                    </label>
                    <input 
                      type="number" 
                      value={defectQty}
                      onChange={e => setDefectQty(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 text-red-300 text-2xl font-mono font-bold text-center rounded-xl py-3 outline-none transition-all placeholder:text-slate-700"
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex gap-4">
                  <button onClick={handleCancel} disabled={isSubmitting} className="flex-1 py-5 rounded-2xl font-bold tracking-widest text-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                    取消重扫
                  </button>
                  <button onClick={handleSubmitReport} disabled={isSubmitting} className="flex-[2] py-5 rounded-2xl font-bold tracking-widest text-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-teal-500/30 transition-all flex justify-center items-center gap-2">
                    {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-upload"></i>}
                    提交报工
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 0%; opacity: 1; }
          50% { top: 100%; opacity: 0.5; }
          100% { top: 0%; opacity: 1; }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
      `}} />

      {/* 挂载手机摄像头组件 */}
      {isCameraOpen && (
        <CameraScanner 
          onClose={() => setIsCameraOpen(false)} 
          onScan={(code) => {
            setIsCameraOpen(false);
            submitBarcode(code);
          }} 
        />
      )}
    </div>
  );
};

export default ScannerPage;
