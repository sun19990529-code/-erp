import React, { useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { TableSkeleton } from './Skeleton';

// 虚拟滚动配置
const VIRTUAL_THRESHOLD = 100; // 超过此行数启用虚拟滚动
const ROW_HEIGHT = 48; // 每行高度（px）
const OVERSCAN = 5; // 预渲染行数

const Table = ({ columns, data, onEdit, onDelete, onView, editPermission, deletePermission, customAction, loading = false }) => {
  const { permissions = [], isAdmin = false } = useAuth();
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const hasPermission = (code) => {
    if (!code) return true;
    if (isAdmin) return true;
    return permissions.includes(code);
  };

  const canEdit = editPermission ? hasPermission(editPermission) : (onEdit ? true : false);
  const canDelete = deletePermission ? hasPermission(deletePermission) : (onDelete ? true : false);
  const showEdit = isAdmin || canEdit;
  const showDelete = isAdmin || canDelete;

  const useVirtual = data.length > VIRTUAL_THRESHOLD;

  // 虚拟滚动计算
  const virtualState = useMemo(() => {
    if (!useVirtual) return null;
    const containerHeight = 600; // 可视区高度
    const totalHeight = data.length * ROW_HEIGHT;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIdx = Math.min(data.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
    return { totalHeight, startIdx, endIdx, containerHeight };
  }, [useVirtual, data.length, scrollTop]);
  
  if (loading) {
    return <TableSkeleton rows={5} cols={columns.length} />;
  }

  const renderRow = (row, idx) => (
    <tr key={row.id || idx} className="block md:table-row hover:bg-gray-50 transition-colors bg-white shadow-sm md:shadow-none rounded-xl md:rounded-none mb-4 md:mb-0 border border-gray-100 md:border-none overflow-hidden" style={useVirtual ? { height: ROW_HEIGHT } : undefined}>
      {columns.map(col => {
        if (col.hideOnMobile) {
          return (
            <td key={col.key} className={`hidden md:table-cell px-4 py-3 text-sm border-b border-gray-50 md:border-none ${col.nowrap === false ? '' : 'whitespace-nowrap'}`}>
              {col.render ? col.render(row[col.key], row) : row[col.key]}
            </td>
          );
        }
        return (
          <td key={col.key} className={`flex md:table-cell justify-between sm:justify-start items-center px-4 py-2.5 md:py-3 text-sm border-b border-gray-50 md:border-none ${col.nowrap === false ? '' : 'whitespace-nowrap'}`}>
            <span className="text-gray-400 font-medium md:hidden shrink-0 mr-4 text-xs">{col.title}</span>
            <span className="text-right md:text-left truncate max-w-[65%] sm:max-w-none">{col.render ? col.render(row[col.key], row) : row[col.key]}</span>
          </td>
        );
      })}
      <td className="block md:table-cell px-4 py-3 md:py-3 md:text-right bg-gray-50/50 md:bg-transparent">
        <div className="flex items-center justify-end md:justify-end gap-3 w-full">
          {customAction && customAction(row)}
          {onView && <button onClick={() => onView(row)} className="text-blue-600 hover:text-blue-800 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-lg shadow-sm md:shadow-none border border-gray-200 md:border-none text-xs font-medium md:text-sm" title="查看"><i className="fas fa-eye md:mr-0 mr-1"></i><span className="md:hidden">查看</span></button>}
          {onEdit && showEdit && <button onClick={() => onEdit(row)} className="text-green-600 hover:text-green-800 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-lg shadow-sm md:shadow-none border border-gray-200 md:border-none text-xs font-medium md:text-sm" title="编辑"><i className="fas fa-edit md:mr-0 mr-1"></i><span className="md:hidden">编辑</span></button>}
          {onDelete && showDelete && <button onClick={() => onDelete(row)} className="text-red-600 hover:text-red-800 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-lg shadow-sm md:shadow-none border border-gray-200 md:border-none text-xs font-medium md:text-sm" title="删除"><i className="fas fa-trash md:mr-0 mr-1"></i><span className="md:hidden">删除</span></button>}
          {!customAction && !onView && !onEdit && !onDelete && <span className="text-gray-400 text-xs">-</span>}
        </div>
      </td>
    </tr>
  );

  // 虚拟滚动模式
  if (useVirtual && virtualState) {
    const visibleRows = data.slice(virtualState.startIdx, virtualState.endIdx);
    return (
      <div className="overflow-x-hidden md:overflow-x-auto">
        <table className="w-full block md:table">
          <thead className="bg-gray-50 sticky top-0 z-10 hidden md:table-header-group">
            <tr>
              {columns.map(col => <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>{col.title}</th>)}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
            </tr>
          </thead>
        </table>
        <div
          ref={scrollRef}
          className="overflow-y-auto w-full custom-scrollbar"
          style={{ maxHeight: virtualState.containerHeight, padding: '0.25rem' }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: virtualState.totalHeight, position: 'relative', width: '100%' }}>
            <table className="w-full block md:table" style={{ position: 'absolute', top: virtualState.startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
              <tbody className="block md:table-row-group md:divide-y divide-gray-200">
                {visibleRows.map((row, i) => renderRow(row, virtualState.startIdx + i))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 text-right">
          共 {data.length} 条 · 虚拟滚动已启用
        </div>
      </div>
    );
  }

  // 普通模式
  return (
    <div className="overflow-x-hidden md:overflow-x-auto p-2 md:p-0">
      <table className="w-full block md:table">
        <thead className="bg-gray-50 hidden md:table-header-group">
          <tr>
            {columns.map(col => <th key={col.key} className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap ${col.hideOnMobile ? 'hidden md:table-cell' : ''}`}>{col.title}</th>)}
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group md:divide-y md:divide-gray-200 space-y-4 md:space-y-0">
          {data.map((row, idx) => renderRow(row, idx))}
          {data.length === 0 && <tr className="block md:table-row bg-white rounded-xl shadow-sm md:shadow-none min-h-[120px]"><td colSpan={columns.length + 1} className="block md:table-cell px-4 py-12 text-center text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <i className="fas fa-inbox text-3xl text-gray-300"></i>
              <span>暂无数据</span>
            </div>
          </td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(Table);
