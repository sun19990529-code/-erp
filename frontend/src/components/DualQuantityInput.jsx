import React from 'react';
import { calcKgPerPiece } from '../utils/unitConvert';

/** 双向换算输入组件 —— 材料消耗用（公斤 ⇄ 支） */
export const DualUnitMaterialInput = React.memo(({ material, value, onChange }) => {
  const kgPerPiece = calcKgPerPiece(material.outer_diameter, material.wall_thickness, material.length);
  const isKgBase = (!material.unit || material.unit === '公斤');
  const derivedValue = kgPerPiece > 0 && value
    ? (isKgBase ? (value / kgPerPiece).toFixed(1) : (value * kgPerPiece).toFixed(2))
    : '';

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input type="number" step="0.01" inputMode="decimal" value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-blue-300 rounded-lg pl-3 pr-8 py-2 sm:py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-shadow"
          placeholder={isKgBase ? '填入重量' : '自动计算'} />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">{isKgBase ? 'Kg' : material.unit}</span>
      </div>
      <i className="fas fa-arrows-alt-h text-gray-300 text-xs"></i>
      <div className="relative flex-1">
        <input type="number" step="0.01" inputMode="decimal" value={derivedValue}
          onChange={e => {
            if (kgPerPiece <= 0) return;
            const val = parseFloat(e.target.value);
            if (isNaN(val)) onChange('');
            else onChange(isKgBase ? (val * kgPerPiece).toFixed(2) : (val / kgPerPiece).toFixed(1));
          }}
          className="w-full border border-blue-300 rounded-lg pl-3 pr-8 py-2 sm:py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-shadow bg-blue-50/30"
          placeholder={isKgBase ? '填入支数' : '填入重量'} />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-500 font-medium">{isKgBase ? '支' : 'Kg'}</span>
      </div>
    </div>
  );
});

/** 双向换算输入组件 —— 报工产出用（Kg 为主，件数为参考） */
export const DualQuantityInput = React.memo(({ label, maxVal, value, onChange, kgPerPiece }) => {
  const [localKg, setLocalKg] = React.useState('');
  // kgSource: 'pieces' = Kg由件数反算显示; 'manual' = 用户手动输入的Kg，不允许被覆盖
  const [kgSource, setKgSource] = React.useState('pieces');
  
  // 仅当 Kg 来源是"由件数派生"时，才用件数反算同步 Kg
  React.useEffect(() => {
    if (kgSource === 'pieces') {
      if (kgPerPiece > 0 && value !== '' && value != null) {
        setLocalKg((parseFloat(value) * kgPerPiece).toFixed(2));
      } else {
        setLocalKg('');
      }
    }
  }, [value, kgPerPiece, kgSource]);
  
  const maxKg = maxVal > 0 && kgPerPiece > 0 ? (maxVal * kgPerPiece).toFixed(2) : '';
  
  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100 mb-2">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 flex justify-between">
          <span>{label} (Kg)</span>
          {maxVal > 0 && <span className="text-teal-600 text-xs mt-0.5">最多 {maxKg || maxVal} {kgPerPiece > 0 ? 'Kg' : '件'}</span>}
        </label>
        <input type="number" step="0.01" inputMode="decimal"
          value={localKg}
          onFocus={() => setKgSource('manual')}
          onChange={e => setLocalKg(e.target.value)}
          onBlur={() => {
            // blur 时把 Kg 换算成件数，但 kgSource 保持 'manual' 不让反算覆盖
            const kg = parseFloat(localKg);
            if (isNaN(kg) || localKg === '') {
              onChange('');
              setKgSource('pieces'); // 清空时重置
              return;
            }
            if (kgPerPiece > 0) onChange(Math.round(kg / kgPerPiece).toString());
            else onChange(Math.round(kg).toString());
            // kgSource 保持 'manual'，所以 localKg 不会被 useEffect 覆盖
          }}
          className="w-full border border-gray-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg px-3 py-3 sm:py-2 text-lg font-bold text-teal-800" placeholder="填入重量(Kg)" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-500 flex justify-between">
          <span>≈ 折算件数 (参考)</span>
          {maxVal > 0 && <span className="text-gray-400 text-xs mt-0.5">≈ {maxVal} 件</span>}
        </label>
        <input type="number" pattern="[0-9]*" inputMode="numeric" max={maxVal > 0 ? maxVal : undefined}
          value={value ?? ''}
          onChange={e => {
            setKgSource('pieces'); // 用户切换到件数输入，Kg 回到"由件数派生"模式
            onChange(e.target.value);
          }}
          className="w-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 rounded-lg px-3 py-3 sm:py-2 text-lg text-blue-700 font-medium bg-blue-50/30" placeholder="或直接填件数" />
        {kgPerPiece <= 0 && <div className="text-yellow-500 text-xs mt-1"><i className="fas fa-exclamation-triangle mr-1"></i>未配置产品尺寸，无法自动换算</div>}
      </div>
    </div>
  );
});
