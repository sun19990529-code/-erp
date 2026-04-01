import React, { useState } from 'react';
import { useScanner } from '../hooks/useScanner';

const ScanStation = ({ onActiveMenuChange }) => {
  const [scanLog, setScanLog] = useState([]);
  const handleScan = (code) => {
    if (code) {
      setScanLog(prev => [{ time: new Date().toLocaleTimeString(), code }, ...prev].slice(0, 20));
      if (code.startsWith('PO-')) {
        onActiveMenuChange('production-orders');
        setTimeout(() => window.__toast?.warning(`扫码识别为生产工单: ${code}，已跳转！`), 100);
      } else if (code.startsWith('IN-')) {
        onActiveMenuChange('inbound');
        setTimeout(() => window.__toast?.warning(`扫码识别为入库单: ${code}，已跳转！`), 100);
      } else {
        // 识别工位二维码 URL
        const wsMatch = code.match(/\/ws\/([A-Za-z0-9_-]+)/);
        if (wsMatch) {
          window.open(`/ws/${wsMatch[1]}`, '_blank');
          setTimeout(() => window.__toast?.success(`识别到工位码: ${wsMatch[1]}，已打开工位屏幕`), 100);
        } else {
          try {
            const parsed = JSON.parse(code);
            if(parsed.type === 'product') {
               onActiveMenuChange('inventory');
               setTimeout(() => window.__toast?.warning(`识别到物料编码: ${parsed.id}，进入库存检索`), 100);
            }
          } catch(err) { 
            // 如果解析 JSON 失败，可能只是一串原生字符
            window.__toast?.info(`已扫描条码: ${code}`);
          }
        }
      }
    }
  };

  // 挂载 PDA 全局防抖扫码监听器
  useScanner(handleScan);

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-teal-600 to-teal-800 rounded-2xl p-5 md:p-8 text-white shadow-lg mb-4 md:mb-6 flex flex-col md:flex-row items-center gap-4 md:gap-6 text-center md:text-left">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-inner shrink-0">
          <i className="fas fa-barcode text-3xl md:text-4xl"></i>
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold mb-1 md:mb-2">智能扫码控制台 <span className="text-xs bg-teal-500 px-2 py-0.5 rounded-full ml-2 align-middle">PDA 模式已开启</span></h2>
          <p className="text-teal-100 opacity-90 text-sm md:text-base">直接使用 PDA 硬件扫码头扫描条码即可，本页面无需手动输入或调出虚拟键盘。</p>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8 text-center">
        <div className="relative max-w-lg mx-auto mb-6 md:mb-8">
          <div className="w-full h-[60px] md:h-[68px] flex items-center justify-center text-teal-600 bg-teal-50/50 border-2 border-dashed border-teal-400 rounded-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-teal-400/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <i className="fas fa-barcode absolute left-4 md:left-6 text-teal-400 text-xl md:text-2xl animate-pulse"></i>
            <span className="font-bold text-lg md:text-xl tracking-wider select-none">等待硬件扫码...</span>
          </div>
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
