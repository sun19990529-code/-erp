import React, { useEffect } from 'react';

const Drawer = ({ isOpen, onClose, title, children, size = 'max-w-lg' }) => {
  // 当抽屉打开时，阻止底层页面滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* 半透明遮罩层 (点击关闭) */}
      <div 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity fade-in"
        onClick={onClose}
      />
      
      {/* 右侧滑出的抽屉主体 */}
      <div className="absolute inset-y-0 right-0 max-w-full flex">
        <div className={`w-screen ${size} transform transition-transform duration-300 ease-in-out bg-white shadow-2xl flex flex-col translate-x-0 animate-[slideInRight_0.3s_ease-out]`}>
          
          {/* 头部标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/80">
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200/50"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
          
          {/* 内容区 (支持独立滚动) */}
          <div className="flex-1 relative overflow-y-auto px-6 py-6 custom-scrollbar">
            {children}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default Drawer;
