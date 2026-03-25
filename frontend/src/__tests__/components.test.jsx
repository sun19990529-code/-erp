/**
 * 组件渲染测试
 * 使用 @testing-library/react 测试关键 UI 组件
 * 使用 Vitest 原生断言（不依赖 jest-dom）
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

// ==================== StatusBadge ====================
describe('StatusBadge 组件', () => {
  it('应渲染 pending 状态为"待处理"', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('待处理')).toBeTruthy();
  });

  it('应渲染 completed 状态为"已完成"', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('已完成')).toBeTruthy();
  });

  it('outbound 类型的 completed 应显示"已出库"', () => {
    render(<StatusBadge status="completed" type="outbound" />);
    expect(screen.getByText('已出库')).toBeTruthy();
  });

  it('inbound 类型的 completed 应显示"已入库"', () => {
    render(<StatusBadge status="completed" type="inbound" />);
    expect(screen.getByText('已入库')).toBeTruthy();
  });

  it('未知状态应显示原始值', () => {
    render(<StatusBadge status="unknown_xyz" />);
    expect(screen.getByText('unknown_xyz')).toBeTruthy();
  });

  it('应包含正确的颜色 class', () => {
    const { container } = render(<StatusBadge status="cancelled" />);
    expect(container.firstChild.className).toContain('bg-red-100');
    expect(container.firstChild.className).toContain('text-red-800');
  });
});

// ==================== Modal ====================
describe('Modal 组件', () => {
  it('isOpen=false 时不渲染任何内容', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="测试">
        <p>内容</p>
      </Modal>
    );
    expect(container.innerHTML).toBe('');
  });

  it('isOpen=true 时渲染标题和内容', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="测试弹窗">
        <p>弹窗内容</p>
      </Modal>
    );
    expect(screen.getByText('测试弹窗')).toBeTruthy();
    expect(screen.getByText('弹窗内容')).toBeTruthy();
  });

  it('点击关闭按钮应调用 onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="标题">
        <p>内容</p>
      </Modal>
    );
    const closeBtn = document.querySelector('.fa-times').parentElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ==================== Pagination ====================
describe('Pagination 组件', () => {
  it('totalPages <= 1 时不渲染', () => {
    const { container } = render(
      <Pagination pagination={{ page: 1, total: 5, totalPages: 1 }} onPageChange={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('应渲染总数信息', () => {
    render(
      <Pagination pagination={{ page: 1, total: 100, totalPages: 5 }} onPageChange={() => {}} />
    );
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('第一页时上一页按钮应禁用', () => {
    render(
      <Pagination pagination={{ page: 1, total: 50, totalPages: 3 }} onPageChange={() => {}} />
    );
    const buttons = document.querySelectorAll('button');
    expect(buttons[0].disabled).toBe(true);
  });

  it('最后一页时下一页按钮应禁用', () => {
    render(
      <Pagination pagination={{ page: 3, total: 50, totalPages: 3 }} onPageChange={() => {}} />
    );
    const buttons = document.querySelectorAll('button');
    const lastBtn = buttons[buttons.length - 1];
    expect(lastBtn.disabled).toBe(true);
  });

  it('点击页码应触发 onPageChange', () => {
    const onChange = vi.fn();
    render(
      <Pagination pagination={{ page: 1, total: 50, totalPages: 3 }} onPageChange={onChange} />
    );
    fireEvent.click(screen.getByText('2'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('应生成最多 5 个页码按钮', () => {
    render(
      <Pagination pagination={{ page: 5, total: 200, totalPages: 10 }} onPageChange={() => {}} />
    );
    const pageButtons = document.querySelectorAll('button');
    // 减去上一页和下一页两个按钮
    expect(pageButtons.length - 2).toBeLessThanOrEqual(5);
  });
});
