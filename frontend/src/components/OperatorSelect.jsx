import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

/**
 * 操作员选择器 — 按部门分组显示人员下拉
 * @param {string} name - 表单字段名（默认 "operator"）
 * @param {string} value - 当前选中值
 * @param {string} className - 自定义 class
 * @param {function} onChange - 值变化回调
 */
const OperatorSelect = ({ name = 'operator', value, defaultValue, className = '', onChange }) => {
  const [groups, setGroups] = useState([]);
  const { user, isAdmin } = useAuth();
  
  // 非管理员且非 public 环境（有 user），强制只读
  const isReadOnly = !isAdmin && !!user;
  const autoName = user?.real_name || user?.username || '';

  useEffect(() => {
    if (!isReadOnly) {
      api.get('/operators').then(res => {
        if (res?.success) setGroups(res.data || []);
      }).catch(() => {});
    }
  }, [isReadOnly]);

  // 组件挂载或用户信息就绪时，强制向上抛出当前用户名
  useEffect(() => {
    if (isReadOnly && autoName && onChange) {
      // 避免重复触发
      if (value !== autoName) {
        onChange({ target: { name, value: autoName } });
      }
    }
  }, [isReadOnly, autoName, onChange, name, value]);

  if (isReadOnly) {
    return (
      <input
        type="text"
        name={name}
        value={autoName}
        readOnly
        className={`w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed ${className}`}
      />
    );
  }

  return (
    <select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      className={`w-full border rounded-lg px-3 py-2 ${className}`}
    >
      <option value="">请选择操作员</option>
      {groups.map(g => (
        <optgroup key={g.department} label={g.department}>
          {g.members.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

export default React.memo(OperatorSelect);
