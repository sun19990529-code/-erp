import React, { useState, useEffect } from 'react';
import { api } from '../api';

/**
 * 操作员选择器 — 按部门分组显示人员下拉
 * @param {string} name - 表单字段名（默认 "operator"）
 * @param {string} value - 当前选中值
 * @param {string} className - 自定义 class
 * @param {function} onChange - 值变化回调
 */
const OperatorSelect = ({ name = 'operator', value, defaultValue, className = '', onChange }) => {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    api.get('/operators').then(res => {
      if (res?.success) setGroups(res.data || []);
    }).catch(() => {});
  }, []);

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
