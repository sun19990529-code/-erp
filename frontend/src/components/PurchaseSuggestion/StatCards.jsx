import React from 'react';

const StatCards = ({ summary }) => {
  const cards = [
    { label: '建议采购项', value: summary.total_items || 0, icon: 'fa-clipboard-list', color: 'text-gray-800', badgeColor: 'text-[#007AFF]', bg: 'bg-[#F5F5F7]' },
    { label: '紧急项', value: summary.critical_count || 0, icon: 'fa-exclamation-circle', color: 'text-gray-800', badgeColor: 'text-red-500', bg: 'bg-red-50' },
    { label: '较高项', value: summary.high_count || 0, icon: 'fa-exclamation-triangle', color: 'text-gray-800', badgeColor: 'text-orange-500', bg: 'bg-orange-50' },
    { label: '预计总金额', value: `¥${(summary.total_estimated_amount || 0).toLocaleString()}`, icon: 'fa-yen-sign', color: 'text-gray-800', badgeColor: 'text-gray-500', bg: 'bg-[#F5F5F7]' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {cards.map((card, i) => (
        <div key={i} className="apple-card p-5 group cursor-default">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">{card.label}</span>
            <div className={`w-8 h-8 rounded-full ${card.bg} flex items-center justify-center transition-transform group-hover:scale-110 duration-300`}>
              <i className={`fas ${card.icon} ${card.badgeColor} text-sm opacity-90`}></i>
            </div>
          </div>
          <div className={`text-2xl font-bold ${card.color} tracking-tight`}>{card.value}</div>
        </div>
      ))}
    </div>
  );
};

export default StatCards;
