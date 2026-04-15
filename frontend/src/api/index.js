// API 请求缓存层 - 对 GET 请求进行 TTL 缓存，减少重复请求
import { createCache } from '../utils/cache.js';
import { useAuthStore } from '../store/useAuthStore';

const API_BASE = window.location.origin + '/api';

// 缓存配置
const NO_CACHE_PATHS = ['/users/login', '/users/refresh']; // 不缓存的路径
const { getCacheKey, getFromCache, setCache, invalidateCache, clearAllCache } = createCache();

let _isRefreshing = false;
let _refreshSubscribers = [];
const onTokenRefreshed = (token) => { _refreshSubscribers.forEach(fn => fn(token)); _refreshSubscribers = []; };

const apiRequest = async (url, options = {}) => {
  const isGetRequest = !options.method || options.method === 'GET';
  const cacheKey = getCacheKey(url);

  // GET 请求尝试命中缓存
  if (isGetRequest && !NO_CACHE_PATHS.some(p => url.includes(p))) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }

  try {
    // 强制携带跨域 Cookie 凭据 (HttpOnly Cookie 被存放在这里)
    options.credentials = 'include';
    
    // JWT 从前端抽离，不再拼接 Header: options.headers = { ...options.headers, 'Authorization': ... }

    const res = await fetch(API_BASE + url, options);

    // Token 失效：尝试静默刷新（登录请求本身不走 refresh 流程）
    if (res.status === 401) {
      if (NO_CACHE_PATHS.some(p => url.includes(p))) {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return { success: false, message: '账号或密码错误' }; }
      }

      if (_isRefreshing) {
        return new Promise(resolve => {
          _refreshSubscribers.push(() => {
            resolve(fetch(API_BASE + url, options).then(r => r.json()));
          });
        });
      }
      _isRefreshing = true;
      try {
        const refreshRes = await fetch(API_BASE + '/users/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include' // 重要！静默刷新也必须携带含有 old refreshToken的 Cookie
        });
        
        if (refreshRes.ok) {
          const { data } = await refreshRes.json();
          // Cookie 更新由服务器 Set-Cookie 头自动完成，前端不仅不保存，甚至连响应里都看不见
          onTokenRefreshed('refreshed');
          return fetch(API_BASE + url, options).then(r => r.json());
        }
        
        // refresh 被拒绝（账号禁用/版本注销）：读取后端的具体原因
        try {
          const errBody = await refreshRes.json();
          if (errBody?.message) sessionStorage.setItem('logout_reason', errBody.message);
        } catch { /* ignore */ }
      } catch { /* 刷新失败 → 强制登出 */ } finally {
        _isRefreshing = false;
      }
      const logoutReason = sessionStorage.getItem('logout_reason');
      useAuthStore.getState().logout();
      if (logoutReason) {
        sessionStorage.removeItem('logout_reason');
        alert(logoutReason);
      }
      return { success: false, message: '登录已过期，请重新登录' };
    }

    if (!res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { success: false, message: `请求失败 (${res.status})` }; }
    }
    const result = await res.json();

    // GET 请求结果写入缓存
    if (isGetRequest && result.success) {
      setCache(cacheKey, result);
    }

    // 变更操作清除相关缓存
    if (!isGetRequest && result.success !== false) {
      const pathParts = url.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        invalidateCache(pathParts[0]); // 默认清除当前模块缓存
      }
      // 由调用方显式声明联动缓存清理
      if (options.invalidate && Array.isArray(options.invalidate)) {
        options.invalidate.forEach(m => invalidateCache(m));
      }
    }

    return result;
  } catch (err) {
    console.error('API请求异常:', err);
    return { success: false, message: '网络连接失败，请检查网络' };
  }
};

const api = {
  get: (url) => apiRequest(url),
  post: (url, data, options = {}) => apiRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...options }),
  put: (url, data, options = {}) => apiRequest(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...options }),
  del: (url, options = {}) => apiRequest(url, { method: 'DELETE', ...options }),
  clearCache: clearAllCache,
  invalidateCache,
};

export { api, apiRequest };
