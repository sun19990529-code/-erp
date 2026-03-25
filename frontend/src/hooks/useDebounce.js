import { useState, useEffect } from 'react';

/**
 * 防抖 Hook
 * 延迟更新值，在 delay 毫秒内无新值时才生效
 * @param {*} value - 需要防抖的值
 * @param {number} delay - 延迟毫秒数，默认 300ms
 * @returns {*} 防抖后的值
 */
const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

export { useDebounce };
