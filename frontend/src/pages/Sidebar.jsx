import React, { useState } from 'react';

// 侧边栏菜单树（原定义在 App.jsx 中 Sidebar 之前）
const menuConfig = [
  { key: 'dashboard', label: '系统总览', icon: 'fa-tachometer-alt' },
  { key: 'workshop-monitor', label: '车间大屏看板', icon: 'fa-desktop' },
  { key: 'scan-station', label: '扫码工站', icon: 'fa-qrcode' },
  {
    key: 'warehouse', label: '仓库管理', icon: 'fa-warehouse',
    children: [
      { key: 'inventory', label: '全局库存台账' },
      { key: 'inbound', label: '统一入库调度' },
      { key: 'outbound', label: '统一出库调度' },
      { key: 'transfer', label: '仓库间调拨' },
      { key: 'stocktake', label: '库存盘点' },
      { key: 'batch-tracking', label: '批次溯源查询' },
    ]
  },
  { key: 'order-hub', label: '销售单据中心', icon: 'fa-file-alt' },
  {
    key: 'production', label: '生产管理', icon: 'fa-industry',
    children: [
      { key: 'production-schedule', label: '生产排程' },
      { key: 'production-orders', label: '生产工单' },
      { key: 'pick-material', label: '领料管理' },
      { key: 'process-config', label: '工序流转配置' },
      { key: 'process-hub', label: '车间报工大厅' },
      { key: 'cost-card', label: '工单成本卡' },
      { key: 'production-report', label: '生产报表' },
    ]
  },
  {
    key: 'inspection', label: '质量检验', icon: 'fa-clipboard-check',
    children: [
      { key: 'inspection-inbound', label: '来料检验' },
      { key: 'inspection-patrol', label: '巡检' },
      { key: 'inspection-outsourcing', label: '委外检验' },
      { key: 'inspection-final', label: '成品检验' },
    ]
  },
  { key: 'purchase-hub', label: '采购单据中心', icon: 'fa-shopping-cart' },
  { key: 'purchase-suggestion', label: '智能采购建议', icon: 'fa-lightbulb' },
  { key: 'outsourcing-hub', label: '委外单据中心', icon: 'fa-truck' },
  {
    key: 'finance', label: '财务管理', icon: 'fa-yen-sign',
    children: [
      { key: 'finance-payable', label: '应付账款' },
      { key: 'finance-receivable', label: '应收账款' },
    ]
  },
  {
    key: 'product', label: '产品档案', icon: 'fa-box',
    children: [
      { key: 'product-raw', label: '原材料档案' },
      { key: 'product-semi', label: '半成品档案' },
      { key: 'product-finished', label: '成品档案' },
    ]
  },
  {
    key: 'basic', label: '基础数据', icon: 'fa-database',
    children: [
      { key: 'supplier', label: '供应商管理' },
      { key: 'customer', label: '客户管理' },
      { key: 'department', label: '部门管理' },
      { key: 'material-category', label: '材质分类管理' },
    ]
  },
  {
    key: 'system', label: '系统管理', icon: 'fa-cog',
    children: [
      { key: 'role', label: '角色管理' },
      { key: 'permission', label: '权限管理' },
      { key: 'user-internal', label: '内部用户' },
      { key: 'user-external', label: '外部用户' },
      { key: 'settings-backup', label: '数据备份' },
      { key: 'settings-about', label: '关于系统' },
    ]
  },
];

// 菜单项权限码映射（key -> permission code，与数据库 permissions.code 字段完全一致）
// null 表示无需权限（所有登录用户均可见）
const menuPermissions = {
  'dashboard': null,
  'scan-station': null,
  // 仓库管理：查看库存只需 warehouse_view，入库/出库操作需要 warehouse_create
  'inventory': 'warehouse_view', 'inbound': 'warehouse_create', 'outbound': 'warehouse_create',
  'batch-tracking': 'warehouse_view',
  // 订单管理
  'order-hub': 'order_view',
  // 生产管理
  'production-schedule': 'production_view', 'production-orders': 'production_view',
  'pick-material': 'production_create', 'process-config': 'production_edit',
  'process-hub': 'production_edit',
  'cost-card': 'production_view',
  'production-report': 'production_view',
  // 质量检验
  'inspection-inbound': 'inspection_view', 'inspection-patrol': 'inspection_view',
  'inspection-outsourcing': 'inspection_view', 'inspection-final': 'inspection_view',
  // 采购管理
  'purchase-hub': 'purchase_view',
  'purchase-suggestion': 'purchase_view',
  // 委外加工
  'outsourcing-hub': 'outsourcing_view',
  // 产品档案（属于基础数据模块）
  'product-raw': 'basic_data_view', 'product-semi': 'basic_data_view', 'product-finished': 'basic_data_view',
  // 基础数据
  'supplier': 'basic_data_view', 'customer': 'basic_data_view', 'department': 'basic_data_view', 'material-category': 'basic_data_view',
  // 系统管理（仅管理员，前端走 isAdmin 判断，权限码置 null）
  'role': null, 'permission': null,
  'user-internal': null, 'user-external': null,
  'settings-backup': null, 'settings-about': null,
  // 仓库盘点
  'stocktake': 'warehouse_view',
  'transfer': 'warehouse_edit',
  // 财务管理
  'finance-payable': 'finance_view',
  'finance-receivable': 'finance_view',
};

