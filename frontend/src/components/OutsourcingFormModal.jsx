import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../api';
import Modal from './Modal';
import OperatorSelect from './OperatorSelect';

// 1. Zod Schema 定义 (前后端理论上可共用这部分逻辑)
const outsourcingSchema = z.object({
  supplier_id: z.string().min(1, "请选择供应商"),
  production_order_id: z.string().optional(),
  process_id: z.string().optional(),
  expected_date: z.string().optional(),
  operator: z.string().optional(),
  remark: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().min(1, "请选取加工产品"),
    quantity: z.coerce.number().min(0.01, "数量必须大于0"),
    unit_price: z.coerce.number().min(0, "单价不能为负数"),
    unit: z.string().default("件")
  })).min(1, "至少需要一项加工明细")
});

/**
 * 现代化的 RHF + Zod 外协表单
 */
const OutsourcingFormModal = ({ isOpen, onClose, mode, initialData, onSuccess, suppliers, products, productions, processes }) => {
  
  // 初始化 Hook Form
  const { register, control, handleSubmit, formState: { errors, isSubmitting }, reset, watch, setValue } = useForm({
    resolver: zodResolver(outsourcingSchema),
    defaultValues: {
      supplier_id: '',
      production_order_id: '',
      process_id: '',
      expected_date: '',
      operator: '',
      remark: '',
      items: [{ product_id: '', quantity: 1, unit_price: 0, unit: '公斤' }]
    }
  });

  // 管理内嵌明细数组
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  // 数据填充
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        reset(initialData);
      } else if (mode === 'create') {
        const defaultItems = initialData?.items?.length > 0 ? initialData.items : [{ product_id: '', quantity: 1, unit_price: 0, unit: '公斤' }];
        reset({
          ...initialData,
          items: defaultItems
        });
      }
    }
  }, [isOpen, mode, initialData, reset]);

  // 监听所有 items 以实时计算总价 (避免组件深度重排)
  const watchedItems = watch("items", fields);
  const totalAmount = watchedItems.reduce((acc, curr) => {
    return acc + (Number(curr.unit_price || 0) * Number(curr.quantity || 0));
  }, 0);

  // 提交逻辑
  const onSubmit = async (data) => {
    // 剔除空产品
    const cleanedData = {
      ...data,
      items: data.items.filter(i => i.product_id),
      production_order_id: data.production_order_id || null,
      process_id: data.process_id || null,
    };

    const res = mode === 'edit' 
      ? await api.put(`/outsourcing/${initialData.id}`, cleanedData)
      : await api.post('/outsourcing', cleanedData);

    if (res.success) {
      onSuccess();
    } else {
      window.__toast?.error(res.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'edit' ? '编辑委外单' : '新增委外'} size="max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        
        {/* 全局级错误提示 */}
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">
            <i className="fas fa-exclamation-circle mr-2"></i>表单存在未填项或格式错误，请检查标红字段。
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">供应商 <span className="text-red-500">*</span></label>
            <select {...register("supplier_id")} className={`w-full border rounded-lg px-3 py-2 ${errors.supplier_id ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}>
              <option value="">请选择</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.supplier_id && <p className="text-red-500 text-xs mt-1">{errors.supplier_id.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">关联生产工单</label>
            <select {...register("production_order_id")} className="w-full border rounded-lg px-3 py-2">
              <option value="">无</option>
              {productions.map(p => <option key={p.id} value={p.id}>{p.order_no} - {p.product_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">关联工序</label>
            <select {...register("process_id")} className="w-full border rounded-lg px-3 py-2">
              <option value="">无</option>
              {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">预计完成日期</label>
            <input type="date" {...register("expected_date")} className="w-full border rounded-lg px-3 py-2" />
          </div>
          
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">操作员</label>
              <OperatorSelect register={register} name="operator" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center justify-between">
            <span>加工明细 <span className="text-red-500">*</span></span>
          </label>
          <div className={`border rounded-lg p-3 space-y-2 ${errors.items?.root ? 'border-red-500 bg-red-50' : ''}`}>
            {fields.map((field, i) => (
              <div key={field.id} className="flex flex-wrap lg:flex-nowrap gap-2 items-center bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-teal-300 transition-colors">
                
                {/* 产品选择 */}
                <div className="flex-1 min-w-[200px]">
                  <select {...register(`items.${i}.product_id`)} className={`w-full border rounded px-2 py-1.5 text-sm ${errors.items?.[i]?.product_id ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">选择产品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </select>
                </div>

                {/* 数量与单位 */}
                <div className="flex items-center gap-1 w-32">
                  <span className="text-xs text-gray-500">数量</span>
                  <input type="number" step="0.01" {...register(`items.${i}.quantity`)} className={`w-16 border rounded px-2 py-1 text-sm ${errors.items?.[i]?.quantity ? 'border-red-500' : 'border-gray-300'}`} />
                </div>

                <div className="w-20">
                  <select {...register(`items.${i}.unit`)} className="w-full border rounded px-2 py-1 text-sm text-gray-700">
                    <option value="公斤">公斤</option><option value="支">支</option><option value="件">件</option>
                  </select>
                </div>

                {/* 单价 */}
                <div className="flex items-center gap-1 w-36">
                  <span className="text-xs text-gray-500">单价¥</span>
                  <input type="number" step="0.01" {...register(`items.${i}.unit_price`)} className={`w-20 border rounded px-2 py-1 text-sm ${errors.items?.[i]?.unit_price ? 'border-red-500' : 'border-gray-300'}`} />
                </div>

                {/* 删除 */}
                <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-2 py-1" disabled={fields.length === 1}>
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            ))}
            
            <button type="button" onClick={() => append({ product_id: '', quantity: 1, unit_price: 0, unit: '公斤' })} 
              className="mt-2 w-full py-2 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors border border-dashed border-teal-300">
              <i className="fas fa-plus mr-1"></i> 继续添加
            </button>
            {errors.items?.root && <p className="text-red-500 text-xs mt-1">{errors.items.root.message}</p>}
            
            <div className="text-right font-bold text-gray-700 mt-3 pt-3 border-t border-gray-200">
              预计总金额: <span className="text-teal-700 text-lg">¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea {...register("remark")} className="w-full border border-gray-300 rounded-lg px-3 py-2" rows="2"></textarea>
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">取消</button>
          <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium flex items-center relative overflow-hidden group">
            {isSubmitting ? <><i className="fas fa-circle-notch fa-spin mr-2"></i>提交中</> : '确认提交'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default OutsourcingFormModal;
