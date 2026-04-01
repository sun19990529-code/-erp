import { useEffect, useRef } from 'react';

/**
 * PDA 无头扫码监听钩子
 * 用来监听并截获硬件扫码枪的全局按键流（键盘钩子模式 / Wedge）
 * 
 * @param {Function} onScan 扫码完成的回调函数，返回条码字符串
 * @param {Number} delay 两次按键的最大间隔时间(ms)，超过则认为是人工打字
 */
export function useScanner(onScan, delay = 50) {
  const buffer = useRef('');
  const lastTime = useRef(0);
  const timeoutId = useRef(null);
  const onScanRef = useRef(onScan);

  // 始终持有最新回调引用，避免反复解绑/重绑事件
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // 如果按下了修饰键 (Ctrl/Alt/Meta)，不要拦截
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const currentTime = Date.now();
      
      // 如果距离上一次按键超过我们设定的阈值，我们就认为这不是条码枪的快速输入，清空之前的缓存
      // 扫码枪的每个字符输入间隔通常低于 30ms，而人工打字通常在 100~300ms
      if (currentTime - lastTime.current > delay) {
        buffer.current = '';
      }
      
      lastTime.current = currentTime;

      if (e.key === 'Enter') {
        if (buffer.current.trim().length > 0) {
          // 阻止默认行为，比如回车键可能会触发表单提交
          e.preventDefault();
          
          if (timeoutId.current) clearTimeout(timeoutId.current);
          
          const code = buffer.current.trim();
          buffer.current = '';
          
          // PDA 震动与原生音效反馈
          if (navigator.vibrate) {
            navigator.vibrate([100]); // 短震 100ms
          }

          timeoutId.current = setTimeout(() => {
            if (onScanRef.current) onScanRef.current(code);
          }, 50);
        }
        return;
      }

      // 仅收集长度为1的可打印字符（忽略 Shift, CapsLock 等功能键）
      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    // 使用捕获阶段 (true) 来防止输入框或者其他组件停止冒泡（stopPropagation）导致监听不到
    window.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [delay]);
}
