import React, { useState } from 'react';
import { api } from '../api';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.5.5';

const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await api.post('/users/login', { username, password });
    setLoading(false);
    if (res.success) onLogin(res.data);
    else setError(res.message || '登录失败');
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* 左侧：品牌展示（在大屏幕上显示） */}
      <div className="hidden lg:flex w-[48%] bg-gradient-to-br from-teal-900 via-teal-800 to-cyan-900 relative overflow-hidden flex-col justify-between p-12 shadow-2xl z-10">
        {/* 背景装饰元素 */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          {/* 光效 */}
          <div className="absolute -top-32 -left-32 w-[30rem] h-[30rem] bg-teal-400/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[25rem] h-[25rem] bg-cyan-300/20 rounded-full blur-[80px]"></div>
          
          {/* 网格图案底纹 */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgzOXYzOUgxVjF6IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==')] opacity-60"></div>
          
          {/* 抽象线条 / 几何形 */}
          <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,100 C30,60 70,80 100,0 L100,100 Z" fill="currentColor" className="text-teal-400" />
            <path d="M0,100 C40,40 80,60 100,20 L100,100 Z" fill="currentColor" className="text-teal-300 opacity-50" />
          </svg>
        </div>

        {/* 顶部 Logo */}
        <div className="relative z-10 flex items-center gap-4 fade-in">
          <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-lg overflow-hidden">
            <img src="/logo.png" alt="铭晨" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white text-2xl font-bold tracking-wider">铭晟 <span className="text-teal-300">ERP</span></span>
        </div>

        {/* 居中核心信息 */}
        <div className="relative z-10 my-auto pt-10">
          <div className="inline-block px-4 py-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 backdrop-blur-sm text-teal-200 text-sm font-medium mb-8 fade-in" style={{animationDelay: '0.1s'}}>
            <i className="fas fa-rocket mr-2"></i> 全新一代制造执行系统 v{APP_VERSION}
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-[1.1] tracking-tight fade-in" style={{animationDelay: '0.2s'}}>
            智能化制造 <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-200 to-cyan-200">
              数据驱动未来
            </span>
          </h1>
          <p className="text-teal-50 text-lg max-w-md leading-relaxed opacity-80 mb-10 fade-in" style={{animationDelay: '0.3s'}}>
            极简、高效的企业级资源管理平台。打通从销售、采购、仓储到生产制造的全链路数据协同。
          </p>
          
          <div className="flex gap-4 fade-in" style={{animationDelay: '0.4s'}}>
            <div className="flex items-center gap-2 text-white/90 font-medium text-sm bg-white/5 px-5 py-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
              <div className="w-6 h-6 rounded-full bg-teal-500/30 flex items-center justify-center"><i className="fas fa-check text-teal-300 text-xs"></i></div> 数据互通
            </div>
            <div className="flex items-center gap-2 text-white/90 font-medium text-sm bg-white/5 px-5 py-3 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/10 transition-colors cursor-default">
              <div className="w-6 h-6 rounded-full bg-cyan-500/30 flex items-center justify-center"><i className="fas fa-bolt text-cyan-300 text-xs"></i></div> 高效协同
            </div>
          </div>
        </div>

        {/* 底部版权说明 */}
        <div className="relative z-10 text-white/40 text-sm flex justify-between items-center font-medium">
          <span>&copy; {new Date().getFullYear()} 铭晟科技 </span>
          <span className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">使用协议</a>
            <a href="#" className="hover:text-white transition-colors">隐私政策</a>
          </span>
        </div>
      </div>

      {/* 右侧：登录面板 */}
      <div className="flex-1 flex flex-col justify-start pt-16 lg:justify-center lg:pt-0 items-center px-6 pb-10 lg:p-12 relative overflow-x-hidden overflow-y-auto bg-white">
        {/* 只在移动端显示的背景装饰 */}
        <div className="absolute inset-0 bg-gray-50 lg:hidden -z-10 overflow-hidden">
           <div className="absolute top-[-5%] right-[-10%] w-80 h-80 bg-teal-200/40 rounded-full blur-[80px]"></div>
           <div className="absolute bottom-[-5%] left-[-10%] w-80 h-80 bg-cyan-200/40 rounded-full blur-[80px]"></div>
        </div>

        <div className="w-full max-w-[420px] fade-in transform transition-all">
          {/* 移动端显示的 Logo */}
          <div className="text-center mb-8 lg:hidden px-4 py-6 bg-white/60 backdrop-blur-xl rounded-3xl border border-gray-100 shadow-xl shadow-teal-900/5">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-50 to-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30 overflow-hidden border border-teal-100">
              <img src="/logo.png" alt="铭晨" className="w-10 h-10 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-wide">铭晟 <span className="text-teal-600">ERP</span></h1>
            <p className="text-gray-500 mt-1.5 text-xs">企业级资源管理与制造执行系统</p>
          </div>

          <div className="mb-8 text-center flex flex-col items-center">
            <div className="w-16 h-1 bg-teal-500 rounded-full mb-6 hidden lg:block"></div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2 tracking-tight">欢迎回来</h2>
            <p className="text-gray-500 text-sm lg:text-base">请输入您的账号密码登录系统后台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">用户名</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <i className="far fa-user text-gray-400 group-focus-within:text-teal-500 transition-colors"></i>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white outline-none transition-all font-medium text-[15px] shadow-sm hover:border-gray-300"
                  placeholder="admin"
                  required
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">密码</label>
                <a href="#" className="text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline">忘记密码？</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <i className="fas fa-lock text-gray-400 group-focus-within:text-teal-500 transition-colors"></i>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:bg-white outline-none transition-all font-medium text-[15px] tracking-widest shadow-sm hover:border-gray-300"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-[fadeIn_0.3s]">
                <i className="fas fa-exclamation-circle"></i>
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-teal-600 to-teal-500 text-white py-3.5 rounded-xl font-bold text-base tracking-wide shadow-[0_8px_20px_-6px_rgba(20,184,166,0.5)] hover:shadow-[0_12px_24px_-6px_rgba(20,184,166,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin text-lg"></i>
                  <span>正在安全连接...</span>
                </>
              ) : (
                <>
                  <span>立即登录</span> 
                  <i className="fas fa-arrow-right text-sm ml-1 opacity-80 group-hover:opacity-100"></i>
                </>
              )}
            </button>
          </form>

          {/* 移除底部测试账号提示 */}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
