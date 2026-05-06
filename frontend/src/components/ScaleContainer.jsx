import React, { useEffect, useState, useRef } from 'react';

/**
 * 大屏绝对自适应容器
 * @param {number} designWidth - 设计稿宽度（默认 1920）
 * @param {number} designHeight - 设计稿高度（默认 1080）
 */
const ScaleContainer = ({ children, designWidth = 1920, designHeight = 1080 }) => {
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);

  useEffect(() => {
    const updateScale = () => {
      const clientWidth = window.innerWidth;
      const clientHeight = window.innerHeight;
      
      const scaleX = clientWidth / designWidth;
      const scaleY = clientHeight / designHeight;
      
      // 以最小比例为准，确保内容全部可见且等比例缩放（不拉伸）
      const finalScale = Math.min(scaleX, scaleY);
      setScale(finalScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [designWidth, designHeight]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#020617] flex items-center justify-center fixed top-0 left-0 z-0">
      <div
        ref={containerRef}
        style={{
          width: `${designWidth}px`,
          height: `${designHeight}px`,
          zoom: scale,
          transition: 'zoom 0.2s cubic-bezier(0.2, 0, 0.2, 1)'
        }}
        className="relative flex-shrink-0"
      >
        {children}
      </div>
    </div>
  );
};

export default ScaleContainer;
