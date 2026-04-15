import { create } from 'zustand';
import { api } from '../api';

const AUTH_KEY = 'erp_user_auth_safe';

const getInitialState = () => {
  try {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
      return { user: JSON.parse(saved), permissions: [], isReady: false };
    }
  } catch {
    localStorage.removeItem(AUTH_KEY);
  }
  return { user: null, permissions: [], isReady: true }; // null implies ready because login is needed
};

const initialState = getInitialState();

export const useAuthStore = create((set, get) => ({
  user: initialState.user,
  permissions: initialState.permissions,
  isReady: initialState.isReady, // Flag indicating if permissions have been successfully loaded

  get isAdmin() {
    return get().user?.role_code === 'admin';
  },

  hasPermission: (code) => {
    const state = get();
    if (!state.isReady) return false;
    const isAdmin = state.user?.role_code === 'admin';
    return isAdmin || state.permissions.includes(code);
  },

  login: (userData) => {
    // 仅仅保存基础展示信息，不再保存 Token 和 Permissions
    const safeUser = {
      id: userData.id,
      username: userData.username,
      real_name: userData.real_name,
      role_code: userData.role_code,
      department_name: userData.department_name,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(safeUser));
    
    set({
      user: safeUser,
      permissions: userData.permissions || [],
      isReady: true
    });
  },

  logout: async () => {
    try {
      await api.post('/users/logout'); // 通知后端清空 Cookie
    } catch (e) {
      // 忽略失败
    }
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem('logout_reason');
    set({ user: null, permissions: [], isReady: true });
  },

  // 刷新前端用户信息和权限树 (通常在页面加载时调用)
  fetchSelf: async () => {
    try {
      const res = await api.get('/users/me/permissions');
      if (res.success && res.data) {
        const safeUser = {
           id: res.data.id,
           username: res.data.username,
           real_name: res.data.real_name,
           role_code: res.data.role_code,
           department_name: res.data.department_name,
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(safeUser));
        set({ user: safeUser, permissions: res.data.permissions || [], isReady: true });
      } else {
        // HTTPOnly Cookie 可能已过期
        get().logout();
      }
    } catch (err) {
      get().logout();
    }
  },

  // 静默刷新不需再操作 localStorage 里面的 token
  updateTokenSilent: () => {
    // Do nothing. Cookie is managed by browser automatically.
  }
}));
