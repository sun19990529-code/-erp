import React, { useState, useEffect } from 'react';
import { api } from '../api';

export const BatchGenealogyPanel = ({ productionId }) => {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (productionId) load();
  }, [productionId]);

  const load = async () => {
    setLoading(true);
    const res = await api.get(`/production/${productionId}/genealogy`);
    if (res.success) {
      setNodes(res.data);
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  // Build tree from flat nodes
  const buildTree = (data) => {
    const map = {};
    const roots = [];
    data.forEach(node => {
      map[node.id] = { ...node, children: [] };
    });
    data.forEach(node => {
      if (node.parent_id && map[node.parent_id]) {
        map[node.parent_id].children.push(map[node.id]);
      } else {
        roots.push(map[node.id]);
      }
    });
    return roots;
  };

  const renderTree = (node, depth = 0) => {
    const isScrap = node.status === 'scrapped';
    const isCompleted = node.status === 'completed';
    const isCurrent = node.id === productionId;
    
    return (
      <div key={node.id} className={`pl-${depth > 0 ? 8 : 0} mt-3 relative`}>
        {/* Draw Line connecting to parent */}
        {depth > 0 && (
          <div className="absolute -left-4 top-5 w-4 h-px bg-gray-300"></div>
        )}
        {depth > 0 && (
          <div className="absolute -left-4 -top-3 w-px h-8 bg-gray-300"></div>
        )}

        <div className={`p-4 rounded-xl border-2 transition-all shadow-sm ${
          isCurrent ? 'border-blue-500 bg-blue-50 shadow-blue-100' :
          isScrap ? 'border-red-200 bg-red-50/50' : 
          isCompleted ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-white'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  isScrap ? 'bg-red-100 text-red-700' : 
                  isCurrent ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                  {node.order_no}
                </span>
                {isCurrent && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">当前查阅</span>}
              </div>
              <div className="text-sm font-bold text-gray-800">数量: {node.quantity}</div>
              {node.batch_no && <div className="text-xs text-gray-500 mt-1">批次: {node.batch_no}</div>}
              {node.split_reason && (
                <div className="text-xs text-red-600 mt-1.5 bg-red-50 p-1.5 rounded inline-block">
                  <i className="fas fa-info-circle mr-1"></i>分流原因: {node.split_reason}
                </div>
              )}
            </div>
            
            <div className="text-right">
              {isScrap ? (
                <div className="text-sm font-bold text-red-600">
                  <i className="fas fa-trash-alt mr-1"></i>已报废
                  {node.scrap_warehouse && <div className="text-xs font-normal text-gray-500 mt-1">已入: {node.scrap_warehouse}</div>}
                </div>
              ) : (
                <div className={`text-sm font-bold ${isCompleted ? 'text-green-600' : 'text-yellow-600'}`}>
                  {isCompleted ? <><i className="fas fa-check-circle mr-1"></i>已完工</> : <><i className="fas fa-spinner fa-spin mr-1"></i>{node.process_name || '生产中'}</>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {node.children && node.children.length > 0 && (
          <div className="border-l border-gray-300 ml-4">
            {node.children.map(child => renderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="p-8 text-center text-gray-500"><i className="fas fa-circle-notch fa-spin mr-2"></i>加载血缘图谱中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const trees = buildTree(nodes);

  return (
    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
      <div className="mb-6 pb-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-sitemap text-teal-600"></i>批次血缘追溯 (Genealogy)
          </h3>
          <p className="text-xs text-gray-500 mt-1">展示当前批次的所有衍生分支与源头母卷</p>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="min-w-[600px]">
          {trees.length > 0 ? trees.map(tree => renderTree(tree, 0)) : <div className="text-gray-500 text-center py-8">无数据</div>}
        </div>
      </div>
    </div>
  );
};
