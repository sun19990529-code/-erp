import React, { useState, useCallback, useRef } from 'react';

/**
 * ConfirmModal - 替代原生 window.confirm 的统一确认弹窗
 * 使用方式：const [confirm, ConfirmDialog] = useConfirm();
 *          if (await confirm('确定删除？')) { ... }
 */
const ConfirmModal = ({ isOpen, title, message, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  const iconMap = {
    danger: { icon: 'fa-exclamation-triangle', color: 'text-red-500', bg: 'bg-red-50', btn: 'bg-red-600 hover:bg-red-700' },
    warning: { icon: 'fa-exclamation-circle', color: 'text-amber-500', bg: 'bg-amber-50', btn: 'bg-amber-600 hover:bg-amber-700' },
    info: { icon: 'fa-question-circle', color: 'text-blue-500', bg: 'bg-blue-50', btn: 'bg-blue-600 hover:bg-blue-700' },
  };
  const style = iconMap[type] || iconMap.info;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-5 text-center">
          <div className={`w-12 h-12 ${style.bg} rounded-full flex items-center justify-center mx-auto mb-3`}>
            <i className={`fas ${style.icon} ${style.color} text-xl`}></i>
          </div>
          {title && <h3 className="font-bold text-gray-800 mb-2">{title}</h3>}
          <p className="text-gray-600 text-sm whitespace-pre-line">{message}</p>
        </div>
        <div className="flex border-t">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium rounded-bl-xl"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-white ${style.btn} transition-colors text-sm font-medium rounded-br-xl`}
            autoFocus
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * useConfirm Hook - 提供 async confirm 函数 + 渲染组件
 * @returns {[Function, JSX.Element]} [confirm, ConfirmDialog]
 * 
 * confirm(message, options?) → Promise<boolean>
 * options: { title?: string, type?: 'info'|'warning'|'danger' }
 */
export function useConfirm() {
  const [state, setState] = useState({ isOpen: false, message: '', title: '', type: 'info' });
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    const type = message.includes('⚠️') || message.includes('警告') || message.includes('强制')
      ? 'danger'
      : message.includes('确认') || message.includes('审批')
        ? 'warning'
        : 'info';

    setState({
      isOpen: true,
      message,
      title: options.title || '',
      type: options.type || type,
    });

    return new Promise(resolve => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
    resolveRef.current?.(false);
  }, []);

  const Dialog = (
    <ConfirmModal
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      type={state.type}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return [confirm, Dialog];
}

export default ConfirmModal;
