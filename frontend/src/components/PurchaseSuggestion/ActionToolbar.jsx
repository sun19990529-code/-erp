import React from 'react';

const ActionToolbar = ({ selectedSize, selectedAmount, createOrders, creating }) => {
  if (selectedSize === 0) return null;

  return (
    <div className="px-5 py-4 bg-white/95 backdrop-blur-md border-b border-gray-200 flex items-center justify-between animate-fade-in absolute top-0 left-0 w-full z-10 shadow-sm">
      <span className="text-sm font-medium text-gray-800">
        <i className="fas fa-check-circle mr-2 text-[#007AFF]"></i>
        已选 <strong>{selectedSize}</strong> 项，预计金额 <strong className="font-mono text-base ml-1">¥{Number(selectedAmount || 0).toFixed(2)}</strong>
      </span>
      <button
        onClick={createOrders}
        disabled={creating}
        className="apple-btn-primary px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 !bg-none bg-[#007AFF] hover:bg-[#006CE6] transition-colors border-none"
      >
        {creating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-magic"></i>}
        一键生成采购单
      </button>
    </div>
  );
};

export default ActionToolbar;
