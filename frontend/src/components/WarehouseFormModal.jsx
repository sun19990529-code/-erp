import React, { useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import Modal from './Modal';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import OperatorSelect from './OperatorSelect';
import SearchSelect from './SearchSelect';
import { formatAmount, formatQuantity } from '../utils/format';

const warehouseSchema = z.object({
  warehouse_id: z.coerce.number().min(1, '请选择仓库'),
  supplier_id: z.coerce.number().optional().or(z.literal('')),
  operator: z.string().optional(),
  remark: z.string().optional(),
  items: z.array(z.object({
    id: z.number().optional(),
    product_id: z.coerce.number({ invalid_type_error: ' ' }).min(1, '请选择产品'),
    supplier_batch_no: z.string().optional(),
    heat_no: z.string().optional(),
    input_quantity: z.coerce.number({ invalid_type_error: '输入数量必填' }).min(0.001, '数量需大于0'),
    quantity: z.coerce.number().optional(), // 内部折算的实际公斤数
    input_unit: z.string().optional(),
    total_amount: z.coerce.number().optional() // 只有 inbound 需要
  })).min(1, '请至少添加一条明细')
});

// 单位转换函数
const convertToKg = (quantity, unit, product) => {
  if (unit === '吨') return quantity * 1000;
  if (unit === '支') {
    if (product && product.outer_diameter && product.wall_thickness && product.length) {
      const outerDiameter = parseFloat(product.outer_diameter) || 0;
      const wallThickness = parseFloat(product.wall_thickness) || 0;
      const lengthInMeters = (parseFloat(product.length) || 0) / 1000;
      const kgPerPiece = ((outerDiameter - wallThickness) * wallThickness) * 0.02491 * lengthInMeters;
      return quantity * kgPerPiece;
    }
    return 0;
  }
  return quantity;
};

const WarehouseFormModal = forwardRef(({ 
  isOpen, 
  onClose, 
  mode, 
  initialData, 
  orderType, 
  activeProductType, 
  warehouses, 
  suppliers, 
  allProducts,
  onSubmitSuccess 
}, ref) => {
  const isEdit = mode === 'edit';
  const isInbound = orderType === 'inbound';
  const title = isEdit ? `编辑${isInbound ? '入库' : '出库'}单` : `新增${isInbound ? '入库' : '出库'}单`;

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      warehouse_id: '',
      supplier_id: '',
      operator: '',
      remark: '',
      items: [{ product_id: '', input_quantity: 1, supplier_batch_no: '', heat_no: '', input_unit: '公斤', total_amount: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  useImperativeHandle(ref, () => ({
    appendRow: (newItem) => {
      const currentItems = control._formValues.items || [];
      // 智能替换第一天空行
      if (currentItems.length === 1 && !currentItems[0].product_id) {
         remove(0);
         append(newItem);
      } else {
         append(newItem);
      }
    }
  }));

  const selectedSupplierId = useWatch({ control, name: 'supplier_id' });
  const currentItems = useWatch({ control, name: 'items' });

  // 根据物料大类与供应商过滤
  const availableProducts = useMemo(() => {
    let list = allProducts;
    if ((activeProductType === 'raw' || activeProductType === 'semi') && selectedSupplierId) {
      list = list.filter(p => (p.suppliers || []).some(s => String(s.supplier_id) === String(selectedSupplierId)));
    }
    return list;
  }, [allProducts, activeProductType, selectedSupplierId]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          warehouse_id: initialData.warehouse_id || '',
          supplier_id: initialData.supplier_id || '',
          operator: initialData.operator || '',
          remark: initialData.remark || '',
          items: initialData.items && initialData.items.length > 0
            ? initialData.items.map(it => ({
                id: it.id,
                product_id: it.product_id,
                supplier_batch_no: it.supplier_batch_no || '',
                heat_no: it.heat_no || '',
                input_quantity: it.input_quantity || it.quantity || 1,
                quantity: it.quantity,
                input_unit: it.input_unit || '公斤',
                total_amount: it.total_amount || (it.unit_price && it.quantity ? parseFloat((it.unit_price * it.quantity).toFixed(2)) : '')
              }))
            : [{ product_id: '', input_quantity: 1, supplier_batch_no: '', heat_no: '', input_unit: '公斤', total_amount: '' }]
        });
      } else {
        reset({
          warehouse_id: '',
          supplier_id: '',
          operator: '',
          remark: '',
          items: [{ product_id: '', input_quantity: 1, supplier_batch_no: '', heat_no: '', input_unit: '公斤', total_amount: '' }]
        });
      }
    }
  }, [isOpen, initialData, reset]);

  // 当操作修改 product_id 或 input_quantity，计算真实的 quantity 和单支理重
  const onProductOrQtyChange = (index, fieldName, value) => {
    const item = { ...control._formValues.items[index], [fieldName]: value };
    const product = allProducts.find(p => String(p.id) === String(item.product_id));
    
    const unit = item.input_unit || product?.unit || '公斤';
    // 设置单位
    if (fieldName === 'product_id' && product) {
        setValue(`items.${index}.input_unit`, product.unit || '公斤');
    }
    
    // 计算 kg
    const kg = convertToKg(item.input_quantity || 0, unit, product);
    setValue(`items.${index}.quantity`, kg);
  };

  const onFormSubmit = (data) => {
    // 处理最终的项
    const finalItems = data.items.map(it => {
      const product = allProducts.find(p => String(p.id) === String(it.product_id));
      const kg = convertToKg(it.input_quantity, it.input_unit, product);
      return {
        ...it,
        quantity: kg,
        unit_price: (isInbound && it.total_amount && kg) ? parseFloat((it.total_amount / kg).toFixed(4)) : (it.unit_price || 0)
      };
    });

    const finalData = { ...data, items: finalItems };
    onSubmitSuccess(finalData);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="max-w-4xl">
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">仓库 *</label>
            <Controller
              name="warehouse_id"
              control={control}
              render={({ field }) => (
                <SearchSelect {...field} options={warehouses.map(w => ({ id: w.id, name: w.name }))} placeholder="选择仓库" />
              )}
            />
            {errors.warehouse_id && <p className="text-red-500 text-xs mt-1">{errors.warehouse_id.message}</p>}
          </div>
          
          {isInbound && (
            <div>
              <label className="block text-sm font-medium mb-1">供应商</label>
              <Controller
                name="supplier_id"
                control={control}
                render={({ field }) => (
                  <SearchSelect {...field} options={suppliers.map(s => ({ id: s.id, name: s.name }))} placeholder="无" />
                )}
              />
            </div>
          )}

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
            <label className="block text-sm font-medium">明细</label>
            {errors.items?.root && <p className="text-red-500 text-xs">{errors.items.root.message}</p>}
          </div>
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
            {fields.map((fieldItem, index) => {
              const currentProductId = currentItems?.[index]?.product_id;
              const currentInputQty = currentItems?.[index]?.input_quantity || 0;
              const currentUnit = currentItems?.[index]?.input_unit || '公斤';

              const productInfo = allProducts.find(p => String(p.id) === String(currentProductId));
              const kgQuantity = currentItems?.[index]?.quantity || convertToKg(currentInputQty, currentUnit, productInfo);
              
              let kgPerPiece = null;
              if (currentUnit === '支' && productInfo?.outer_diameter && productInfo?.wall_thickness && productInfo?.length) {
                const lenInMeters = parseFloat(productInfo.length) / 1000;
                kgPerPiece = ((parseFloat(productInfo.outer_diameter) - parseFloat(productInfo.wall_thickness)) * parseFloat(productInfo.wall_thickness) * 0.02491 * lenInMeters).toFixed(4);
              }

              return (
                <div key={fieldItem.id} style={{ zIndex: 50 - index }} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm relative group hover:border-teal-300 transition-colors">
                  <div className="w-full lg:flex-1">
                    <Controller
                      name={`items.${index}.product_id`}
                      control={control}
                      render={({ field }) => (
                        <SearchSelect 
                          value={field.value} 
                          onChange={(val) => { 
                            field.onChange(val); 
                            onProductOrQtyChange(index, 'product_id', val); 
                          }}
                          options={availableProducts.map(p => ({ id: p.id, name: p.name, code: p.code }))}
                          placeholder="搜索选择产品"
                        />
                      )}
                    />
                    {errors.items?.[index]?.product_id && <p className="text-red-500 text-xs mt-1 absolute px-1">{errors.items[index].product_id.message}</p>}
                  </div>

                  <div className="w-[30%] lg:w-28 relative">
                    <input type="text" {...register(`items.${index}.supplier_batch_no`)} placeholder="供应商批号" 
                      className="w-full border border-gray-300 focus:border-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none" />
                  </div>

                  <div className="w-[20%] lg:w-24 relative">
                    <input type="text" {...register(`items.${index}.heat_no`)} placeholder="炉号" 
                      className="w-full border border-gray-300 focus:border-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none" />
                  </div>

                  <div className="w-[25%] lg:w-24 relative">
                    <input type="number" step="0.001" {...register(`items.${index}.input_quantity`, {
                      onChange: (e) => onProductOrQtyChange(index, 'input_quantity', parseFloat(e.target.value))
                    })} placeholder="数量" 
                      className={`w-full border ${errors.items?.[index]?.input_quantity ? 'border-red-300' : 'border-gray-300'} focus:border-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none`} />
                  </div>

                  {isInbound && (
                     <div className="w-[20%] lg:w-24 relative">
                       <input type="number" step="0.01" {...register(`items.${index}.total_amount`)} placeholder="总额(¥)" 
                         className="w-full border border-gray-300 focus:border-teal-500 rounded-md px-2.5 py-1.5 pl-6 text-sm outline-none" />
                       <span className="absolute left-2.5 top-1.5 text-gray-500 font-medium pointer-events-none">¥</span>
                     </div>
                  )}

                  <div className="w-[45%] lg:w-auto flex flex-col items-start lg:items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-1 bg-gray-50 border border-gray-200 text-gray-700 rounded text-xs font-medium">{currentUnit}</span>
                      {currentUnit === '支' && kgPerPiece && (
                         <span className="text-[11px] text-teal-600 font-medium bg-teal-50 px-1.5 py-0.5 rounded">({kgPerPiece}kg/支)</span>
                      )}
                    </div>
                    {currentUnit !== '公斤' && (
                       <span className="text-sm font-bold text-teal-700 mt-0.5 whitespace-nowrap">= {formatQuantity(kgQuantity, 2)} kg</span>
                    )}
                    {currentUnit === '公斤' && <span className="text-sm font-bold text-teal-700 mt-0.5 whitespace-nowrap lg:hidden">= {formatQuantity(kgQuantity, 2)} kg</span>}
                  </div>

                  <div className="w-full lg:w-10 flex items-center justify-end border-t lg:border-t-0 lg:border-l border-gray-200 mt-2 pt-2 lg:mt-0 lg:pt-0">
                    <button type="button" onClick={() => remove(index)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="移除明细">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              );
            })}

            <button type="button" onClick={() => append({ product_id: '', input_quantity: 1, input_unit: '公斤', supplier_batch_no: '', heat_no: '', total_amount: '' })} 
              className="w-full py-2.5 bg-white border-2 border-dashed border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all font-medium flex items-center justify-center gap-2 text-sm mt-2">
              <i className="fas fa-plus-circle"></i> 添加明细
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">备注</label>
          <textarea {...register('remark')} className="w-full border border-gray-300 focus:border-teal-500 rounded-lg px-3 py-2 outline-none" rows="2"></textarea>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">取消</button>
          <button type="submit" className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-bold shadow-sm">
            提交{isInbound ? '入库' : '出库'}单
          </button>
        </div>
      </form>
    </Modal>
  );
});

export default WarehouseFormModal;
