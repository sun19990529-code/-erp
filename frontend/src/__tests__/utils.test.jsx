/**
 * 工具函数/纯逻辑测试
 * 提取组件中的纯逻辑函数进行独立测试
 */

// ==================== StatusBadge 标签映射逻辑 ====================
// 从 StatusBadge.jsx 提取的纯逻辑
function getStatusLabel(status, type) {
  if (status === 'completed') {
    if (type === 'outbound' || type === 'pick') return '已出库';
    if (type === 'inbound') return '已入库';
    return '已完成';
  }
  const labels = {
    pending: '待处理', confirmed: '已确认', processing: '进行中',
    approved: '已审批', cancelled: '已取消', rejected: '检验不合格',
    received: '已收货', pending_inspection: '待检验',
    inspection_passed: '检验通过', inspection_failed: '检验不合格',
    shipped: '已发货'
  };
  return labels[status] || status;
}

function getStatusColor(status) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    processing: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800',
    received: 'bg-purple-100 text-purple-800',
    pending_inspection: 'bg-orange-100 text-orange-800',
    inspection_passed: 'bg-green-100 text-green-800',
    inspection_failed: 'bg-red-100 text-red-800',
    shipped: 'bg-blue-100 text-blue-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

describe('状态标签映射', () => {
  it('应映射所有已知状态', () => {
    expect(getStatusLabel('pending')).toBe('待处理');
    expect(getStatusLabel('confirmed')).toBe('已确认');
    expect(getStatusLabel('processing')).toBe('进行中');
    expect(getStatusLabel('approved')).toBe('已审批');
    expect(getStatusLabel('cancelled')).toBe('已取消');
    expect(getStatusLabel('rejected')).toBe('检验不合格');
    expect(getStatusLabel('received')).toBe('已收货');
    expect(getStatusLabel('shipped')).toBe('已发货');
  });

  it('completed 应根据 type 返回不同文案', () => {
    expect(getStatusLabel('completed', 'outbound')).toBe('已出库');
    expect(getStatusLabel('completed', 'inbound')).toBe('已入库');
    expect(getStatusLabel('completed', 'pick')).toBe('已出库');
    expect(getStatusLabel('completed')).toBe('已完成');
  });

  it('未知状态应返回原始值', () => {
    expect(getStatusLabel('xyz')).toBe('xyz');
  });
});

describe('状态颜色映射', () => {
  it('每种状态应有对应颜色', () => {
    expect(getStatusColor('pending')).toContain('yellow');
    expect(getStatusColor('completed')).toContain('green');
    expect(getStatusColor('cancelled')).toContain('red');
    expect(getStatusColor('received')).toContain('purple');
    expect(getStatusColor('pending_inspection')).toContain('orange');
  });

  it('未知状态应返回灰色', () => {
    expect(getStatusColor('unknown')).toContain('gray');
  });
});

// ==================== Pagination 页码生成算法 ====================
// 从 Pagination.jsx 提取的纯逻辑
function getPageNumbers(page, totalPages) {
  const pages = [];
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

describe('分页页码生成算法', () => {
  it('总共3页，当前第1页: [1,2,3]', () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3]);
  });

  it('总共10页，当前第5页: [3,4,5,6,7]', () => {
    expect(getPageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]);
  });

  it('总共10页，当前第1页: [1,2,3,4,5]', () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('总共10页，当前第10页: [6,7,8,9,10]', () => {
    expect(getPageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });

  it('总共1页: [1]', () => {
    expect(getPageNumbers(1, 1)).toEqual([1]);
  });
});

// ==================== useDebounce Hook 测试 ====================
// 使用 fake timers 测试真实的 useDebounce hook
import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDebounce } from '../hooks/useDebounce';

function DebounceTestHelper({ delay = 300 }) {
  const [input, setInput] = useState('');
  const debounced = useDebounce(input, delay);
  return (
    <div>
      <input data-testid="input" value={input} onChange={e => setInput(e.target.value)} />
      <span data-testid="debounced">{debounced}</span>
    </div>
  );
}

describe('useDebounce Hook', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('初始值应立即返回', () => {
    render(<DebounceTestHelper />);
    expect(screen.getByTestId('debounced').textContent).toBe('');
  });

  it('输入后应在延迟后更新', () => {
    render(<DebounceTestHelper />);
    fireEvent.change(screen.getByTestId('input'), { target: { value: '测试' } });
    // 未到延迟时间，debounced 值不变
    expect(screen.getByTestId('debounced').textContent).toBe('');
    // 推进时间到 300ms
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('debounced').textContent).toBe('测试');
  });

  it('快速连续输入应只触发最后一次', () => {
    render(<DebounceTestHelper />);
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'a' } });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'ab' } });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'abc' } });
    // 再等 300ms（从最后一次输入算起）
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('debounced').textContent).toBe('abc');
  });

  it('自定义延迟应生效', () => {
    render(<DebounceTestHelper delay={500} />);
    fireEvent.change(screen.getByTestId('input'), { target: { value: '延迟500' } });
    act(() => { vi.advanceTimersByTime(300); });
    // 300ms 时还没更新
    expect(screen.getByTestId('debounced').textContent).toBe('');
    act(() => { vi.advanceTimersByTime(200); });
    // 500ms 时更新
    expect(screen.getByTestId('debounced').textContent).toBe('延迟500');
  });
});

