import React, { useEffect, useMemo } from 'react';
import Modal from './Modal';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import OperatorSelect from './OperatorSelect';
import SearchSelect from './SearchSelect';
import { formatAmount } from '../utils/format';

const purchaseSchema = z.object({
  supplier_id: z.coerce.number().min(1, '请选择供应商'),
  expected_date: z.string().optional(),
  operator: z.string().optional(),
  remark: z.string().optional(),
  items: z.array(z.object({
    id: z.number().optional(),
    product_id: z.coerce.number({ invalid_type_error: ' ' }).min(1, '请选择产品'),
    quantity: z.coerce.number({ invalid_type_error: '数量必填' }).min(0.001, '数量需大于0'),
    total_amount: z.coerce.number().optional()
  })).min(1, '请至少添加一条产品明细')
});

const PurchaseFormModal = ({ isOpen, onClose, mode, initialData, onSubmitSuccess, suppliers, allProducts }) => {
  const isEdit = mode === 'edit';
  const title = isEdit ? '编辑采购单' : '新增采购单';
  
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplier_id: '',
      expected_date: '',
      operator: '',
      remark: '',
      items: [{ product_id: '', quantity: 1, total_amount: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  // 监听供应商的变动，以动态过滤产品及清空不符合条件的已选产品
  const selectedSupplierId = useWatch({ control, name: 'supplier_id' });
  const currentItems = useWatch({ control, name: 'items' });

  // 根据选中的供应商过滤产品
  const availableProducts = useMemo(() => {
    if (!selectedSupplierId) return allProducts; // 或者不返回，由逻辑端把控
    return allProducts.filter(p => (p.suppliers || []).some(s => String(s.supplier_id) === String(selectedSupplierId)));
  }, [allProducts, selectedSupplierId]);

  // 初始化数据表单
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          supplier_id: initialData.supplier_id || '',
          expected_date: initialData.expected_date ? initialData.expected_date.substring(0, 10) : '',
          operator: initialData.operator || '',
          remark: initialData.remark || '',
          items: initialData.items && initialData.items.length > 0 
            ? initialData.items.map(it => ({
                id: it.id,
                product_id: it.product_id,
                quantity: it.quantity,
                total_amount: it.total_amount || (it.unit_price && it.quantity ? parseFloat((it.unit_price * it.quantity).toFixed(2)) : '')
              }))
            : [{ product_id: '', quantity: 1, total_amount: '' }]
        });
      } else {
        reset({
          supplier_id: '',
          expected_date: '',
          operator: '',
          remark: '',
          items: [{ product_id: '', quantity: 1, total_amount: '' }]
        });
      }
    }
  }, [isOpen, initialData, reset]);

  // 当供应商变化时，清洗不属于当前供应商的明细
  useEffect(() => {
    if (!isOpen || isEdit) return; // 编辑态不自动清除
    if (currentItems && currentItems.length > 0) {
      let changed = false;
      const cleanItems = currentItems.map(it => {
        if (it.product_id) {
          const prodExists = availableProducts.find(p => String(p.id) === String(it.product_id));
          if (!prodExists) {
             changed = true;
             return { ...it, product_id: '' };
          }
        }
        return it;
      });
      if (changed) {
        setValue('items', cleanItems);
      }
    }
  }, [selectedSupplierId, availableProducts, isOpen, isEdit, setValue]);

  const onFormSubmit = (data) => {
    // 聚合并计算 unit_price
    const finalItems = data.items.map(it => ({
      ...it,
      unit_price: (it.total_amount && it.quantity) ? parseFloat((it.total_amount / it.quantity).toFixed(4)) : 0
    }));

    const finalData = {
      ...data,
      items: finalItems
    };

    onSubmitSuccess(finalData);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="max-w-3xl">
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">供应商 *</label>
            <Controller
              name="supplier_id"
              control={control}
              render={({ field }) => (
                <SearchSelect 
                  {...field}
                  options={suppliers.map(s => ({ id: s.id, name: s.name }))}
                  placeholder="请选择供应商"
                />
              )}
            />
            {errors.supplier_id && <p className="text-red-500 text-xs mt-1">{errors.supplier_id.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">预计到货日期</label>
            <input type="date" {...register('expected_date')} className="w-full border border-gray-300 focus:border-teal-500 rounded-lg px-3 py-2 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">操作员</label>
            <Controller
              name="operator"
              control={control}
              render={({ field }) => (
                <OperatorSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-2">
            <label className="block text-sm font-medium">采购明细</label>
            {errors.items?.root && <p className="text-red-500 text-xs">{errors.items.root.message}</p>}
          </div>
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
            {fields.map((fieldItem, index) => {
              const currentProductId = currentItems?.[index]?.product_id;
              const currentQty = currentItems?.[index]?.quantity || 0;
              const currentTotal = currentItems?.[index]?.total_amount || 0;
              
              const productInfo = allProducts.find(p => String(p.id) === String(currentProductId));
              const unit = productInfo?.unit || '公斤';
              const unitPrice = currentQty > 0 ? (currentTotal / currentQty) : 0;

              return (
                <div key={fieldItem.id} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm relative group hover:border-teal-200 transition-colors">
                  <div className="w-full lg:flex-[2]">
                    <Controller
                      name={`items.${index}.product_id`}
                      control={control}
                      render={({ field }) => (
                        <SearchSelect 
                          {...field}
                          options={availableProducts.map(p => ({ id: p.id, name: p.name, code: p.code }))}
                          placeholder="搜索选取产品"
                        />
                      )}
                    />
                    {errors.items?.[index]?.product_id && <p className="text-red-500 text-xs mt-1 px-1 absolute">{errors.items[index].product_id.message}</p>}
                  </div>

                  <div className="w-[30%] lg:w-28 relative">
                    <input type="number" step="0.001" {...register(`items.${index}.quantity`)} placeholder="数量" 
                      className={`w-full border ${errors.items?.[index]?.quantity ? 'border-red-300' : 'border-gray-300'} focus:border-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none`} />
                    <span className="absolute right-2.5 top-1.5 text-gray-400 text-xs pointer-events-none">{unit}</span>
                  </div>

                  <div className="w-[30%] lg:w-32 relative">
                    <input type="number" step="0.01" {...register(`items.${index}.total_amount`)} placeholder="总额(¥)" 
                      className="w-full border border-gray-300 focus:border-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none pl-6" />
                    <span className="absolute left-2.5 top-1.5 text-gray-500 text-sm font-medium pointer-events-none">¥</span>
                  </div>

                  <div className="w-[30%] lg:w-24 text-right">
                    <div className="text-[10px] text-gray-400">折算单价</div>
                    <div className="font-mono text-sm text-gray-600">¥{formatAmount(unitPrice)}</div>
                  </div>

                  <div className="w-full lg:w-auto flex justify-end">
                    <button type="button" onClick={() => remove(index)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="移除明细">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              );
            })}

            <button type="button" onClick={() => append({ product_id: '', quantity: 1, total_amount: '' })} 
              className="w-full py-2.5 bg-white border-2 border-dashed border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all font-medium flex items-center justify-center gap-2 text-sm mt-2">
              <i className="fas fa-plus-circle"></i> 添加明细
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">预估合计</label>
          <div className="text-2xl font-bold font-mono text-teal-800 bg-teal-50/50 p-3 rounded-lg border border-teal-100/50">
            ¥{formatAmount((currentItems || []).reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea {...register('remark')} className="w-full border border-gray-300 focus:border-teal-500 rounded-lg px-3 py-2 outline-none" rows="2"></textarea>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">取消</button>
          <button type="submit" className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-bold shadow-sm">保存单据</button>
        </div>
      </form>
    </Modal>
  );
};

export default PurchaseFormModal;
