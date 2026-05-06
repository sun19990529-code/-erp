import React, { useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { AuthContext } from './context/AuthContext';
import { useAuthStore } from './store/useAuthStore';
import LoginPage from './pages/LoginPage';
import Sidebar from './pages/Sidebar';
import NotificationBell from './components/NotificationBell';
import AIAssistant from './components/AIAssistant';
import { ROUTE_CONFIG, MENU_ROUTES, PATH_TO_MENU, WorkshopMonitor, ScanStation, WorkstationScreen } from './routes.config';



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
                {/* 从配置表自动生成路由 */}
                {ROUTE_CONFIG.map(({ menuKey, path, element }) => {
                  // 特殊路由：需要动态传参
                  if (menuKey === 'scan-station') {
                    return <Route key={path} path={path} element={<ScanStation onActiveMenuChange={setActiveMenu} />} />;
                  }
                  if (menuKey === 'workshop-monitor') {
                    return <Route key={path} path={path} element={<WorkshopMonitor onExit={() => setActiveMenu('dashboard')} />} />;
                  }
                  // 通用路由：直接使用配置中的 element
                  if (element) {
                    return <Route key={path} path={path} element={element} />;
                  }
                  return null;
                })}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* 全局 AI 悬浮助理 */}
      <AIAssistant />
    </>
  );
};

const App = () => {
  const { user, permissions, login, logout, isReady, fetchSelf } = useAuthStore();

  React.useEffect(() => {
    if (user && !isReady) {
      fetchSelf();
    }
  }, [user, isReady, fetchSelf]);

  if (!user) return (
    <ToastProvider><LoginPage onLogin={login} /></ToastProvider>
  );

  if (!isReady) return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
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
            <AppContent user={user} permissions={permissions} handleLogout={logout} />
          } />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
