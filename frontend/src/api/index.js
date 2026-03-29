// API 请求缓存层 - 对 GET 请求进行 TTL 缓存，减少重复请求
import { createCache } from '../utils/cache.js';

const API_BASE = window.location.origin + '/api';

// 缓存配置
const NO_CACHE_PATHS = ['/users/login', '/users/refresh']; // 不缓存的路径
const { getCacheKey, getFromCache, setCache, invalidateCache, clearAllCache } = createCache();

let _isRefreshing = false;
let _refreshSubscribers = [];
const onTokenRefreshed = (token) => { _refreshSubscribers.forEach(fn => fn(token)); _refreshSubscribers = []; };

const apiRequest = async (url, options = {}) => {
  const getToken = () => {
    try {
      const saved = localStorage.getItem('erp_user_auth');
      if (saved) { const { user } = JSON.parse(saved); return user?.token || null; }
    } catch { /* ignore */ }
    return null;
  };

  const isGetRequest = !options.method || options.method === 'GET';
  const cacheKey = getCacheKey(url);

  // GET 请求尝试命中缓存
  if (isGetRequest && !NO_CACHE_PATHS.some(p => url.includes(p))) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }

  try {
    const token = getToken();
    if (token) options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };

    const res = await fetch(API_BASE + url, options);

    // Token 失效：尝试静默刷新（登录请求本身不走 refresh 流程）
    if (res.status === 401) {
      // 登录/注册等认证请求：直接返回错误信息，不走 refresh
      if (NO_CACHE_PATHS.some(p => url.includes(p))) {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return { success: false, message: '账号或密码错误' }; }
      }

      if (_isRefreshing) {
        return new Promise(resolve => {
          _refreshSubscribers.push(newToken => {
            options.headers = { ...options.headers, 'Authorization': `Bearer ${newToken}` };
            resolve(fetch(API_BASE + url, options).then(r => r.json()));
          });
        });
      }
      _isRefreshing = true;
      try {
        const refreshSaved = localStorage.getItem('erp_user_auth');
        const refreshToken = refreshSaved ? JSON.parse(refreshSaved)?.user?.refreshToken : null;
        if (!refreshToken) throw new Error('no refresh token');
        const refreshRes = await fetch(API_BASE + '/users/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (refreshRes.ok) {
          const { data } = await refreshRes.json();
          const saved = JSON.parse(localStorage.getItem('erp_user_auth') || '{}');
          saved.user = { ...saved.user, token: data.token };
          saved.expireAt = Date.now() + 24 * 60 * 60 * 1000;
          localStorage.setItem('erp_user_auth', JSON.stringify(saved));
          onTokenRefreshed(data.token);
          options.headers = { ...options.headers, 'Authorization': `Bearer ${data.token}` };
          return fetch(API_BASE + url, options).then(r => r.json());
        }
      } catch { /* 刷新失败 → 强制登出 */ } finally {
        _isRefreshing = false;
      }
      localStorage.removeItem('erp_user_auth');
      window.location.reload();
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
    if (!isGetRequest) {
      const pathParts = url.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        invalidateCache(pathParts[0]);
        // 跨模块联动清除：写操作会影响关联模块的数据
        const related = { pick: ['inventory'], production: ['inventory', 'orders'], inbound: ['inventory'], outbound: ['inventory', 'orders'], stocktake: ['inventory'], finance: ['payables', 'receivables'] };
        (related[pathParts[0]] || []).forEach(m => invalidateCache(m));
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
  post: (url, data) => apiRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  put: (url, data) => apiRequest(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  del: (url) => apiRequest(url, { method: 'DELETE' }),
  clearCache: clearAllCache,
  invalidateCache,
};

export { api, apiRequest };
