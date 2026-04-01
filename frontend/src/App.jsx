import React, { useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { AuthContext } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Sidebar from './pages/Sidebar';
import NotificationBell from './components/NotificationBell';

// React.lazy 路由级懒加载 — 减少首屏包体积
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const InventoryView = React.lazy(() => import('./pages/WarehousePages').then(m => ({ default: m.InventoryView })));
const WarehouseOrderManager = React.lazy(() => import('./pages/WarehousePages').then(m => ({ default: m.WarehouseOrderManager })));
const TransferManager = React.lazy(() => import('./pages/WarehousePages').then(m => ({ default: m.TransferManager })));

const OrderManager = React.lazy(() => import('./pages/Orders'));
const ProductionScheduleGantt = React.lazy(() => import('./pages/ProductionPages').then(m => ({ default: m.ProductionScheduleGantt })));
const ProductionOrderManager = React.lazy(() => import('./pages/ProductionPages').then(m => ({ default: m.ProductionOrderManager })));
const PickMaterialManager = React.lazy(() => import('./pages/ProductionPages').then(m => ({ default: m.PickMaterialManager })));
const ProcessConfigManager = React.lazy(() => import('./pages/ProcessPages').then(m => ({ default: m.ProcessConfigManager })));
const ProcessManager = React.lazy(() => import('./pages/ProcessPages').then(m => ({ default: m.ProcessManager })));
const InboundInspection = React.lazy(() => import('./pages/InspectionPages').then(m => ({ default: m.InboundInspection })));
const PatrolInspection = React.lazy(() => import('./pages/InspectionPages').then(m => ({ default: m.PatrolInspection })));
const OutsourcingInspection = React.lazy(() => import('./pages/InspectionPages').then(m => ({ default: m.OutsourcingInspection })));
const FinalInspection = React.lazy(() => import('./pages/InspectionPages').then(m => ({ default: m.FinalInspection })));
const PurchaseManager = React.lazy(() => import('./pages/PurchasePages').then(m => ({ default: m.PurchaseManager })));
const OutsourcingManager = React.lazy(() => import('./pages/OutsourcingPages').then(m => ({ default: m.OutsourcingManager })));
const ProductManager = React.lazy(() => import('./pages/BasicDataPages').then(m => ({ default: m.ProductManager })));
const SupplierManager = React.lazy(() => import('./pages/BasicDataPages').then(m => ({ default: m.SupplierManager })));
const CustomerManager = React.lazy(() => import('./pages/BasicDataPages').then(m => ({ default: m.CustomerManager })));
const DepartmentManager = React.lazy(() => import('./pages/BasicDataPages').then(m => ({ default: m.DepartmentManager })));
const MaterialCategoryManager = React.lazy(() => import('./pages/BasicDataPages').then(m => ({ default: m.MaterialCategoryManager })));

const RoleManager = React.lazy(() => import('./pages/UserPages').then(m => ({ default: m.RoleManager })));
const PermissionManager = React.lazy(() => import('./pages/UserPages').then(m => ({ default: m.PermissionManager })));
const UserManager = React.lazy(() => import('./pages/UserPages').then(m => ({ default: m.UserManager })));
const BackupSettings = React.lazy(() => import('./pages/SettingsPages').then(m => ({ default: m.BackupSettings })));
const AboutSystem = React.lazy(() => import('./pages/SettingsPages').then(m => ({ default: m.AboutSystem })));
const OperationLogs = React.lazy(() => import('./pages/OperationLogs'));
const ScanStation = React.lazy(() => import('./components/ScanStation'));
const WorkshopMonitor = React.lazy(() => import('./pages/WorkshopMonitor'));
const TrackingPage = React.lazy(() => import('./pages/TrackingPage'));
const PurchaseSuggestionPage = React.lazy(() => import('./pages/PurchaseSuggestionPage'));
const CostCardPage = React.lazy(() => import('./pages/CostCardPage'));
const StocktakePage = React.lazy(() => import('./pages/StocktakePage'));
const FinancePages = React.lazy(() => import('./pages/FinancePages'));
const ReportPage = React.lazy(() => import('./pages/ReportPage'));
const DataCenter = React.lazy(() => import('./pages/DataCenter'));
const ImportPage = React.lazy(() => import('./pages/ImportPage'));
const WorkstationQRPage = React.lazy(() => import('./pages/WorkstationQRPage'));
const WorkstationScreen = React.lazy(() => import('./pages/WorkstationScreen'));
const TemplateManager = React.lazy(() => import('./pages/TemplateBuilder/TemplateManager'));
const AUTH_KEY = 'erp_user_auth';

// 路由 ↔ 菜单 映射表
const MENU_ROUTES = {
  'dashboard': '/',
  'scan-station': '/scan',
  'inventory': '/warehouse/inventory',
  'inbound': '/warehouse/inbound',
  'outbound': '/warehouse/outbound',
  'transfer': '/warehouse/transfer',
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
  'material-category': '/basic/material-category',
  'role': '/system/role',
  'permission': '/system/permission',
  'user-internal': '/system/user-internal',
  'user-external': '/system/user-external',
  'settings-backup': '/settings/backup',
  'settings-about': '/settings/about',
  'workshop-monitor': '/monitor',
  'batch-tracking': '/tracking',
  'purchase-suggestion': '/purchase/suggestions',
  'cost-card': '/production/cost',
  'stocktake': '/warehouse/stocktake',
  'finance-payable': '/finance/payable',
  'finance-receivable': '/finance/receivable',
  'data-center': '/report/datacenter',
  'production-report': '/production/report',
  'data-import': '/system/import',
  'operation-logs': '/system/logs',
  'workstation-qr': '/production/workstation-qr',
  'print-template': '/system/print-template',
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
        <div className="flex items-center gap-1">
          <button onClick={handleLogout} className="text-gray-500 hover:bg-red-50 hover:text-red-500 text-sm w-10 h-10 flex items-center justify-center rounded-lg transition-colors">
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>

      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}></div>

      <div className="flex min-h-screen bg-gray-50/50">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} user={user} permissions={permissions} onLogout={handleLogout} sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)} />
        <main className="flex-1 p-3 sm:p-6 overflow-x-hidden overflow-y-auto w-full relative" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          {/* 顶部通知栏（全屏幕共用唯一实例） */}
          <div className="flex justify-end items-center mb-4 -mt-1">
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="text-xs text-gray-400 hidden lg:inline">{user?.real_name || user?.username}</span>
            </div>
          </div>
          <div className="max-w-[1600px] mx-auto page-transition" key={location.pathname}>
            <ErrorBoundary>
              <Suspense fallback={
                <div className="space-y-4 animate-pulse">
                  <div className="h-8 bg-gray-200 rounded-lg w-48"></div>
                  <div className="h-4 bg-gray-100 rounded w-64"></div>
                  <div className="grid grid-cols-4 gap-4 mt-6">
                    <div className="h-24 bg-gray-100 rounded-xl"></div>
                    <div className="h-24 bg-gray-100 rounded-xl"></div>
                    <div className="h-24 bg-gray-100 rounded-xl"></div>
                    <div className="h-24 bg-gray-100 rounded-xl"></div>
                  </div>
                  <div className="h-64 bg-gray-100 rounded-xl mt-4"></div>
                </div>
              }>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scan" element={<ScanStation onActiveMenuChange={setActiveMenu} />} />
                <Route path="/warehouse/inventory" element={<InventoryView title="全局库存台账" />} />
                <Route path="/warehouse/inbound" element={<WarehouseOrderManager orderType="inbound" title="入库调度中心" />} />
                <Route path="/warehouse/outbound" element={<WarehouseOrderManager orderType="outbound" title="出库调度中心" />} />
                <Route path="/warehouse/transfer" element={<TransferManager />} />

                <Route path="/orders" element={<OrderManager />} />
                <Route path="/production/schedule" element={<ProductionScheduleGantt />} />
                <Route path="/production/orders" element={<ProductionOrderManager />} />
                <Route path="/production/pick" element={<PickMaterialManager />} />
                <Route path="/process/config" element={<ProcessConfigManager />} />
                <Route path="/process/hub" element={<ProcessManager />} />
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
                <Route path="/basic/material-category" element={<MaterialCategoryManager />} />

                <Route path="/system/role" element={<RoleManager />} />
                <Route path="/system/permission" element={<PermissionManager />} />
                <Route path="/system/user-internal" element={<UserManager userType="internal" />} />
                <Route path="/system/user-external" element={<UserManager userType="external" />} />
                <Route path="/settings/backup" element={<BackupSettings />} />
                <Route path="/settings/about" element={<AboutSystem />} />
                <Route path="/monitor" element={<WorkshopMonitor onExit={() => setActiveMenu('dashboard')} />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/purchase/suggestions" element={<PurchaseSuggestionPage />} />
                <Route path="/production/cost" element={<CostCardPage />} />
                <Route path="/warehouse/stocktake" element={<StocktakePage />} />
                <Route path="/finance/payable" element={<FinancePages type="payable" />} />
                <Route path="/finance/receivable" element={<FinancePages type="receivable" />} />
                <Route path="/report/datacenter" element={<DataCenter />} />
                <Route path="/production/report" element={<ReportPage />} />
                <Route path="/system/import" element={<ImportPage />} />
                <Route path="/system/logs" element={<OperationLogs />} />
                <Route path="/production/workstation-qr" element={<WorkstationQRPage />} />
                <Route path="/system/print-template" element={<TemplateManager />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
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
        <Routes>
          {/* 工位屏幕：公开路由，免登录 */}
          <Route path="/ws/:stationCode" element={
            <React.Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center"><i className="fas fa-circle-notch fa-spin text-5xl text-blue-500"></i></div>}>
              <WorkstationScreen />
            </React.Suspense>
          } />
          {/* 其他所有路由：需要登录 */}
          <Route path="*" element={
            <AuthContext.Provider value={{ user, permissions, isAdmin: user?.role_code === 'admin', hasPermission: (code) => user?.role_code === 'admin' || permissions.includes(code), onLogout: handleLogout }}>
              <AppContent user={user} permissions={permissions} handleLogout={handleLogout} />
            </AuthContext.Provider>
          } />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
