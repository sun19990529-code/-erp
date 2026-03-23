import React from 'react';

/**
 * 检验数量表单域（通用子组件）
 * 用于入库检验、委外检验、成品检验等模块中，
 * 抽离「检验数量 / 合格数量 / 不合格数量 / 检验结果 / 检验员」的重复布局。
 *
 * @param {string}  quantityLabel   数量标签附加文字,如"(入库: 100公斤)"
 * @param {number}  defaultQuantity 默认检验数量
 * @param {string}  resultHint      合格选项显示文字,如"合格（自动入库）"
 * @param {string}  infoText        底部蓝色提示文字
 */
const InspectionFormFields = ({ quantityLabel, defaultQuantity, resultHint = '合格（自动入库）', infoText }) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          检验数量 * {quantityLabel && <span className="text-gray-400">{quantityLabel}</span>}
        </label>
        <input name="quantity" type="number" className="w-full border rounded-lg px-3 py-2" defaultValue={defaultQuantity || ''} required />
      </div>
      <div><label className="block text-sm font-medium mb-1">合格数量</label><input name="pass_quantity" type="number" className="w-full border rounded-lg px-3 py-2" /></div>
      <div><label className="block text-sm font-medium mb-1">不合格数量</label><input name="fail_quantity" type="number" className="w-full border rounded-lg px-3 py-2" /></div>
      <div><label className="block text-sm font-medium mb-1">检验结果 *</label>
        <select name="result" className="w-full border rounded-lg px-3 py-2" required>
          <option value="pass">{resultHint}</option>
          <option value="fail">不合格</option>
        </select>
      </div>
      <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1">检验员</label><input name="inspector" className="w-full border rounded-lg px-3 py-2" /></div>
    </div>
    {infoText && (
      <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
        <i className="fas fa-info-circle mr-2"></i>{infoText}
      </div>
    )}
    <div><label className="block text-sm font-medium mb-1">备注</label><textarea name="remark" className="w-full border rounded-lg px-3 py-2" rows="2"></textarea></div>
  </>
);

export default InspectionFormFields;
