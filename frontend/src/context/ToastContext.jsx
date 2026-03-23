import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const ToastContainer = ({ toasts, removeToast }) => (
  <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
    {toasts.map(t => (
      <div key={t.id}
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-medium pointer-events-auto
          transition-all duration-300 animate-slide-in
          ${ t.type === 'success' ? 'bg-gradient-to-r from-teal-600 to-cyan-600'
           : t.type === 'error'   ? 'bg-gradient-to-r from-red-500 to-rose-600'
           : t.type === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-500'
           : 'bg-gradient-to-r from-blue-500 to-indigo-600' }`}
      >
        <i className={`fas mt-0.5 flex-shrink-0
          ${ t.type === 'success' ? 'fa-check-circle'
           : t.type === 'error'   ? 'fa-times-circle'
           : t.type === 'warning' ? 'fa-exclamation-triangle'
           : 'fa-info-circle' }`} />
        <span className="flex-1 leading-snug">{t.message}</span>
        <button onClick={() => removeToast(t.id)} className="opacity-60 hover:opacity-100 transition-opacity"><i className="fas fa-times text-xs" /></button>
      </div>
    ))}
  </div>
);


const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]); // 最多5条
    if (duration > 0) setTimeout(() => removeToast(id), duration);
  }, [removeToast]);
  const toast = {
    success: (msg, d) => addToast(msg, 'success', d),
    error:   (msg, d) => addToast(msg, 'error', d),
    warning: (msg, d) => addToast(msg, 'warning', d),
    info:    (msg, d) => addToast(msg, 'info', d),
  };
  // 挂载命令式 toast，允许在 hooks 回调外使用
  useEffect(() => { window.__toast = toast; }, [addToast]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

export { ToastContext, ToastContainer, ToastProvider };
