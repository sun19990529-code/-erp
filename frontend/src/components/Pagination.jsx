import React from 'react';

/**
 * 分页组件
 * @param {{ page, pageSize, total, totalPages }} pagination - 后端返回的分页信息
 * @param {function} onPageChange - 翻页回调
 */
const Pagination = React.memo(({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, total, totalPages } = pagination;

  // 生成页码按钮（最多显示 5 个）
  const getPageNumbers = () => {
    const pages = [];
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
      <div className="text-sm text-gray-500">
        共 <span className="font-medium text-gray-700">{total}</span> 条
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        {getPageNumbers().map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              p === page
                ? 'bg-blue-500 text-white shadow-sm'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 text-sm rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
});

Pagination.displayName = 'Pagination';

export default Pagination;
