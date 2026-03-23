import React from 'react';

const Modal = ({ isOpen, onClose, title, children, size = 'max-w-2xl' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`bg-white md:rounded-xl shadow-2xl w-full h-full md:h-auto ${size} max-h-screen md:max-h-[90vh] flex flex-col overflow-hidden fade-in`}>
        <div className="flex justify-between items-center p-3 sm:p-4 border-b bg-gray-50 shrink-0">
          <h3 className="text-base sm:text-lg font-bold truncate">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl ml-2 flex-shrink-0"><i className="fas fa-times"></i></button>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
