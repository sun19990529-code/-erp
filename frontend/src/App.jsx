import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { AuthContext } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Sidebar from './pages/Sidebar';
import Dashboard from './pages/Dashboard';
import { InventoryView, WarehouseOrderManager } from './pages/WarehousePages';
import { OrderManager } from './pages/OrderPages';
import { PickMaterialManager, ProductionOrderManager, ProductionScheduleGantt } from './pages/ProductionPages';
import { ProcessConfigManager, ProcessExecutionHub } from './pages/ProcessPages';
import { InboundInspection, PatrolInspection, OutsourcingInspection, FinalInspection } from './pages/InspectionPages';
import { PurchaseManager } from './pages/PurchasePages';
import { OutsourcingManager } from './pages/OutsourcingPages';
import { SupplierManager, CustomerManager, DepartmentManager, ProductManager } from './pages/BasicDataPages';
import { RoleManager, PermissionManager, UserManager } from './pages/UserPages';
import { BackupSettings, AboutSystem } from './pages/SettingsPages';
import ScanStation from './components/ScanStation';
import WorkshopMonitor from './pages/WorkshopMonitor';

// v1.4.2 - React Router 升级
const AUTH_KEY = 'erp_user_auth';

// 路由 ↔ 菜单 映射表
const MENU_ROUTES = {
  'dashboard': '/',
  'scan-station': '/scan',
  'inventory': '/warehouse/inventory',
  'inbound': '/warehouse/inbound',
  'outbound': '/warehouse/outbound',
  'order-hub': '/orders',
  'production-schedule': '/production/schedule',
  'production-orders': '/production/orders',
  'pick-material': '/production/pick',
  'process-config': '/process/config',
  'process-hub': '/process/hub',
  'inspection-inbound': '/inspection/inbound',
  'inspection-patrol': '/inspection/patrol',
  'inspection-outsourcing': '/inspection/outsourcing',
  'inspection-final': '/inspection/final',
  'purchase-hub': '/purchase',
  'outsourcing-hub': '/outsourcing',
  'product-raw': '/basic/product-raw',
  'product-semi': '/basic/product-semi',
  'product-finished': '/basic/product-finished',
  'supplier': '/basic/supplier',
  'customer': '/basic/customer',
  'department': '/basic/department',
  'role': '/system/role',
  'permission': '/system/permission',
  'user-internal': '/system/user-internal',
  'user-external': '/system/user-external',
  'settings-backup': '/settings/backup',
  'settings-about': '/settings/about',
  'workshop-monitor': '/monitor',
};

// 反向映射：path → menuKey
const PATH_TO_MENU = Object.fromEntries(
  Object.entries(MENU_ROUTES).map(([menu, path]) => [path, menu])
);

// 路由感知的主内容组件
const AppContent = ({ user, permissions, handleLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 从 URL 推导 activeMenu
  const activeMenu = PATH_TO_MENU[location.pathname] || 'dashboard';

  // 导航：同时更新 URL
  const setActiveMenu = (menu) => {
    const path = MENU_ROUTES[menu] || '/';
    navigate(path);
    setSidebarOpen(false);
  };

  // 大屏模式独立渲染
  if (activeMenu === 'workshop-monitor') {
    return <WorkshopMonitor onExit={() => setActiveMenu('dashboard')} />;
  }

  return (
    <>
      {/* Mobile 头栏 */}
      <div className="mobile-topbar hidden items-center justify-between bg-white/80 backdrop-blur-md border-b border-gray-100 text-gray-800 px-4 py-3 sticky top-0 z-30 shadow-sm">
        <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:bg-gray-100 text-xl w-10 h-10 flex items-center justify-center rounded-lg transition-colors">
          <i className="fas fa-bars"></i>
        </button>
        <div className="font-bold text-gray-800 tracking-wide">铭晟管理系统</div>
        <button onClick={handleLogout} className="text-gray-500 hover:bg-red-50 hover:text-red-500 text-sm w-10 h-10 flex items-center justify-center rounded-lg transition-colors">
          <i className="fas fa-sign-out-alt"></i>
        </button>
      </div>

      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <div className="flex min-h-screen bg-gray-50/50">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} user={user} permissions={permissions} onLogout={handleLogout} sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)} />
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden overflow-y-auto w-full relative">
          <div className="max-w-[1600px] mx-auto">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scan" element={<ScanStation onActiveMenuChange={setActiveMenu} />} />
                <Route path="/warehouse/inventory" element={<InventoryView title="全局库存台账" />} />
                <Route path="/warehouse/inbound" element={<WarehouseOrderManager orderType="inbound" title="入库调度中心" />} />
                <Route path="/warehouse/outbound" element={<WarehouseOrderManager orderType="outbound" title="出库调度中心" />} />
                <Route path="/orders" element={<OrderManager />} />
                <Route path="/production/schedule" element={<ProductionScheduleGantt />} />
                <Route path="/production/orders" element={<ProductionOrderManager />} />
                <Route path="/production/pick" element={<PickMaterialManager />} />
                <Route path="/process/config" element={<ProcessConfigManager />} />
                <Route path="/process/hub" element={<ProcessExecutionHub />} />
                <Route path="/inspection/inbound" element={<InboundInspection />} />
                <Route path="/inspection/patrol" element={<PatrolInspection />} />
                <Route path="/inspection/outsourcing" element={<OutsourcingInspection />} />
                <Route path="/inspection/final" element={<FinalInspection />} />
                <Route path="/purchase" element={<PurchaseManager />} />
                <Route path="/outsourcing" element={<OutsourcingManager />} />
                <Route path="/basic/product-raw" element={<ProductManager category="原材料" />} />
                <Route path="/basic/product-semi" element={<ProductManager category="半成品" />} />
                <Route path="/basic/product-finished" element={<ProductManager category="成品" />} />
                <Route path="/basic/supplier" element={<SupplierManager />} />
                <Route path="/basic/customer" element={<CustomerManager />} />
                <Route path="/basic/department" element={<DepartmentManager />} />
                <Route path="/system/role" element={<RoleManager />} />
                <Route path="/system/permission" element={<PermissionManager />} />
                <Route path="/system/user-internal" element={<UserManager userType="internal" />} />
                <Route path="/system/user-external" element={<UserManager userType="external" />} />
                <Route path="/settings/backup" element={<BackupSettings />} />
                <Route path="/settings/about" element={<AboutSystem />} />
                <Route path="/monitor" element={<WorkshopMonitor onExit={() => setActiveMenu('dashboard')} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </>
  );
};

const App = () => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY);
      if (saved) {
        const { user: savedUser, expireAt } = JSON.parse(saved);
        if (expireAt && Date.now() < expireAt) return savedUser;
        localStorage.removeItem(AUTH_KEY);
      }
    } catch { localStorage.removeItem(AUTH_KEY); }
    return null;
  });
  const [permissions, setPermissions] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY);
      if (saved) return JSON.parse(saved)?.user?.permissions || [];
    } catch { /* ignore */ }
    return [];
  });

  const handleLogin = (userData) => {
    const expireAt = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: userData, expireAt }));
    setUser(userData);
    setPermissions(userData.permissions || []);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setUser(null);
    setPermissions([]);
  };

  if (!user) return (
    <ToastProvider><LoginPage onLogin={handleLogin} /></ToastProvider>
  );

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthContext.Provider value={{ user, permissions, isAdmin: user?.role_code === 'admin', hasPermission: (code) => user?.role_code === 'admin' || permissions.includes(code), onLogout: handleLogout }}>
          <AppContent user={user} permissions={permissions} handleLogout={handleLogout} />
        </AuthContext.Provider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
