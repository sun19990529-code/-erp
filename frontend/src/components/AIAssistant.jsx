import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const AIAssistant = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 初始化欢迎语
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: `你好，${user?.real_name || '用户'}！我是你的私人 AI 助理。有什么可以帮你的？`
        }
      ]);
    }
  }, [isOpen, user, messages.length]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // 处理文本发送
  const handleSend = async (customContent = null) => {
    const textToSend = customContent || input;
    if (!textToSend.trim()) return;

    const newUserMsg = { role: 'user', content: textToSend };
    const newMessages = [...messages, newUserMsg];
    
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/chat', { messages: newMessages });
      if (res.success && res.data) {
        setMessages(prev => [...prev, res.data]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示] 请求失败：${res.message}` }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示] 网络异常：${error.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 语音识别功能
  const toggleListen = () => {
    if (isListening) {
      setIsListening(false);
      // 停止录音 (SpeechRecognition是事件驱动的，调用stop)
      if (window.speechRecognitionInstance) {
        window.speechRecognitionInstance.stop();
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.__toast?.error('您的浏览器不支持语音识别功能，请使用最新版 Chrome 或 Edge');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    window.speechRecognitionInstance = recognition;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      // 将识别结果拼接到当前输入框
      if (finalTranscript) {
        setInput(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error !== 'no-speech') {
        window.__toast?.error('语音识别出错: ' + event.error);
      }
    };

    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  // 图片转 Base64 
  const getBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  // 处理图片上传
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return window.__toast?.error('只能上传图片文件');
    }
    if (file.size > 5 * 1024 * 1024) {
      return window.__toast?.error('图片大小不能超过 5MB');
    }

    try {
      const base64Url = await getBase64(file);
      
      const newUserMsg = {
        role: 'user',
        content: [
          { type: 'text', text: '请查看此图片：' },
          { type: 'image_url', image_url: { url: base64Url } }
        ]
      };

      const newMessages = [...messages, newUserMsg];
      setMessages(newMessages);
      setIsTyping(true);

      const res = await api.post('/ai/chat', { messages: newMessages });
      if (res.success && res.data) {
        setMessages(prev => [...prev, res.data]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示] 请求失败：${res.message}` }]);
      }
    } catch (error) {
      console.error('Image upload/chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `[系统提示] 图片处理异常` }]);
    } finally {
      setIsTyping(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderContent = (content) => {
    if (typeof content === 'string') {
      return content.split('\n').map((line, i) => <div key={i}>{line || <br/>}</div>);
    }
    if (Array.isArray(content)) {
      return content.map((item, i) => {
        if (item.type === 'text') return <span key={i}>{item.text}</span>;
        if (item.type === 'image_url') return <img key={i} src={item.image_url.url} alt="upload" className="max-w-full h-auto rounded-lg mt-2 cursor-pointer hover:opacity-90" onClick={() => window.open(item.image_url.url)} />;
        return null;
      });
    }
    return '';
  };

  return (
    <>
      {/* 悬浮气泡 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-tr from-teal-500 to-emerald-400 text-white rounded-full shadow-lg shadow-teal-500/30 flex items-center justify-center hover:scale-110 transition-transform duration-300"
        >
          <i className={`fas ${isHovered ? 'fa-comment-dots' : 'fa-robot'} text-2xl`}></i>
          {/* 小红点提示 */}
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
        </button>
      )}

      {/* 聊天窗口 */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl shadow-gray-900/20 flex flex-col overflow-hidden border border-gray-100" style={{ height: '600px', maxHeight: '80vh' }}>
          {/* 头部 */}
          <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-3 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <i className="fas fa-robot"></i>
              </div>
              <div>
                <div className="font-bold text-sm">铭晟 AI 助理</div>
                <div className="text-[10px] text-teal-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block animate-pulse"></span> Online
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMessages([])} className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors text-xs" title="清空对话">
                <i className="fas fa-trash-alt"></i>
              </button>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors" title="最小化">
                <i className="fas fa-chevron-down"></i>
              </button>
            </div>
          </div>

          {/* 消息区域 */}
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4 custom-scrollbar">
            {messages.map((msg, index) => {
              if (msg.role === 'system' || msg.role === 'tool') return null; // 不显示 system 和 tool 消息

              const isUser = msg.role === 'user';
              
              // 检查是否有 tool_calls (AI 正在使用工具)
              if (msg.tool_calls && msg.tool_calls.length > 0) {
                 return (
                    <div key={index} className="flex flex-col items-start max-w-[85%] text-sm">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 ml-1">
                        <i className="fas fa-robot text-teal-500"></i> AI 助理正在执行动作...
                      </div>
                      <div className="bg-white px-3 py-2 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 text-gray-500 italic">
                        <i className="fas fa-cog fa-spin mr-2"></i> 调用企业内部接口中...
                      </div>
                    </div>
                 );
              }

              return (
                <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] ${isUser ? 'ml-auto' : ''} text-sm`}>
                  <div className={`flex items-center gap-2 text-gray-500 text-xs mb-1 ${isUser ? 'mr-1 flex-row-reverse' : 'ml-1'}`}>
                    {isUser ? (
                      <><i className="fas fa-user text-blue-500"></i> {user?.real_name}</>
                    ) : (
                      <><i className="fas fa-robot text-teal-500"></i> AI 助理</>
                    )}
                  </div>
                  <div className={`px-4 py-2.5 rounded-2xl shadow-sm ${
                    isUser 
                      ? 'bg-blue-500 text-white rounded-tr-sm' 
                      : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                  }`} style={{ wordBreak: 'break-word' }}>
                    {renderContent(msg.content)}
                  </div>
                </div>
              );
            })}
            
            {isTyping && (
              <div className="flex flex-col items-start max-w-[85%] text-sm">
                 <div className="flex items-center gap-2 text-gray-500 text-xs mb-1 ml-1">
                    <i className="fas fa-robot text-teal-500"></i> AI 助理
                 </div>
                 <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 flex gap-1">
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="bg-white p-3 border-t border-gray-100 shrink-0">
            <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 p-1 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500 transition-shadow">
              
              {/* 图片上传按钮 */}
              <button 
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-teal-600 shrink-0 mb-1"
                title="上传图片"
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="fas fa-image text-lg"></i>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />

              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? '正在聆听...' : '有什么问题随时问我...'}
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 px-1 text-sm max-h-24 custom-scrollbar"
                rows="1"
                style={{ minHeight: '38px' }}
                disabled={isTyping}
              />
              
              {/* 语音按钮 */}
              <button 
                onClick={toggleListen}
                className={`w-8 h-8 flex items-center justify-center shrink-0 mb-1 transition-colors rounded-lg ${isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100'}`}
                title={isListening ? '停止语音输入' : '语音输入'}
              >
                <i className={`fas ${isListening ? 'fa-microphone' : 'fa-microphone-alt'} text-lg`}></i>
              </button>

              {/* 发送按钮 */}
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mb-1 transition-colors ${
                  input.trim() && !isTyping ? 'bg-teal-500 text-white shadow-md hover:bg-teal-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <i className="fas fa-paper-plane text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
