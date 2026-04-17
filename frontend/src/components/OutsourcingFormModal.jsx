import React, { useEffect, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../api';
import Modal from './Modal';
import OperatorSelect from './OperatorSelect';

// Zod Schema
const outsourcingSchema = z.object({
  supplier_id: z.string().min(1, "请选择供应商"),
  expected_date: z.string().optional(),
  operator: z.string().optional(),
  remark: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().min(1, "请选取加工产品"),
    quantity: z.coerce.number().min(0.01, "数量必须大于0"),
    unit_price: z.coerce.number().min(0, "单价不能为负数"),
    unit: z.string().default("件"),
    production_order_id: z.union([z.string(), z.number()]).optional().nullable(),
    process_id: z.union([z.string(), z.number()]).optional().nullable(),
    production_order_no: z.string().optional().nullable(),
    process_name: z.string().optional().nullable(),
  })).min(1, "至少需要一项加工明细")
});

const OutsourcingFormModal = ({ isOpen, onClose, mode, initialData, onSuccess, suppliers, products, productions, processes }) => {
  
  const { register, control, handleSubmit, formState: { errors, isSubmitting }, reset, watch, setValue } = useForm({
    resolver: zodResolver(outsourcingSchema),
    defaultValues: {
      supplier_id: '',
      expected_date: '',
      operator: '',
      remark: '',
      items: [{ product_id: '', quantity: 1, unit_price: 0, unit: '公斤', production_order_id: null, process_id: null }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // 数据填充
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        reset({
          supplier_id: String(initialData.supplier_id || ''),
          expected_date: initialData.expected_date || '',
          operator: initialData.operator || '',
          remark: initialData.remark || '',
          items: (initialData.items || []).map(i => ({
            ...i,
            product_id: String(i.product_id || ''),
            production_order_id: i.production_order_id || null,
            process_id: i.process_id || null,
            production_order_no: i.production_order_no || null,
            process_name: i.process_name || null,
          }))
        });
      } else if (mode === 'create') {
        const defaultItems = initialData?.items?.length > 0
          ? initialData.items.map(i => ({
              product_id: String(i.product_id || ''),
              quantity: i.quantity || 1,
              unit_price: i.unit_price || 0,
              unit: i.unit || '公斤',
              production_order_id: i.production_order_id || null,
              process_id: i.process_id || null,
              production_order_no: i.production_order_no || null,
              process_name: i.process_name || null,
            }))
          : [{ product_id: '', quantity: 1, unit_price: 0, unit: '公斤', production_order_id: null, process_id: null }];
        reset({
          supplier_id: initialData?.supplier_id ? String(initialData.supplier_id) : '',
          expected_date: '',
          operator: '',
          remark: '',
          items: defaultItems
        });
      }
    }
  }, [isOpen, mode, initialData, reset]);

  // 实时计算总价
  const watchedItems = watch("items", fields);
  const totalAmount = watchedItems.reduce((acc, curr) => {
    return acc + (Number(curr.unit_price || 0) * Number(curr.quantity || 0));
  }, 0);

  // 构建产品名称查找 Map（避免 N^2 遍历）
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => map.set(String(p.id), p));
    return map;
  }, [products]);

  // 提交逻辑
  const onSubmit = async (data) => {
    const cleanedData = {
      ...data,
      items: data.items.filter(i => i.product_id).map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        unit: i.unit,
        production_order_id: i.production_order_id || null,
        process_id: i.process_id || null,
        remark: i.remark || null,
      })),
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
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'edit' ? '编辑委外单' : '新增委外单'} size="max-w-4xl">
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
            <label className="block text-sm font-medium mb-1">预计完成日期</label>
            <input type="date" {...register("expected_date")} className="w-full border rounded-lg px-3 py-2" />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">操作员</label>
            <OperatorSelect register={register} name="operator" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 flex items-center justify-between">
            <span>加工明细 <span className="text-red-500">*</span></span>
            <span className="text-xs text-gray-400">每行可关联不同工单</span>
          </label>
          <div className={`border rounded-lg p-3 space-y-2 ${errors.items?.root ? 'border-red-500 bg-red-50' : ''}`}>
            {fields.map((field, i) => {
              const item = watchedItems[i] || {};
              const hasPoLink = item.production_order_id || item.production_order_no;
              return (
                <div key={field.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-teal-300 transition-colors space-y-2">
                  {/* 来源工单标签（只读展示） */}
                  {hasPoLink && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">
                        <i className="fas fa-link mr-1"></i>
                        {item.production_order_no || `工单#${item.production_order_id}`}
                      </span>
                      {(item.process_name || item.process_id) && (
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
                          <i className="fas fa-cogs mr-1"></i>
                          {item.process_name || `工序#${item.process_id}`}
                        </span>
                      )}
                      {/* 隐藏字段 */}
                      <input type="hidden" {...register(`items.${i}.production_order_id`)} />
                      <input type="hidden" {...register(`items.${i}.process_id`)} />
                    </div>
                  )}
                  
                  <div className="flex flex-wrap lg:flex-nowrap gap-2 items-center">
                    {/* 产品选择 */}
                    <div className="flex-1 min-w-[200px]">
                      <select {...register(`items.${i}.product_id`)} className={`w-full border rounded px-2 py-1.5 text-sm ${errors.items?.[i]?.product_id ? 'border-red-500' : 'border-gray-300'}`}>
                        <option value="">选择加工产品</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code}){p.specification ? ` - ${p.specification}` : ''}</option>)}
                      </select>
                    </div>

                    {/* 数量 */}
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-xs text-gray-500 shrink-0">数量</span>
                      <input type="number" step="0.01" {...register(`items.${i}.quantity`)} className={`w-full border rounded px-2 py-1 text-sm ${errors.items?.[i]?.quantity ? 'border-red-500' : 'border-gray-300'}`} />
                    </div>

                    {/* 单位 */}
                    <div className="w-20">
                      <select {...register(`items.${i}.unit`)} className="w-full border rounded px-2 py-1 text-sm text-gray-700">
                        <option value="公斤">公斤</option><option value="支">支</option><option value="件">件</option><option value="米">米</option><option value="根">根</option>
                      </select>
                    </div>

                    {/* 单价 */}
                    <div className="flex items-center gap-1 w-32">
                      <span className="text-xs text-gray-500 shrink-0">单价¥</span>
                      <input type="number" step="0.01" {...register(`items.${i}.unit_price`)} className={`w-full border rounded px-2 py-1 text-sm ${errors.items?.[i]?.unit_price ? 'border-red-500' : 'border-gray-300'}`} />
                    </div>

                    {/* 删除 */}
                    <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-2 py-1" disabled={fields.length === 1}>
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              );
            })}
            
            <button type="button" onClick={() => append({ product_id: '', quantity: 1, unit_price: 0, unit: '公斤', production_order_id: null, process_id: null })} 
              className="mt-2 w-full py-2 bg-teal-50 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-100 transition-colors border border-dashed border-teal-300">
              <i className="fas fa-plus mr-1"></i> 手动添加明细
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
          <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium flex items-center">
            {isSubmitting ? <><i className="fas fa-circle-notch fa-spin mr-2"></i>提交中</> : '确认提交'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default OutsourcingFormModal;
