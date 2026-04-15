import { createContext } from 'react';
import { useAuthStore } from '../store/useAuthStore';

// 保留 Context 空壳，防止旧代码解构 Provider 时报错
export const AuthContext = createContext({});

// 完美将旧形态的数据进行无缝适配
export const useAuth = () => {
  const user = useAuthStore(state => state.user);
  const permissions = useAuthStore(state => state.permissions);
  const hasPermission = useAuthStore(state => state.hasPermission);
  const logout = useAuthStore(state => state.logout);
  
  return {
    user,
    permissions,
    isAdmin: user?.role_code === 'admin',
    hasPermission,
    onLogout: logout
  };
};

