/**
 * Hook 测试
 * 测试 useDraftForm 的 localStorage 持久化逻辑
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDraftForm } from '../hooks/useDraftForm';

// Mock localStorage（jsdom 有限实现）
const createMockStorage = () => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
};

// 包装组件：将 hook 状态暴露到 DOM 中以便断言
function DraftFormTestHelper({ draftKey, initialState }) {
  const [form, updateForm, clearDraft, hasDraft] = useDraftForm(draftKey, initialState);
  return (
    <div>
      <span data-testid="form-data">{JSON.stringify(form)}</span>
      <span data-testid="has-draft">{String(hasDraft)}</span>
      <button data-testid="update-name" onClick={() => updateForm({ name: '测试产品' })}>更新名字</button>
      <button data-testid="update-fn" onClick={() => updateForm(prev => ({ ...prev, count: (prev.count || 0) + 10 }))}>函数更新</button>
      <button data-testid="clear" onClick={clearDraft}>清除</button>
    </div>
  );
}

describe('useDraftForm Hook', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('无草稿时应返回初始状态', () => {
    render(<DraftFormTestHelper draftKey="test1" initialState={{ name: '', qty: 0 }} />);
    const formData = JSON.parse(screen.getByTestId('form-data').textContent);
    expect(formData).toEqual({ name: '', qty: 0 });
    expect(screen.getByTestId('has-draft').textContent).toBe('false');
  });

  it('updateForm 应更新状态并写入 localStorage', () => {
    render(<DraftFormTestHelper draftKey="test2" initialState={{ name: '', qty: 0 }} />);
    fireEvent.click(screen.getByTestId('update-name'));
    const formData = JSON.parse(screen.getByTestId('form-data').textContent);
    expect(formData.name).toBe('测试产品');
    expect(screen.getByTestId('has-draft').textContent).toBe('true');
    const saved = JSON.parse(localStorage.getItem('draft_test2'));
    expect(saved.name).toBe('测试产品');
  });

  it('clearDraft 应清除 localStorage 并重置状态', () => {
    render(<DraftFormTestHelper draftKey="test3" initialState={{ name: '', qty: 0 }} />);
    fireEvent.click(screen.getByTestId('update-name'));
    fireEvent.click(screen.getByTestId('clear'));
    const formData = JSON.parse(screen.getByTestId('form-data').textContent);
    expect(formData).toEqual({ name: '', qty: 0 });
    expect(screen.getByTestId('has-draft').textContent).toBe('false');
    expect(localStorage.getItem('draft_test3')).toBeNull();
  });

  it('应从 localStorage 恢复草稿', () => {
    localStorage.setItem('draft_resume', JSON.stringify({ name: '恢复的草稿', qty: 5 }));
    render(<DraftFormTestHelper draftKey="resume" initialState={{ name: '', qty: 0 }} />);
    const formData = JSON.parse(screen.getByTestId('form-data').textContent);
    expect(formData).toEqual({ name: '恢复的草稿', qty: 5 });
    expect(screen.getByTestId('has-draft').textContent).toBe('true');
  });

  it('updateForm 支持函数式更新', () => {
    render(<DraftFormTestHelper draftKey="test5" initialState={{ count: 0 }} />);
    fireEvent.click(screen.getByTestId('update-fn'));
    const formData = JSON.parse(screen.getByTestId('form-data').textContent);
    expect(formData.count).toBe(10);
  });
});
