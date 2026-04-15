import React, { useState, useEffect } from 'react';

// 原生支持小数点与粗手套操作的工业级数字键盘
const NumberKeypad = ({ isOpen, title, initialValue = '', onClose, onConfirm }) => {
  const [value, setValue] = useState(initialValue);
  const [isBlinking, setIsBlinking] = useState(true);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // 光标闪烁动画
      const interval = setInterval(() => setIsBlinking(b => !b), 500);
      return () => clearInterval(interval);
    }
  }, [isOpen, initialValue]);

  // 震动反馈
  const triggerVibrate = (duration = 20) => {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  };

  const handleKeyPress = (key) => {
    triggerVibrate();
    
    if (key === 'backspace') {
      setValue(v => v.slice(0, -1));
      return;
    }

    if (key === '.') {
      // 防止输入多个小数点
      if (value.includes('.')) return;
      // 如果还没输入内容直接按小数点，自动补 0
      if (value === '') {
        setValue('0.');
        return;
      }
    }

    // 防止一直输入过长
    if (value.length >= 10) return;

    setValue(v => v + key);
  };

  const handleConfirm = () => {
    triggerVibrate([30, 30, 30]); // 成功长震动
    onConfirm(value || '0');
  };

  const handleCancel = () => {
    triggerVibrate(50);
    onClose();
  };

  if (!isOpen) return null;

  const keyClasses = "flex items-center justify-center min-h-[70px] sm:min-h-[80px] bg-white border border-gray-200 rounded-xl text-3xl sm:text-4xl font-semibold text-gray-700 shadow-sm active:bg-teal-100 active:scale-95 transition-all select-none";

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col justify-end fade-in">
      {/* 遮罩面板上半部分点击可关闭 */}
      <div className="flex-1" onClick={handleCancel}></div>
      
      {/* 键盘主体 */}
      <div className="bg-gray-100 rounded-t-3xl shadow-2xl p-4 sm:p-6 pb-8 border-t border-gray-200 animate-slide-up relative">
        
        {/* 标题 */}
        <div className="flex justify-between items-center mb-4 px-2">
          <h3 className="text-gray-600 text-lg sm:text-xl font-medium truncate pr-4 text-left">
            {title || '请输入数值'}
          </h3>
          <button onClick={handleCancel} className="text-gray-400 p-2 shrink-0 active:bg-gray-200 rounded-full">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* 显示区 */}
        <div className="bg-white rounded-2xl p-4 md:p-6 mb-4 md:mb-6 shadow-inner border border-gray-300 flex items-center justify-end overflow-hidden relative">
           <span className="text-5xl md:text-6xl font-mono text-teal-700 tracking-wider font-bold">
             {value || <span className="text-gray-300">0</span>}
             <span className={`inline-block w-1 md:w-1.5 h-10 md:h-12 bg-teal-500 ml-1 md:ml-2 align-middle ${isBlinking ? 'opacity-100' : 'opacity-0'}`}></span>
           </span>
        </div>

        {/* 键盘区 4x3 */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('7')}}>7</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('8')}}>8</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('9')}}>9</button>
          
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('4')}}>4</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('5')}}>5</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('6')}}>6</button>
          
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('1')}}>1</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('2')}}>2</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('3')}}>3</button>

          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('.')}}>.</button>
          <button className={keyClasses} onPointerDown={(e) => {e.preventDefault(); handleKeyPress('0')}}>0</button>
          <button 
            className="flex items-center justify-center min-h-[70px] sm:min-h-[80px] bg-red-50 border border-red-200 rounded-xl text-3xl sm:text-4xl text-red-500 shadow-sm active:bg-red-200 active:scale-95 transition-all select-none"
            onPointerDown={(e) => {e.preventDefault(); handleKeyPress('backspace')}}
          >
            <i className="fas fa-backspace"></i>
          </button>
        </div>

        {/* 确认按钮 */}
        <button 
          onClick={handleConfirm}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white min-h-[70px] sm:min-h-[80px] rounded-xl text-2xl sm:text-3xl font-bold shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-3 select-none"
        >
          <i className="fas fa-check-circle"></i> 确认并提交
        </button>

      </div>
    </div>
  );
};

export default NumberKeypad;
