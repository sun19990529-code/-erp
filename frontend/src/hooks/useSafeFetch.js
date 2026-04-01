import { useEffect, useRef } from 'react';

/**
 * 带有卸载竞态阻断的安全请求 Hook
 * @param {function} fetcher - 返回 Promise 的获取函数
 * @param {Array} dependencies - 触发重载的依赖项
 */
export const useSafeFetch = (fetcher, dependencies = []) => {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    const doFetch = async () => {
      await fetcher(isMounted); // 将 ref 传给外部进行更细粒度控制（可选）
    };
    
    doFetch();

    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return isMounted;
};