const Sidebar = ({ activeMenu, setActiveMenu, user, permissions, onLogout, sidebarOpen, onCloseSidebar }) => {
  const [expanded, setExpanded] = useState({});
  
  const toggleExpand = (key) => {
    if (expanded[key]) {
      setExpanded({ ...expanded, [key]: false });
    } else {
      setExpanded({ [key]: true });
    }
  };
  
  const isActive = (key) => activeMenu === key;
  const isParentActive = (key) => activeMenu?.startsWith(key + '-') || activeMenu === key;
  
  const hasPermission = (code) => {
    if (user?.role_code === 'admin') return true;
    if (!code) return true;
    return permissions.includes(code);
  };
  
  const filterMenu = (items) => {
    return items.map(item => {
      if (!hasPermission(menuPermissions[item.key])) return null;
      if (item.children) {
        const filteredChildren = item.children.filter(child => hasPermission(menuPermissions[child.key]));
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      }
      return item;
    }).filter(Boolean);
  };
  
  const filteredMenuConfig = filterMenu(menuConfig);
  
  // 手机端点击菜单后自动收起侧边栏
  const handleMenuClick = (key) => {
    setActiveMenu(key);
    if (onCloseSidebar) onCloseSidebar();
  };

  return (
    <div className={`mobile-sidebar w-64 bg-white border-r border-gray-100 text-gray-700 flex flex-col min-h-screen shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-transform z-40 ${sidebarOpen ? 'open' : ''}`}>
      {/* Logo 区域 (轻量现代感) */}
      <div className="p-5 border-b border-gray-50 flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-100 overflow-hidden">
          <img src="/logo.png" alt="铭晟" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <div className="font-bold text-gray-900 tracking-wide text-base">铭晟系统</div>
          <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mt-0.5">Enterprise ERP</div>
        </div>
      </div>
      
      {/* 菜单大纲 */}
      <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {filteredMenuConfig.map(item => (
          <div key={item.key} className="mb-1">
            <div 
              className={`px-4 py-3 mx-3 rounded-xl cursor-pointer flex items-center justify-between transition-all font-medium text-sm border relative ${isParentActive(item.key) ? 'bg-teal-50 text-teal-700 border-teal-100/50 shadow-sm shadow-teal-500/5' : 'text-gray-600 hover:bg-gray-50 border-transparent hover:text-gray-900'}`}
              onClick={() => item.children ? toggleExpand(item.key) : handleMenuClick(item.key)}
            >
              {isParentActive(item.key) && <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-teal-500" />}
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${isParentActive(item.key) ? 'bg-teal-100/50 text-teal-600' : 'bg-transparent text-gray-400'}`}>
                  <i className={`fas ${item.icon} text-[15px]`}></i>
                </div>
                <span>{item.label}</span>
              </div>
              {item.children && <i className={`fas fa-chevron-down text-[10px] transition-transform duration-300 ${expanded[item.key] ? 'rotate-180 text-teal-500' : 'text-gray-400'}`}></i>}
            </div>
            {/* 子菜单区域 */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${item.children && expanded[item.key] ? 'max-h-96 opacity-100 mt-1 mb-2' : 'max-h-0 opacity-0'}`}>
              {item.children && (
                <div className="relative before:content-[''] before:absolute before:left-8 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                  {item.children.map(child => {
                    const active = isActive(child.key);
                    return (
                      <div 
                        key={child.key}
                        className={`relative px-4 py-2 mx-3 cursor-pointer text-sm rounded-lg flex items-center transition-colors my-0.5 pl-[46px] ${active ? 'text-teal-600 bg-teal-50/50 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                        onClick={() => handleMenuClick(child.key)}
                      >
                        <span className={`absolute left-[30px] w-1.5 h-1.5 rounded-full transition-colors ${active ? 'bg-teal-500 ring-4 ring-teal-100' : 'bg-gray-300'}`}></span>
                        {child.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </nav>
      
      {/* 底部用户卡片 */}
      <div className="p-4 bg-gray-50/50 border-t border-gray-100 mt-auto shrink-0">
        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center font-bold">
            <i className="fas fa-user-tie text-[15px]"></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-800 truncate">{user?.real_name}</div>
            <div className="text-xs text-gray-400 truncate mt-0.5">{user?.role_name}</div>
          </div>
          <button onClick={onLogout} className="w-9 h-9 hover:bg-red-50 hover:text-red-500 text-gray-400 rounded-lg flex items-center justify-center transition-colors" title="退出登录">
            <i className="fas fa-sign-out-alt text-[15px]"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
