import React from 'react';
import { DesktopRow, MobileCard } from './RowComponents';

const SuggestionTable = ({ data, selected, toggleSelect, selectAll }) => {
  return (
    <div className="w-full">
      {/* 桌面端：标准表格 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left w-10">
                <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll}
                  className="w-4 h-4 text-[#007AFF] rounded border-gray-300" />
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">紧急度</th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">物料编码</th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">物料名称</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">当前库存</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">安全库存</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">订单缺口</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">在途采购</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500 text-teal-600">建议采购</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">参考单价</th>
              <th className="px-3 py-3 text-right font-medium text-gray-500">预计金额</th>
              <th className="px-3 py-3 text-left font-medium text-gray-500">首选供应商</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(item => (
              <DesktopRow 
                key={item.product_id}
                item={item} 
                isSelected={selected.has(item.product_id)} 
                toggleSelect={toggleSelect} 
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 移动端/PDA：触碰友好的大卡片流 */}
      <div className="block md:hidden space-y-3 p-2 bg-gray-50/30">
        <div className="flex items-center justify-between mb-3 px-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 font-medium bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm active:bg-gray-50 transition-colors w-full justify-center">
            <input type="checkbox" checked={selected.size === data.length && data.length > 0} onChange={selectAll} className="w-5 h-5 text-teal-600 rounded border-gray-300" />
            全选本页所有缺口
          </label>
        </div>
        
        {data.map(item => (
          <MobileCard 
            key={item.product_id}
            item={item} 
            isSelected={selected.has(item.product_id)} 
            toggleSelect={toggleSelect} 
          />
        ))}
      </div>
    </div>
  );
};

export default SuggestionTable;
