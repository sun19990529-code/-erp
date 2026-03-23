import React from 'react';

const Skeleton = ({ width, height, className = '' }) => (
  <div 
    className={`bg-gray-200 rounded animate-pulse ${className}`}
    style={{ width: width || '100%', height: height || '1rem' }}
  />
);

// 表格骨架屏

const TableSkeleton = ({ rows = 5, cols = 5 }) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-gray-50">
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-4 py-3">
              <Skeleton width="60%" height="0.75rem" />
            </th>
          ))}
          <th className="px-4 py-3">
            <Skeleton width="40%" height="0.75rem" />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="hover:bg-gray-50">
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j} className="px-4 py-3">
                <Skeleton width={j === 0 ? '80%' : '60%'} height="0.875rem" />
              </td>
            ))}
            <td className="px-4 py-3 text-right">
              <Skeleton width="4rem" height="0.875rem" className="inline-block" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// 卡片骨架屏

const CardSkeleton = ({ lines = 3 }) => (
  <div className="bg-white rounded-lg shadow p-4 animate-pulse">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} height="0.875rem" className={`mb-2 ${i === lines - 1 ? 'mb-0 w-3/4' : ''}`} />
    ))}
  </div>
);

export { Skeleton, TableSkeleton, CardSkeleton };
