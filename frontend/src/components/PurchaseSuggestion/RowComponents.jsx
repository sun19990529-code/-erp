import React from 'react';

export const urgencyConfig = {
  critical: { label: '紧急', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', icon: 'fa-exclamation-circle' },
  high:     { label: '较高', color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300', icon: 'fa-exclamation-triangle' },
  medium:   { label: '一般', color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300', icon: 'fa-info-circle' },
  normal:   { label: '正常', color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-300', icon: 'fa-check-circle' },
};

export const DesktopRow = React.memo(({ item, isSelected, toggleSelect }) => {
  const cfg = urgencyConfig[item.urgency] || urgencyConfig.normal;
  return (
    <tr className={`hover:bg-gray-50/80 transition-colors ${isSelected ? 'bg-[#E5F1FF]' : ''}`}>
      <td className="px-3 py-3">
        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.product_id)}
          className="w-4 h-4 text-[#007AFF] rounded border-gray-300 smooth-focus" />
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${cfg.bg} ${cfg.color} shadow-sm`}>
          <i className={`fas ${cfg.icon}`}></i>{cfg.label}
        </span>
      </td>
      <td className="px-3 py-3 font-mono text-xs">{item.product_code}</td>
      <td className="px-3 py-3">
        <div className="font-bold text-gray-800">{item.product_name}</div>
        {item.specification && <div className="text-[11px] text-gray-500 mt-0.5">{item.specification}</div>}
      </td>
      <td className="px-3 py-3 text-right">
        <span className={item.current_stock === 0 ? 'text-red-500 font-bold' : 'font-medium'}>{item.current_stock}</span>
        <span className="text-gray-400 text-xs ml-0.5">{item.unit}</span>
      </td>
      <td className="px-3 py-3 text-right text-gray-400">{item.min_stock || '-'}</td>
      <td className="px-3 py-3 text-right">
        {item.order_shortage > 0 ? (
          <div className="relative group inline-block">
            <span className="text-orange-500 font-bold cursor-help border-b border-dotted border-orange-300 pb-0.5 hover:text-orange-600 transition-colors">{item.order_shortage}</span>
            {item.demand_sources?.length > 0 && (
              <div className="absolute right-0 bottom-full mb-2 w-80 glass-dark-panel text-white text-xs rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 text-left" style={{ pointerEvents: 'none' }}>
                <div className="font-bold text-amber-400 mb-2 border-b border-white/10 pb-2 flex items-center gap-2"><i className="fas fa-sitemap"></i>需求溯源</div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {item.demand_sources.map((d, i) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                      <div className="truncate shrink-0 w-20 text-gray-300" title={d.customer_name}>{d.customer_name || '内部需求'}</div>
                      <div className="text-teal-300 font-mono text-[10px] w-24 text-right truncate" title={d.order_no}>{d.order_no}</div>
                      <div className="flex-1 text-right font-bold text-amber-400 ml-2 whitespace-nowrap">{d.shortage}<span className="text-white/40 font-normal ml-0.5 text-[10px]">{item.unit}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : '-'}
      </td>
      <td className="px-3 py-3 text-right">
        {item.in_transit > 0 ? (
          <span className="text-blue-500 font-medium">{item.in_transit}</span>
        ) : '-'}
      </td>
      <td className="px-3 py-3 text-right">
        <span className="font-black text-teal-600 text-base tracking-tight">{item.suggested_quantity}</span>
        <span className="text-gray-400 text-xs ml-0.5 font-medium">{item.unit}</span>
      </td>
      <td className="px-3 py-3 text-right text-gray-500">¥{Number(item.unit_price || 0).toFixed(2)}</td>
      <td className="px-3 py-3 text-right font-bold text-gray-700">¥{Number(item.estimated_amount || 0).toFixed(2)}</td>
      <td className="px-3 py-3">
        {item.default_supplier ? (
          <span className="text-sm text-gray-600">{item.default_supplier.name}</span>
        ) : (
          <span className="text-[11px] text-gray-400 italic">未绑定</span>
        )}
      </td>
    </tr>
  );
});

export const MobileCard = React.memo(({ item, isSelected, toggleSelect }) => {
  const cfg = urgencyConfig[item.urgency] || urgencyConfig.normal;
  return (
    <div 
      onClick={() => toggleSelect(item.product_id)} 
      className={`relative apple-card p-4 transition-all active:scale-[0.98] ${isSelected ? 'border-[#007AFF] ring-2 ring-[#007AFF]/20 bg-[#E5F1FF]/50' : ''}`}
    >
      <div className="absolute right-4 top-4">
        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#007AFF] border-[#007AFF]' : 'border-gray-200 bg-gray-50'}`}>
          {isSelected && <i className="fas fa-check text-white text-xs"></i>}
        </div>
      </div>
      
      <div className="flex flex-col items-start gap-1 mb-4 pr-10">
         <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
            <i className={`fas ${cfg.icon}`}></i>{cfg.label}
         </span>
         <div className="font-bold text-gray-800 text-lg leading-snug tracking-tight mt-1">{item.product_name}</div>
         <div className="text-[11px] text-gray-500 font-mono flex gap-2 w-full truncate">
           <span>{item.product_code}</span>
           {item.specification && <span className="text-gray-400">· {item.specification}</span>}
         </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm mt-2 border-t border-gray-100/50 pt-3">
         <div className="bg-gray-50 rounded-xl p-2 flex flex-col items-center justify-center text-center">
           <span className="text-[11px] text-gray-400 mb-1">当前存量</span>
           <span className={`text-xl font-bold tracking-tight ${item.current_stock === 0 ? 'text-red-500' : 'text-gray-700'}`}>{item.current_stock}<span className="text-[10px] font-normal ml-0.5">{item.unit}</span></span>
         </div>
         <div className="bg-orange-50/50 rounded-xl p-2 flex flex-col items-center justify-center text-center border border-orange-100/50 relative group">
           <span className="text-[11px] text-orange-500/80 mb-1 flex items-center gap-1 font-medium">
             订单缺口
           </span>
           <span className="text-xl font-bold text-orange-600 tracking-tight">{item.order_shortage > 0 ? item.order_shortage : '-'}</span>
         </div>
         
         <div className="col-span-2 flex justify-between items-center bg-[#F5F5F7] rounded-xl p-3 border border-gray-200/50">
           <div className="flex flex-col">
             <span className="text-[11px] text-gray-500 mb-0.5 font-bold uppercase tracking-wider"><i className="fas fa-bolt mr-1"></i>建议采购</span>
             <span className="text-[#007AFF] font-black text-2xl tracking-tighter">{item.suggested_quantity} <span className="text-[11px] font-bold tracking-normal text-[#007AFF]/70">{item.unit}</span></span>
           </div>
           <div className="text-right flex flex-col justify-end">
             <span className="text-[10px] text-gray-400 mb-1">参考: ¥{Number(item.unit_price || 0).toFixed(2)}</span>
             <span className="font-bold text-gray-800 text-sm tracking-tight">预估 <span className="text-[15px] text-gray-900">¥{Number(item.estimated_amount || 0).toFixed(2)}</span></span>
           </div>
         </div>
      </div>
      
      <div className="flex justify-between items-center text-[11px] border-t border-gray-100/50 pt-3">
         <div className="text-gray-500 flex items-center gap-1.5"><i className="fas fa-truck-loading text-blue-400/80"></i> 待收: {item.in_transit > 0 ? <strong className="text-blue-500">{item.in_transit}</strong> : '无'}</div>
         <div className={`px-2.5 py-1 rounded-lg truncate max-w-[50%] font-medium ${item.default_supplier ? 'bg-gray-100/80 text-gray-600' : 'bg-red-50 text-red-400 italic'}`}>
           {item.default_supplier ? item.default_supplier.name : '⚠ 未绑定'}
         </div>
      </div>
    </div>
  );
});
