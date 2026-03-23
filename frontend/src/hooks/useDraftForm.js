import { useState, useCallback } from 'react';

const useDraftForm = (key, initialState) => {
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem('draft_' + key);
      return saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
    } catch { return initialState; }
  });
  const [hasDraft, setHasDraft] = useState(() => !!localStorage.getItem('draft_' + key));

  const updateForm = useCallback((updater) => {
    setForm(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      try { localStorage.setItem('draft_' + key, JSON.stringify(next)); } catch { /* ignore */ }
      setHasDraft(true);
      return next;
    });
  }, [key]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem('draft_' + key);
    setHasDraft(false);
    setForm(initialState);
  }, [key, initialState]);

  return [form, updateForm, clearDraft, hasDraft];
};

export { useDraftForm };
