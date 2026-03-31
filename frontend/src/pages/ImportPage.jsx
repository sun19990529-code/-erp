import React, { useState, useRef } from 'react';
import { api } from '../api';

const ImportPage = () => {
  const [activeType, setActiveType] = useState('products');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const types = [
    { id: 'products', label: '产品档案', icon: 'fa-box', desc: '导入产品编码、名称、规格、分类等' },
    { id: 'suppliers', label: '供应商', icon: 'fa-truck', desc: '导入供应商名称、联系人、电话等' },
    { id: 'customers', label: '客户', icon: 'fa-users', desc: '导入客户名称、联系人、电话等' }
  ];

  const getAuthToken = () => {
    try {
      const saved = localStorage.getItem('erp_user_auth');
      if (saved) { const { user } = JSON.parse(saved); return user?.token || null; }
    } catch { /* ignore */ }
    return null;
  };

  const downloadTemplate = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/import/template?type=${activeType}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('下载失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${types.find(t => t.id === activeType)?.label || ''}导入模板.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      window.__toast?.success('模板下载成功');
    } catch (e) {
      window.__toast?.error('模板下载失败');
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      window.__toast?.warning('请上传 .xlsx 格式的 Excel 文件');
      return;
    }
    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/import/${activeType}`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        window.__toast?.success(`导入完成：成功 ${data.data.imported} 条`);
      } else {
        window.__toast?.error(data.message);
      }
    } catch (e) {
      window.__toast?.error('上传失败');
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">数据导入</h2>
          <p className="text-sm text-gray-500 mt-1">通过 Excel 文件批量导入产品、供应商、客户数据</p>
        </div>
      </div>

      {/* 类型选择 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {types.map(t => (
          <button key={t.id} onClick={() => { setActiveType(t.id); setResult(null); }}
            className={`p-4 rounded-xl border-2 transition-all text-left ${activeType === t.id
              ? 'border-teal-500 bg-teal-50/50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeType === t.id ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                <i className={`fas ${t.icon}`}></i>
              </div>
              <div>
                <div className={`font-bold text-sm ${activeType === t.id ? 'text-teal-700' : 'text-gray-800'}`}>{t.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 上传区 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-700">
            <i className="fas fa-upload mr-2 text-teal-600"></i>上传 Excel 文件
          </h3>
          <button onClick={downloadTemplate} className="text-sm text-teal-600 hover:text-teal-800 font-medium">
            <i className="fas fa-download mr-1"></i>下载模板
          </button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            dragOver ? 'border-teal-500 bg-teal-50/50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
          }`}
        >
          {loading ? (
            <div className="text-teal-600">
              <i className="fas fa-spinner fa-spin text-4xl mb-3 block"></i>
              <div className="font-medium">正在导入...</div>
            </div>
          ) : (
            <>
              <i className={`fas fa-cloud-upload-alt text-4xl mb-3 block ${dragOver ? 'text-teal-500' : 'text-gray-300'}`}></i>
              <div className="text-gray-600 font-medium">拖拽文件到此处，或点击选择文件</div>
              <div className="text-xs text-gray-400 mt-2">支持 .xlsx 格式，单次最大 5MB</div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleUpload(e.target.files[0])} />
        </div>

        {/* 导入说明 */}
        <div className="mt-4 bg-amber-50 rounded-lg p-4 border border-amber-200">
          <div className="flex items-start gap-2">
            <i className="fas fa-info-circle text-amber-500 mt-0.5"></i>
            <div className="text-sm text-amber-800">
              <div className="font-medium mb-1">导入须知</div>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-700">
                <li>请先下载模板，按照模板格式填写数据</li>
                <li>标记 * 的列为必填项</li>
                <li>编码与已有数据重复时将自动跳过</li>
                <li>产品分类填写：原材料、半成品、成品（也支持 raw/semi/finished）</li>
                <li>产品尺寸（外径/内径/壁厚/长度）为选填，填写后自动生成规格名称</li>
                <li>供应商名称须与系统中已有供应商完全一致，否则不会关联</li>
                <li>客户信用等级填写：A / B / C</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 导入结果 */}
      {result && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-gray-700 mb-4">
            <i className="fas fa-clipboard-check mr-2 text-green-600"></i>导入结果
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
              <div className="text-2xl font-bold text-green-600">{result.imported}</div>
              <div className="text-xs text-green-700 mt-1">成功导入</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center border border-yellow-100">
              <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
              <div className="text-xs text-yellow-700 mt-1">跳过</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
              <div className="text-2xl font-bold text-gray-600">{result.total}</div>
              <div className="text-xs text-gray-500 mt-1">总行数</div>
            </div>
          </div>
          {result.errors?.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-100">
              <div className="text-sm font-medium text-red-700 mb-2">
                <i className="fas fa-exclamation-triangle mr-1"></i>跳过详情 ({result.errors.length})
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.errors.map((err, i) => (
                  <div key={i} className="text-xs text-red-600">• {err}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportPage;
