import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 全流程"下一步"快捷跳转组件
 * 
 * 使用方式:
 * <NextStepActions actions={[
 *   { icon: '📦', label: '去领料', path: '/production/pick' },
 *   { icon: '🔧', label: '去报工', path: '/process/hub', onClick: () => ... },
 * ]} />
 */
const NextStepActions = ({ actions, title = '下一步操作' }) => {
  const navigate = useNavigate();

  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-blue-50 via-indigo-50 to-teal-50 border border-blue-200/60 rounded-xl mt-3 animate-fade-in">
      <span className="text-sm font-medium text-blue-700 mr-0.5 whitespace-nowrap">
        <i className="fas fa-arrow-right mr-1 text-xs"></i>{title}
      </span>
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            if (a.onClick) a.onClick();
            if (a.path) navigate(a.path);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200/80 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all active:scale-95"
        >
          <span className="text-base leading-none">{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
};

export default NextStepActions;
