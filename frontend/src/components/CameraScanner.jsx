import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const CameraScanner = ({ onScan, onClose }) => {
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          await html5QrCode.start(
            { facingMode: "environment" }, // 优先使用后置摄像头
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText, decodedResult) => {
              // 扫码成功回调
              if (onScan) {
                // 加一个短暂的防抖/震动提示
                if (navigator.vibrate) {
                  navigator.vibrate(200);
                }
                onScan(decodedText);
              }
            },
            (errorMessage) => {
              // 忽略解析失败的情况（因为每一帧都在解析，不包含条码的帧都会进这里）
            }
          );
          setIsScanning(true);
        } else {
          setError("未检测到摄像头设备，请检查权限或设备连接");
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError("启动摄像头失败，请确保您已授权，且当前环境为 HTTPS 或 localhost");
      }
    };

    startScanner();

    // 清理函数：组件卸载时停止摄像头
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(err => {
          console.error("Failed to clear html5Qrcode on unmount", err);
        });
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col justify-center items-center">
      {/* 顶部控制栏 */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white">
           <h2 className="text-2xl font-bold tracking-widest text-[#f8fafc]">视频流极速解码</h2>
           <p className="text-teal-400 text-sm mt-1 font-mono">Mobile Camera Mode</p>
        </div>
        <button 
          onClick={onClose}
          className="w-12 h-12 bg-white/10 hover:bg-red-500/80 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm shadow-lg"
        >
          <i className="fas fa-times text-2xl"></i>
        </button>
      </div>

      {/* 扫码取景区域 */}
      <div className="relative w-full max-w-sm mx-auto aspect-square overflow-hidden rounded-3xl border-2 border-white/20 shadow-[0_0_50px_rgba(45,212,191,0.2)] bg-black mt-10">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900 z-20">
             <i className="fas fa-camera-slash text-5xl text-red-400 mb-4"></i>
             <p className="text-red-400 font-medium leading-relaxed">{error}</p>
          </div>
        ) : (
          <div id="reader" className="w-full h-full object-cover"></div>
        )}
        
        {/* 扫描线动画 */}
        {isScanning && !error && (
          <div className="absolute top-0 left-0 w-full h-1 bg-teal-400 drop-shadow-[0_0_12px_rgba(45,212,191,1)] animate-scan pointer-events-none z-10"></div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="mt-12 text-center space-y-4">
        {isScanning && !error ? (
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></div>
            <span className="font-bold tracking-wider">请将条码放入框内，自动识别</span>
          </div>
        ) : null}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 5%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        /* html5-qrcode 默认会注入一些多余的 UI 元素，隐藏它们 */
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
        #reader img {
          display: none !important;
        }
      `}} />
    </div>
  );
};

export default CameraScanner;
