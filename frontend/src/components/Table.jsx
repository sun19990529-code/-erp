import React, { useContext, useRef, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';
import { TableSkeleton } from './Skeleton';

// 虚拟滚动配置
const VIRTUAL_THRESHOLD = 100; // 超过此行数启用虚拟滚动
const ROW_HEIGHT = 48; // 每行高度（px）
const OVERSCAN = 5; // 预渲染行数

const Table = ({ columns, data, onEdit, onDelete, onView, editPermission, deletePermission, loading = false }) => {
  const { permissions = [], isAdmin = false } = useContext(AuthContext) || {};
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
    <tr key={row.id || idx} className="hover:bg-gray-50 transition-colors" style={useVirtual ? { height: ROW_HEIGHT } : undefined}>
      {columns.map(col => <td key={col.key} className={`px-4 py-3 text-sm ${col.nowrap === false ? '' : 'whitespace-nowrap'}`}>{col.render ? col.render(row[col.key], row) : row[col.key]}</td>)}
      <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
        {onView && <button onClick={() => onView(row)} className="text-blue-600 hover:text-blue-800 mr-2" title="查看"><i className="fas fa-eye"></i></button>}
        {onEdit && showEdit && <button onClick={() => onEdit(row)} className="text-green-600 hover:text-green-800 mr-2" title="编辑"><i className="fas fa-edit"></i></button>}
        {onDelete && showDelete && <button onClick={() => onDelete(row)} className="text-red-600 hover:text-red-800" title="删除"><i className="fas fa-trash"></i></button>}
        {!onView && !onEdit && !onDelete && <span className="text-gray-400">-</span>}
      </td>
    </tr>
  );

  // 虚拟滚动模式
  if (useVirtual && virtualState) {
    const visibleRows = data.slice(virtualState.startIdx, virtualState.endIdx);
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map(col => <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{col.title}</th>)}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
            </tr>
          </thead>
        </table>
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: virtualState.containerHeight }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: virtualState.totalHeight, position: 'relative' }}>
            <table className="w-full" style={{ position: 'absolute', top: virtualState.startIdx * ROW_HEIGHT }}>
              <tbody className="divide-y divide-gray-200">
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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(col => <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{col.title}</th>)}
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, idx) => renderRow(row, idx))}
          {data.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">暂无数据</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(Table);
