import React from 'react';

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

/**
 * 路由配置声明表
 * menuKey: 侧边栏菜单唯一标识
 * path:    URL 路径
 * element: React 组件（JSX）
 * 
 * 新增页面时只需在此表中添加一行即可，App.jsx 会自动渲染。
 */
export const ROUTE_CONFIG = [
  // ==================== 首页 ====================
  { menuKey: 'dashboard',            path: '/',                        element: <Dashboard /> },
  { menuKey: 'scan-station',         path: '/scan',                    element: null }, // element 在 App.jsx 中动态传参
  // ==================== 仓储 ====================
  { menuKey: 'inventory',            path: '/warehouse/inventory',     element: <InventoryView title="全局库存台账" /> },
  { menuKey: 'inbound',              path: '/warehouse/inbound',       element: <WarehouseOrderManager orderType="inbound" title="入库调度中心" /> },
  { menuKey: 'outbound',             path: '/warehouse/outbound',      element: <WarehouseOrderManager orderType="outbound" title="出库调度中心" /> },
  { menuKey: 'transfer',             path: '/warehouse/transfer',      element: <TransferManager /> },
  { menuKey: 'stocktake',            path: '/warehouse/stocktake',     element: <StocktakePage /> },
  // ==================== 订单与生产 ====================
  { menuKey: 'order-hub',            path: '/orders',                  element: <OrderManager /> },
  { menuKey: 'production-schedule',  path: '/production/schedule',     element: <ProductionScheduleGantt /> },
  { menuKey: 'production-orders',    path: '/production/orders',       element: <ProductionOrderManager /> },
  { menuKey: 'pick-material',        path: '/production/pick',         element: <PickMaterialManager /> },
  { menuKey: 'cost-card',            path: '/production/cost',         element: <CostCardPage /> },
  { menuKey: 'production-report',    path: '/production/report',       element: <ReportPage /> },
  { menuKey: 'workstation-qr',       path: '/production/workstation-qr', element: <WorkstationQRPage /> },
  // ==================== 工艺 ====================
  { menuKey: 'process-config',       path: '/process/config',          element: <ProcessConfigManager /> },
  { menuKey: 'process-hub',          path: '/process/hub',             element: <ProcessManager /> },
  // ==================== 质检 ====================
  { menuKey: 'inspection-inbound',   path: '/inspection/inbound',      element: <InboundInspection /> },
  { menuKey: 'inspection-patrol',    path: '/inspection/patrol',       element: <PatrolInspection /> },
  { menuKey: 'inspection-outsourcing', path: '/inspection/outsourcing', element: <OutsourcingInspection /> },
  { menuKey: 'inspection-final',     path: '/inspection/final',        element: <FinalInspection /> },
  // ==================== 采购与委外 ====================
  { menuKey: 'purchase-hub',         path: '/purchase',                element: <PurchaseManager /> },
  { menuKey: 'purchase-suggestion',  path: '/purchase/suggestions',    element: <PurchaseSuggestionPage /> },
  { menuKey: 'outsourcing-hub',      path: '/outsourcing',             element: <OutsourcingManager /> },
  // ==================== 基础数据 ====================
  { menuKey: 'product-raw',          path: '/basic/product-raw',       element: <ProductManager category="原材料" /> },
  { menuKey: 'product-semi',         path: '/basic/product-semi',      element: <ProductManager category="半成品" /> },
  { menuKey: 'product-finished',     path: '/basic/product-finished',  element: <ProductManager category="成品" /> },
  { menuKey: 'supplier',             path: '/basic/supplier',          element: <SupplierManager /> },
  { menuKey: 'customer',             path: '/basic/customer',          element: <CustomerManager /> },
  { menuKey: 'department',           path: '/basic/department',        element: <DepartmentManager /> },
  { menuKey: 'material-category',    path: '/basic/material-category', element: <MaterialCategoryManager /> },
  // ==================== 财务 ====================
  { menuKey: 'finance-payable',      path: '/finance/payable',         element: <FinancePages type="payable" /> },
  { menuKey: 'finance-receivable',   path: '/finance/receivable',      element: <FinancePages type="receivable" /> },
  // ==================== 系统管理 ====================
  { menuKey: 'role',                 path: '/system/role',             element: <RoleManager /> },
  { menuKey: 'permission',           path: '/system/permission',       element: <PermissionManager /> },
  { menuKey: 'user-internal',        path: '/system/user-internal',    element: <UserManager userType="internal" /> },
  { menuKey: 'user-external',        path: '/system/user-external',    element: <UserManager userType="external" /> },
  { menuKey: 'operation-logs',       path: '/system/logs',             element: <OperationLogs /> },
  { menuKey: 'data-import',          path: '/system/import',           element: <ImportPage /> },
  { menuKey: 'print-template',       path: '/system/print-template',   element: <TemplateManager /> },
  // ==================== 设置 ====================
  { menuKey: 'settings-backup',      path: '/settings/backup',         element: <BackupSettings /> },
  { menuKey: 'settings-about',       path: '/settings/about',          element: <AboutSystem /> },
  // ==================== 大屏与追踪 ====================
  { menuKey: 'workshop-monitor',     path: '/monitor',                 element: null }, // 特殊处理：独立全屏
  { menuKey: 'batch-tracking',       path: '/tracking',                element: <TrackingPage /> },
  { menuKey: 'data-center',          path: '/report/datacenter',       element: <DataCenter /> },
];

// 菜单Key → 路径映射（侧边栏导航用）
export const MENU_ROUTES = Object.fromEntries(
  ROUTE_CONFIG.map(r => [r.menuKey, r.path])
);

// 路径 → 菜单Key反向映射（URL 推导 activeMenu 用）
export const PATH_TO_MENU = Object.fromEntries(
  ROUTE_CONFIG.map(r => [r.path, r.menuKey])
);

// 导出懒加载组件供特殊场景使用（工位屏幕、大屏等需要在 App.jsx 中单独处理的）
export { WorkshopMonitor, ScanStation, WorkstationScreen };
