import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../api';
import { MOCK_DATA } from './mockData';

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('inbound');
  const [editingTemplate, setEditingTemplate] = useState(null);

  // 编辑区状态
  const [htmlCode, setHtmlCode] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // 获取模板列表（使用项目统一的 api 封装而非原生 axios）
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get(`/print-templates?type=${activeTab}`);
      if (res.success) setTemplates(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTemplates();
    setEditingTemplate(null);
  }, [fetchTemplates]);

  // 选中编辑某个模板
  const handleEdit = async (id) => {
    try {
      const res = await api.get(`/print-templates/${id}`);
      if (res.success) {
        const item = res.data;
        setEditingTemplate(item);
        setHtmlCode(item.content);
        setTemplateName(item.name);
        setIsDefault(item.is_default === 1);
      }
    } catch (e) {
      console.error(e);
      window.__toast?.error('加载模板详情失败');
    }
  };

  // 准备新增空白模板
  const handleAddNew = () => {
    setEditingTemplate({ id: 'new', type: activeTab });
    setTemplateName('未命名新模板');
    setHtmlCode('<!-- 请在此处编写 HTML --><div style="padding: 20px;">这里是内容</div>');
    setIsDefault(false);
  };

  // 保存模板
  const handleSave = async () => {
    if (!templateName.trim() || !htmlCode.trim()) {
      return window.__toast?.warning('模板名称和内容不能为空');
    }
    const payload = {
      type: activeTab,
      name: templateName,
      content: htmlCode,
      is_default: isDefault
    };

    try {
      if (editingTemplate.id === 'new') {
        const res = await api.post('/print-templates', payload);
        if (res.success) {
          window.__toast?.success('创建成功');
          fetchTemplates();
          handleEdit(res.data.id);
        } else {
          window.__toast?.error(res.message || '保存失败');
        }
      } else {
        const res = await api.put(`/print-templates/${editingTemplate.id}`, payload);
        if (res.success) {
          window.__toast?.success('保存成功');
          fetchTemplates();
        } else {
          window.__toast?.error(res.message || '保存失败');
        }
      }
    } catch (e) {
      console.error(e);
      window.__toast?.error('保存失败');
    }
  };

  // 删除模板
  const handleDelete = async (id, name) => {
    if (!window.confirm(`确定要删除模板「${name}」吗？此操作不可恢复。`)) return;
    try {
      const res = await api.del(`/print-templates/${id}`);
      if (res.success) {
        window.__toast?.success('模板已删除');
        if (editingTemplate?.id === id) {
          setEditingTemplate(null);
          setHtmlCode('');
          setTemplateName('');
        }
        fetchTemplates();
      } else {
        window.__toast?.error(res.message || '删除失败');
      }
    } catch (e) {
      console.error(e);
      window.__toast?.error('删除失败');
    }
  };

  // 快速插入占位符
  const insertSnippet = (snippet) => {
    setHtmlCode((prev) => prev + snippet);
  };

  /**
   * 预览渲染逻辑
   * 注意：不能直接复用 renderTemplate，因为它内部会把未匹配的{{占位符}}清为空字符串
   * 预览模式下我们希望未匹配的字段显示醒目的【字段空缺】标记方便排查
   */
  const previewHtml = useMemo(() => {
    if (!htmlCode) return '';
    const data = MOCK_DATA[activeTab] || {};

    let result = htmlCode;

    // 处理 ITEMS 循环块
    const processLoop = (loopName, arrayData) => {
      const startTag = `<!-- LOOP_${loopName}_START -->`;
      const endTag = `<!-- LOOP_${loopName}_END -->`;
      const si = result.indexOf(startTag);
      const ei = result.indexOf(endTag);
      if (si !== -1 && ei !== -1 && arrayData && Array.isArray(arrayData)) {
        const block = result.substring(si + startTag.length, ei);
        let rendered = '';
        arrayData.forEach((item, idx) => {
          let row = block.replace(/\{\{index\}\}/g, idx + 1);
          Object.keys(item).forEach(k => {
            row = row.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), item[k] == null ? '' : item[k]);
          });
          rendered += row;
        });
        result = result.substring(0, si) + rendered + result.substring(ei + endTag.length);
      }
    };

    processLoop('ITEMS', data.items);
    if (data.processes) processLoop('PROCESSES', data.processes);

    // 替换顶层变量
    Object.keys(data).forEach(k => {
      if (typeof data[k] !== 'object') {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), data[k]);
      }
    });

    // 预览模式：未匹配的占位符用醒目红色标记，而非清空
    result = result.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '<span style="color:red;font-weight:bold;background:#fff0f0;padding:0 4px;border:1px dashed red;font-size:12px;">⚠$1</span>');

    return result;
  }, [htmlCode, activeTab]);

  return (
    <div style={{ padding: '20px', height: 'calc(100vh - 84px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>🖨️ 单据打印模板生成器</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { key: 'inbound', label: '采购入库单' },
            { key: 'outbound', label: '销售出库单' },
            { key: 'production', label: '生产工单' },
          ].map(tab => (
            <button
              key={tab.key}
              style={{ padding:'6px 16px', background: activeTab===tab.key?'#3b82f6':'#e5e7eb', color: activeTab===tab.key?'#fff':'#333', border:'none', borderRadius:'4px', cursor:'pointer' }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '20px', minHeight: 0 }}>
        {/* 左侧：模板列表 */}
        <div style={{ width: '250px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>已存模板列表</span>
            <button onClick={handleAddNew} style={{ background:'#10b981', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'12px' }}>+ 新增</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => handleEdit(t.id)}
                style={{
                  padding: '12px 15px',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  backgroundColor: editingTemplate?.id === t.id ? '#eff6ff' : 'transparent',
                  borderLeft: editingTemplate?.id === t.id ? '4px solid #3b82f6' : '4px solid transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', color: '#111' }}>{t.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.name); }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}
                    title="删除此模板"
                  >✕</button>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.is_default === 1 && <span style={{ color: '#ef4444' }}>[默认选中]</span>}</span>
                  <span>ID: {t.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：代码与预览工作区 */}
        {editingTemplate ? (
          <div style={{ flex: 1, display: 'flex', gap: '20px', minHeight: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

              {/* 编辑器顶栏 */}
              <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="模板名称"
                    style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                    <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} style={{ marginRight: '6px' }} />
                    设为默认打印模板
                  </label>
                  <button onClick={handleSave} style={{ background:'#3b82f6', color:'white', border:'none', padding:'8px 20px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold' }}>保存模板</button>
                </div>

                <div style={{ fontSize: '12px', color: '#4b5563', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight:'bold', color:'#111', lineHeight: '24px' }}>快速插入:</span>
                  <button onClick={() => insertSnippet('{{order_no}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>单号</button>
                  <button onClick={() => insertSnippet('{{created_at}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>日期</button>
                  {activeTab !== 'production' && <button onClick={() => insertSnippet('{{warehouse_name}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>仓库名</button>}
                  {activeTab === 'inbound' && <button onClick={() => insertSnippet('{{supplier_name}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>供应商</button>}
                  {activeTab === 'outbound' && <>
                    <button onClick={() => insertSnippet('{{customer_name}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>客户</button>
                    <button onClick={() => insertSnippet('{{ref_order_no}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>关单号</button>
                  </>}
                  {activeTab === 'production' && <button onClick={() => insertSnippet('{{product_name}}')} style={{ padding:'2px 8px', border:'1px solid #d1d5db', background:'#f9fafb', borderRadius:'4px', cursor:'pointer' }}>产品品名</button>}
                </div>
              </div>

              {/* 代码输入区 */}
              <textarea
                value={htmlCode}
                onChange={e => setHtmlCode(e.target.value)}
                style={{ flex: 1, padding: '15px', fontFamily: 'Consolas, monospace', fontSize: '13px', lineHeight: '1.5', color: '#1f2937', backgroundColor: '#fdfdfd', border: 'none', resize: 'none', outline: 'none' }}
                placeholder="请在此编写 HTML 与 CSS 样式。使用 {{变量名}} 来渲染动态数据！"
                spellCheck="false"
              />
            </div>

            {/* 实时预览区 —— sandbox iframe 隔离 XSS */}
            <div style={{ flex: 1, backgroundColor: '#e5e7eb', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 15px', background: '#374151', color: '#fff', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span>📄 实时渲染效果预览 (模拟测试数据)</span>
                <span>基于浏览器引擎排版</span>
              </div>
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '210mm', minHeight: '297mm', padding: '0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <iframe
                    title="模板预览"
                    sandbox="allow-same-origin"
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;">${previewHtml}</body></html>`}
                    style={{ width: '100%', minHeight: '297mm', border: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: '8px', color: '#9ca3af', fontSize: '18px' }}>
            👈 请在左侧选择一个模板，或新建模板进行排版编辑
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;
