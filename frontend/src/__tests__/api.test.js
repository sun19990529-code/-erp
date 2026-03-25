/**
 * API 缓存层单元测试
 * 直接导入 utils/cache.js 共享模块，确保测试与源码一致
 */
import { createCache, CACHE_TTL } from '../utils/cache.js';

describe('API 缓存逻辑', () => {
  let cache;

  beforeEach(() => {
    cache = createCache();
  });

  it('应正确缓存和读取数据', () => {
    cache.setCache('/products', { success: true, data: [1, 2, 3] });
    const result = cache.getFromCache('/products');
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('未缓存的 key 应返回 null', () => {
    expect(cache.getFromCache('/nonexistent')).toBeNull();
  });

  it('过期缓存应返回 null 并自动清除', () => {
    cache.setCache('/old', { data: 'old' });
    // 手动修改时间戳使其过期
    const entry = cache._cache.get('/old');
    entry.timestamp = Date.now() - CACHE_TTL - 1000;
    expect(cache.getFromCache('/old')).toBeNull();
    expect(cache._cache.has('/old')).toBe(false);
  });

  it('invalidateCache 应清除匹配前缀的缓存', () => {
    cache.setCache('/products', { data: 1 });
    cache.setCache('/products/1', { data: 2 });
    cache.setCache('/orders', { data: 3 });
    cache.invalidateCache('products');
    expect(cache.getFromCache('/products')).toBeNull();
    expect(cache.getFromCache('/products/1')).toBeNull();
    expect(cache.getFromCache('/orders')).toEqual({ data: 3 });
  });

  it('clearAllCache 应清空全部缓存', () => {
    cache.setCache('/a', { data: 1 });
    cache.setCache('/b', { data: 2 });
    cache.clearAllCache();
    expect(cache._cache.size).toBe(0);
  });

  it('缓存超过 200 条时应自动淘汰到 150 条', () => {
    for (let i = 0; i < 201; i++) {
      cache.setCache(`/item/${i}`, { data: i });
    }
    expect(cache._cache.size).toBeLessThanOrEqual(151);
  });

  it('getCacheKey 应返回原始 URL', () => {
    expect(cache.getCacheKey('/api/test')).toBe('/api/test');
  });

  it('相同 key 写入应覆盖旧值', () => {
    cache.setCache('/data', { v: 1 });
    cache.setCache('/data', { v: 2 });
    expect(cache.getFromCache('/data')).toEqual({ v: 2 });
  });

  it('自定义 TTL 应生效', () => {
    const shortCache = createCache(100); // 100ms TTL
    shortCache.setCache('/fast', { data: 'fast' });
    expect(shortCache.getFromCache('/fast')).toEqual({ data: 'fast' });
    // 手动设置为过期
    shortCache._cache.get('/fast').timestamp = Date.now() - 200;
    expect(shortCache.getFromCache('/fast')).toBeNull();
  });
});
