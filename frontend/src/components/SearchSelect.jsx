import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const SearchSelect = ({ options, value: propValue, onChange, placeholder = '请选择', labelKey = 'name', valueKey = 'id', codeKey = 'code', disabled = false, name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [internalValue, setInternalValue] = useState('');
  const containerRef = useRef(null);
  
  // 支持受控和非受控模式
  const value = propValue !== undefined ? propValue : internalValue;
  
  const filteredOptions = (options || []).filter(opt => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    const label = (opt[labelKey] || '').toLowerCase();
    const code = (opt[codeKey] || '').toLowerCase();
    return label.includes(search) || code.includes(search);
  });
  
  const selectedOption = (options || []).find(opt => opt[valueKey] == value);
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSelect = (opt) => {
    const selectedValue = opt[valueKey];
    setInternalValue(selectedValue);
    onChange?.(selectedValue);
    setIsOpen(false);
    setSearchText('');
  };
  
  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value || ''} />}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-teal-500'}`}
      >
        <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
          {selectedOption ? (
            <span>
              {selectedOption[codeKey] && <span className="text-gray-400 mr-1">[{selectedOption[codeKey]}]</span>}
              {selectedOption[labelKey]}
            </span>
          ) : placeholder}
        </span>
        <i className={`fas fa-chevron-down text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <i className="fas fa-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="搜索..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-teal-500"
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-44">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div
                  key={opt[valueKey]}
                  onClick={() => handleSelect(opt)}
                  className={`px-3 py-2 cursor-pointer hover:bg-teal-50 ${opt[valueKey] == value ? 'bg-teal-100' : ''}`}
                >
                  {opt[codeKey] && <span className="text-gray-400 text-sm mr-1">[{opt[codeKey]}]</span>}
                  {opt[labelKey]}
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-gray-400 text-sm">无匹配结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 用于简单数组选项的可搜索下拉组件

const SimpleSearchSelect = ({ options, value: propValue, onChange, placeholder = '请选择', disabled = false, name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [internalValue, setInternalValue] = useState('');
  const containerRef = useRef(null);
  
  // 支持受控和非受控模式
  const value = propValue !== undefined ? propValue : internalValue;
  
  const filteredOptions = (options || []).filter(opt => {
    if (!searchText) return true;
    return (opt.label || opt).toLowerCase().includes(searchText.toLowerCase());
  });
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSelect = (opt) => {
    const val = opt.value !== undefined ? opt.value : opt;
    setInternalValue(val);
    onChange?.(val);
    setIsOpen(false);
    setSearchText('');
  };
  
  const selectedOption = (options || []).find(opt => (opt.value !== undefined ? opt.value : opt) == value);
  const selectedLabel = selectedOption?.label || selectedOption || '';
  
  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value || ''} />}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-teal-500'}`}
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-400'}>{selectedLabel || placeholder}</span>
        <i className={`fas fa-chevron-down text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <i className="fas fa-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="搜索..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-teal-500"
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-44">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => {
                const val = opt.value !== undefined ? opt.value : opt;
                const label = opt.label || opt;
                return (
                  <div
                    key={i}
                    onClick={() => handleSelect(opt)}
                    className={`px-3 py-2 cursor-pointer hover:bg-teal-50 ${val == value ? 'bg-teal-100' : ''}`}
                  >
                    {label}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-gray-400 text-sm">无匹配结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export { SearchSelect as default, SimpleSearchSelect };
