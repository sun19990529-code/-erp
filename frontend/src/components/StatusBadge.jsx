import React from 'react';

const StatusBadge = ({ status, type }) => {
  const colors = { 
    pending: 'bg-yellow-100 text-yellow-800', 
    confirmed: 'bg-blue-100 text-blue-800',
    processing: 'bg-blue-100 text-blue-800', 
    approved: 'bg-green-100 text-green-800', 
    completed: 'bg-green-100 text-green-800', 
    cancelled: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800', 
    received: 'bg-purple-100 text-purple-800',
    pending_inspection: 'bg-orange-100 text-orange-800',
    inspection_passed: 'bg-green-100 text-green-800',
    inspection_failed: 'bg-red-100 text-red-800',
    partial_shipped: 'bg-orange-100 text-orange-800',
    shipped: 'bg-blue-100 text-blue-800'
  };
  const getLabel = () => {
    if (status === 'completed') {
      if (type === 'outbound' || type === 'pick') return '已出库';
      if (type === 'inbound') return '已入库';
      if (type === 'transfer') return '已调拨';
      return '已完成';
    }
    if (status === 'pending' && type === 'transfer') return '待确认';
    const labels = { 
      pending: '待处理', 
      confirmed: '已确认',
      processing: '进行中', 
      approved: '已审批', 
      cancelled: '已取消',
      rejected: '检验不合格', 
      received: '已收货',
      pending_inspection: '待检验',
      inspection_passed: '检验通过',
      inspection_failed: '检验不合格',
      partial_shipped: '部分发货',
      shipped: '已发货'
    };
    return labels[status] || status;
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>{getLabel()}</span>;
};


export default StatusBadge;
