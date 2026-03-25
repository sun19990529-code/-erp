import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';

const SearchFilter = ({ searchPlaceholder = '搜索...', searchValue, onSearchChange, filters = [], onFilterChange, onReset, debounceDelay = 300 }) => {
  const [localSearchValue, setLocalSearchValue] = useState(searchValue || '');
  const debouncedValue = useDebounce(localSearchValue, debounceDelay);
  const prevSearchValueRef = useRef(searchValue);
  
  useEffect(() => {
    if (debouncedValue !== searchValue) {
      onSearchChange?.(debouncedValue);
    }
  }, [debouncedValue, searchValue, onSearchChange]);
  
  // 外部 searchValue 变化时同步到本地（如重置操作）
  if (searchValue !== prevSearchValueRef.current) {
    prevSearchValueRef.current = searchValue;
    if (searchValue !== localSearchValue && searchValue !== debouncedValue) {
      setLocalSearchValue(searchValue || '');
    }
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap gap-3 items-center">
      <div className="relative w-full sm:flex-1 min-w-[200px]">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={localSearchValue}
          onChange={e => setLocalSearchValue(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
        />
      </div>
      <div className="w-full sm:w-auto flex flex-wrap gap-2 flex-1 sm:flex-none">
        {filters.map(filter => (
          <select
            key={filter.key}
            value={filter.value || ''}
            onChange={e => onFilterChange?.(filter.key, e.target.value)}
            className="border rounded-lg px-3 py-2 flex-1 min-w-[110px] sm:min-w-[120px] sm:flex-none"
          >
            <option value="">{filter.label}</option>
            {filter.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ))}
        {onReset && (
          <button onClick={() => { setLocalSearchValue(''); onReset(); }} className="px-3 py-2 text-gray-600 hover:text-gray-800 border rounded-lg hover:bg-gray-50 flex-1 sm:flex-none">
            <i className="fas fa-redo mr-1"></i>重置
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchFilter;
