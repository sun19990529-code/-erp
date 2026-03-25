/**
 * API 缓存工具模块
 * 供 api/index.js 使用，同时可在测试中直接导入
 */

const DEFAULT_TTL = 30 * 1000; // 30 秒

export function createCache(ttl = DEFAULT_TTL) {
  const _cache = new Map();

  function getCacheKey(url) {
    return url;
  }

  function getFromCache(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      _cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(key, data) {
    _cache.set(key, { data, timestamp: Date.now() });
    // 防止缓存无限增长：超过限制时清理过期条目
    if (_cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of _cache) {
        if (now - v.timestamp > ttl) _cache.delete(k);
      }
      // 清理后仍超限，删最早插入的
      if (_cache.size > 200) {
        const iterator = _cache.keys();
        while (_cache.size > 150) _cache.delete(iterator.next().value);
      }
    }
  }

  // 清除指定路径前缀的缓存（变更操作后调用）
  function invalidateCache(pathPrefix) {
    for (const key of _cache.keys()) {
      if (key.includes(pathPrefix)) _cache.delete(key);
    }
  }

  // 清除所有缓存
  function clearAllCache() {
    _cache.clear();
  }

  return { getCacheKey, getFromCache, setCache, invalidateCache, clearAllCache, _cache };
}

export const CACHE_TTL = DEFAULT_TTL;
