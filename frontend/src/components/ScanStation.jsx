import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import PrintableQRCode from './PrintableQRCode';
import StatusBadge from './StatusBadge';
import Modal from './Modal';

const ScanStation = ({ onActiveMenuChange }) => {
  const [scanResult, setScanResult] = useState('');
  const [scanLog, setScanLog] = useState([]);
  const inputRef = useRef(null);
  
  useEffect(() => {
    const focusInput = () => { if (inputRef.current) inputRef.current.focus(); };
    focusInput();
    window.addEventListener('click', focusInput);
    return () => window.removeEventListener('click', focusInput);
  }, []);

  const handleScan = (e) => {
    if (e.key === 'Enter') {
      const code = scanResult.trim();
      if (code) {
        setScanLog(prev => [{ time: new Date().toLocaleTimeString(), code }, ...prev].slice(0, 20));
        setScanResult('');
        if (code.startsWith('PO-')) {
          onActiveMenuChange('production-orders');
          setTimeout(() => window.__toast?.warning(`扫码识别为生产工单: ${code}，已跳转！`), 100);
        } else if (code.startsWith('IN-')) {
          onActiveMenuChange('inbound');
          setTimeout(() => window.__toast?.warning(`扫码识别为入库单: ${code}，已跳转！`), 100);
        } else {
          try {
            const parsed = JSON.parse(code);
            if(parsed.type === 'product') {
               onActiveMenuChange('inventory');
               setTimeout(() => window.__toast?.warning(`识别到物料编码: ${parsed.id}，进入库存检索`), 100);
            }
          } catch(err) { /* ignore parse error */ }
        }
      }
    }
  };

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-teal-600 to-teal-800 rounded-2xl p-8 text-white shadow-lg mb-6 flex items-center gap-6">
        <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-inner">
          <i className="fas fa-barcode text-4xl"></i>
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">智能扫码收银台</h2>
          <p className="text-teal-100 opacity-90">处于此界面时，直接使用 USB 扫码枪扫描包装条码、工单二维码或物流签即可自动分发指令。</p>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="relative max-w-lg mx-auto mb-8">
          <i className="fas fa-qrcode absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl"></i>
          <input 
            ref={inputRef}
            value={scanResult}
            onChange={e => setScanResult(e.target.value)}
            onKeyDown={handleScan}
            placeholder="等待扫码输入... 键盘录入请按回车确认" 
            className="w-full text-center text-xl tracking-widest pl-12 pr-4 py-4 border-2 border-teal-500 rounded-xl focus:ring-4 focus:ring-teal-500/20 focus:outline-none transition-all shadow-inner"
            autoFocus
          />
        </div>
        
        <div className="bg-gray-50 rounded-xl p-4 text-left h-64 overflow-y-auto">
          <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">当前工作流记录</h4>
          {scanLog.length === 0 ? <p className="text-gray-400 text-center py-4">等待扫码动作</p> : (
            <ul className="space-y-2">
              {scanLog.map((log, i) => (
                <li key={i} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                  <span className="font-mono font-medium text-teal-700">{log.code}</span>
                  <span className="text-xs text-gray-400">{log.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScanStation;
