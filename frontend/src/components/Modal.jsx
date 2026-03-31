import React from 'react';

const Modal = ({ isOpen, onClose, title, children, size = 'max-w-2xl' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-end md:justify-center z-50 p-0 md:p-4">
      <div className={`bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full h-auto ${size} max-h-[92vh] md:max-h-[90vh] flex flex-col overflow-hidden fade-in relative`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-between items-center p-4 md:p-4 border-b bg-gray-50 shrink-0 sticky top-0 z-10">
          <h3 className="text-base sm:text-lg font-bold truncate">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-8 h-8 rounded flex items-center justify-center bg-gray-100 hover:bg-gray-200 ml-2 flex-shrink-0 transition-colors"><i className="fas fa-times"></i></button>
        </div>
        <div className="p-4 md:p-4 overflow-y-auto w-full custom-scrollbar flex-1">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
