import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // 轮询未读数
  useEffect(() => {
    const fetchCount = async () => {
      const res = await api.get('/notifications/unread-count');
      if (res.success) setUnreadCount(res.data);
    };
    fetchCount();
    const timer = setInterval(fetchCount, 30000); // 30秒轮询
    return () => clearInterval(timer);
  }, []);

  // 打开面板时加载通知列表
  const toggle = async () => {
    if (!open) {
      setLoading(true);
      const res = await api.get('/notifications?pageSize=10');
      if (res.success) setNotifications(res.data);
      setLoading(false);
    }
    setOpen(!open);
  };

  // 标记单条已读
  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // 全部已读
  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  // 点击外部关闭
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeIcons = { warning: 'fa-exclamation-triangle text-amber-500', info: 'fa-info-circle text-blue-500', success: 'fa-check-circle text-green-500', error: 'fa-times-circle text-red-500' };
  const typeBg = { warning: 'bg-amber-50', info: 'bg-blue-50', success: 'bg-green-50', error: 'bg-red-50' };

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="relative text-gray-500 hover:text-gray-700 hover:bg-gray-100 w-10 h-10 flex items-center justify-center rounded-lg transition-colors">
        <i className="fas fa-bell text-lg"></i>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 animate-pulse shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden" style={{ maxHeight: '480px' }}>
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <h3 className="text-sm font-bold text-gray-800">
              <i className="fas fa-bell mr-2 text-teal-600"></i>通知中心
              {unreadCount > 0 && <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unreadCount}条未读</span>}
            </h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                <i className="fas fa-check-double mr-1"></i>全部已读
              </button>
            )}
          </div>

          {/* 列表 */}
          <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
            {loading ? (
              <div className="p-8 text-center text-gray-400">
                <i className="fas fa-spinner fa-spin text-2xl mb-2 block"></i>加载中...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <i className="fas fa-bell-slash text-3xl mb-2 block opacity-30"></i>
                <div className="text-sm">暂无通知</div>
              </div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50/80 ${!n.is_read ? typeBg[n.type] || 'bg-blue-50/50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <i className={`fas ${typeIcons[n.type] || 'fa-bell text-gray-400'}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${!n.is_read ? 'text-gray-900' : 'text-gray-500'}`}>{n.title}</span>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{n.content}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{n.created_at?.replace('T', ' ').slice(0, 16)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 底部 */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 text-center">
              <span className="text-xs text-gray-400">显示最近 10 条通知</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
