import React, { useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import Modal from './Modal';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../api';
import OperatorSelect from './OperatorSelect';
import { formatQuantity } from '../utils/format';
import { convertToKg, convertFromKg } from '../utils/unitConvert';

const itemSchema = z.object({
  material_id: z.string().or(z.number()).transform(String).refine(v => v !== '', '请选择物料'),
  input_quantity: z.number().min(0.001, '数量需>0'),
  input_unit: z.string().min(1, '单位不能为空'),
  quantity: z.number().optional(), // 动态换算的公斤数
  required_quantity: z.number().optional(),
  picked_quantity: z.number().optional(),
});

const pickSchema = z.object({
  warehouse_id: z.string().or(z.number()).transform(String).refine(val => val !== '', '必须选择仓库'),
  operator: z.string().optional(),
  order_id: z.string().or(z.number()).optional(),
  production_order_id: z.string().or(z.number()).optional(),
  pick_type: z.enum(['normal', 'replenish']).optional(),
  type: z.enum(['pick', 'return']).default('pick'),
  remark: z.string().optional(),
  items: z.array(itemSchema).min(1, '至少需要一条明细')
});

const PickFormModal = forwardRef(({
  isOpen, onClose, mode = 'create', pickType = 'pick',
  initialData, onSuccess,
  warehouses = [], materials = [], semiProducts = [], productionOrders = [],
  boundMaterialIds = null
}, ref) => {

  const allMaterials = useMemo(() => [...materials, ...semiProducts], [materials, semiProducts]);
  const materialMap = useMemo(() => {
    const map = new Map();
    allMaterials.forEach(m => map.set(String(m.id), m));
    return map;
  }, [allMaterials]);

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(pickSchema),
    defaultValues: { type: 'pick', pick_type: 'normal', items: [] }
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        reset({
          ...initialData,
          warehouse_id: String(initialData.warehouse_id || ''),
          production_order_id: initialData.production_order_id ? String(initialData.production_order_id) : '',
          order_id: initialData.order_id ? String(initialData.order_id) : '',
          items: (initialData.items || []).map(it => ({
            ...it,
            material_id: String(it.material_id),
            input_quantity: parseFloat(it.input_quantity || it.quantity || 1),
            input_unit: it.input_unit || '公斤'
          }))
        });
      } else {
        reset({ warehouse_id: '', type: pickType, pick_type: 'normal', items: [{ material_id: '', input_quantity: 1, input_unit: '公斤' }] });
      }
    }
  }, [isOpen, initialData, pickType, reset]);

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  
  // 外部注入扫码钩子接口 (PDA 支持)
  useImperativeHandle(ref, () => ({
    appendRow: (scannedItem) => {
      const material = allMaterials.find(m => String(m.id) === String(scannedItem.id) || m.code === scannedItem.code);
      if (material) {
        append({
          material_id: String(material.id),
          input_quantity: 1,
          input_unit: material.unit || '公斤',
        });
        return material;
      }
      return null;
    }
  }));

  const watchItems = watch("items");

  const onSubmit = async (data) => {
    // 补齐最终的公斤数 items[].quantity
    for (const it of data.items) {
      const mat = materialMap.get(String(it.material_id));
      it.quantity = convertToKg(it.input_quantity, it.input_unit, mat);
      
      if (!it.quantity || it.quantity <= 0) {
        window.__toast?.warning('计算得到的公斤数必须大于0');
        return;
      }
    }

    if (data.type !== 'return') {
      try {
        const invRes = await api.get(`/inventory?warehouse_type=raw`);
        if (invRes.success) {
          const inventory = invRes.data.filter(i => String(i.warehouse_id) === String(data.warehouse_id));
          if (inventory.length === 0) {
            window.__toast?.warning('该仓库暂无库存记录，请检查仓库选择');
            return;
          }
          for (const it of data.items) {
            const mat = materialMap.get(String(it.material_id));
            const inv = inventory.find(i => String(i.product_id) === String(it.material_id));
            if (!inv) {
              window.__toast?.warning(`${mat?.name || '未知物料'} 在该仓库无库存`);
              return;
            }
            if (Number(inv.quantity) < Number(it.quantity)) {
              window.__toast?.warning(`${mat?.name} 库存不足!\n当前: ${inv.quantity} 公斤\n领料: ${it.quantity} 公斤`);
              return;
            }
          }
        }
      } catch (err) {
        console.error('库存校验失败', err);
      }
    }

    const reqData = { ...data, production_order_id: data.production_order_id || null, order_id: data.order_id || null };
    const res = mode === 'edit'
      ? await api.put(`/pick/${initialData.id}`, reqData, { invalidate: ['inventory'] })
      : await api.post('/pick', reqData, { invalidate: ['inventory'] });

    if (res.success) {
      if (res.over_issue_warning) window.__toast?.warning('当前用料较多，已记录放行并通知相关人员！');
      else window.__toast?.success('保存成功');
      onSuccess();
    } else {
      window.__toast?.error(res.message);
    }
  };

  const filteredRaw = useMemo(() => boundMaterialIds ? materials.filter(m => boundMaterialIds.includes(m.id)) : materials, [boundMaterialIds, materials]);
  const filteredSemi = useMemo(() => boundMaterialIds ? semiProducts.filter(m => boundMaterialIds.includes(m.id)) : semiProducts, [boundMaterialIds, semiProducts]);

  const fmtProduct = (p) => {
    const prefix = p.suppliers?.length ? `[${p.suppliers.map(s => s.supplier_name).join('/')}] ` : '';
    return `${prefix}${p.name} (${p.code})`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'create' ? (pickType === 'return' ? '新建退料单' : '新建领料单') : (pickType === 'return' ? '编辑退料单' : '编辑领料单')} size="max-w-4xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        
        {initialData?.order_no && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
            <i className="fas fa-link mr-2"></i> 关联订单：<strong>{initialData.order_no}</strong>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">{pickType === 'return' ? '退入仓库' : '领料仓库'} <span className="text-red-500">*</span></label>
            <select {...register("warehouse_id")} className="w-full border rounded-lg px-3 py-2">
              <option value="">请选择仓库</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {errors.warehouse_id && <p className="text-red-500 text-xs mt-1">{errors.warehouse_id.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{pickType === 'return' ? '退料人' : '领料人'}</label>
            <Controller name="operator" control={control} render={({ field }) => (
              <OperatorSelect value={field.value} onChange={field.onChange} />
            )} />
          </div>

          {pickType !== 'return' && (
            <div className="col-span-2 flex items-center mb-2">
              <label className="block text-sm font-medium mr-4">领料类型 <span className="text-red-500">*</span></label>
              <label className="mr-4 inline-flex items-center cursor-pointer">
                <input type="radio" value="normal" {...register("pick_type")} className="mr-1 text-teal-600 focus:ring-teal-500" />
                正常领料
              </label>
              <label className="inline-flex items-center cursor-pointer group">
                <input type="radio" value="replenish" {...register("pick_type")} className="mr-1 text-teal-600 focus:ring-teal-500" />
                追加补料
                <span className="text-xs text-orange-500 ml-1 opacity-80 group-hover:opacity-100 transition-opacity">(防呆额度放行)</span>
              </label>
            </div>
          )}

          {pickType !== 'return' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                <i className="fas fa-industry mr-1 text-indigo-500"></i>关联生产工单
                <span className="text-xs text-gray-400 font-normal ml-2">选择后自动过滤该产品可用物料</span>
              </label>
              <select {...register("production_order_id")} className="w-full border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500">
                <option value="">不关联 / 手动选择</option>
                {productionOrders.map(po => (
                  <option key={po.id} value={po.id}>{po.order_no} — {po.product_name} ({po.quantity} {po.unit || '件'})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">{pickType === 'return' ? '退料明细' : '领料明细'}</label>
            {errors.items && <span className="text-xs text-red-500 font-medium">{errors.items.root?.message || '明细项存在验证错误'}</span>}
          </div>
          
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            {fields.map((field, index) => {
              const currentMatId = watchItems[index]?.material_id;
              const inputQty = parseFloat(watchItems[index]?.input_quantity || 0);
              const mat = materialMap.get(String(currentMatId));
              const mUnit = mat?.unit || '公斤';
              const kgVal = convertToKg(inputQty, mUnit, mat);
              const pcsVal = (mUnit === '公斤') ? convertFromKg(inputQty, '支', mat) : 0;
              const rq = watchItems[index]?.required_quantity;
              const pq = watchItems[index]?.picked_quantity || 0;

              return (
                <div key={field.id} className="flex flex-wrap lg:flex-nowrap gap-3 items-center bg-white p-3 rounded-lg border border-gray-200 mb-2 shadow-sm relative group hover:border-teal-300 transition-colors">
                  
                  <div className="w-full lg:flex-1 min-w-[200px]">
                    <select {...register(`items.${index}.material_id`)} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none" onChange={(e) => {
                      setValue(`items.${index}.material_id`, e.target.value);
                      const selMat = materialMap.get(e.target.value);
                      if (selMat) setValue(`items.${index}.input_unit`, selMat.unit || '公斤');
                    }}>
                      <option value="">请选择物料</option>
                      {filteredRaw.length > 0 && <optgroup label="原材料">{filteredRaw.map(m => <option key={m.id} value={m.id}>{fmtProduct(m)}</option>)}</optgroup>}
                      {filteredSemi.length > 0 && <optgroup label="半成品">{filteredSemi.map(m => <option key={m.id} value={m.id}>{fmtProduct(m)}</option>)}</optgroup>}
                    </select>
                    {errors.items?.[index]?.material_id && <p className="text-red-500 text-xs mt-1">{errors.items[index].material_id.message}</p>}
                  </div>

                  <div className="w-[30%] lg:w-32">
                    <input type="number" step="0.001" {...register(`items.${index}.input_quantity`, { valueAsNumber: true })} className="w-full border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-md px-2.5 py-1.5 text-sm outline-none" placeholder="数量" />
                    {errors.items?.[index]?.input_quantity && <p className="text-red-500 text-xs mt-1">{errors.items[index].input_quantity.message}</p>}
                  </div>

                  <div className="w-[30%] lg:w-auto flex flex-col lg:flex-row items-start lg:items-center gap-2">
                    <input type="hidden" {...register(`items.${index}.input_unit`)} />
                    <span className="px-2 py-1 bg-gray-100 border border-gray-200 text-gray-700 rounded-md text-xs font-medium shadow-sm">{mUnit}</span>
                    {mUnit !== '公斤' && <span className="text-sm font-bold text-teal-700 whitespace-nowrap mt-1 lg:mt-0">= {formatQuantity(kgVal)} Kg</span>}
                    {mUnit === '公斤' && pcsVal > 0 && <span className="text-sm font-bold text-blue-700 whitespace-nowrap mt-1 lg:mt-0">≈ {Math.round(pcsVal)} 支</span>}
                  </div>

                  <div className="w-full lg:w-32 flex items-center justify-between border-t lg:border-t-0 lg:border-l border-gray-200 pt-2 lg:pt-0 lg:pl-3 mt-1 lg:mt-0">
                    <div className="flex-1 flex flex-col justify-center text-xs space-y-1">
                      {rq ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">理论: {rq}</span>
                            <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">剩余: {formatQuantity(Math.max(0, rq - pq))}</span>
                          </div>
                        </>
                      ) : <span className="text-gray-400 italic">额外领用</span>}
                    </div>
                    <button type="button" onClick={() => remove(index)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors ml-2"><i className="fas fa-trash-alt"></i></button>
                  </div>

                </div>
              );
            })}
            <button type="button" onClick={() => append({ material_id: '', input_quantity: 1, input_unit: '公斤' })} className="w-full py-2.5 border-2 border-dashed border-teal-200 text-teal-600 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-all font-medium flex items-center justify-center gap-2 text-sm mt-2"><i className="fas fa-plus-circle"></i> 继续添加明细</button>
          </div>
        </div>

        <div><label className="block text-sm font-medium mb-1">备注</label><textarea {...register("remark")} className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
          <button type="submit" className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">提交</button>
        </div>
      </form>
    </Modal>
  );
});

export default PickFormModal;
