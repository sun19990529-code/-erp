const { z } = require('zod');

const processReportSchema = z.object({
  process_id: z.coerce.number().int().positive({ message: "工序ID无效" }),
  operator: z.string().optional().nullable(),
  input_quantity: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().nonnegative({ message: "投入量不能为负" }).optional()),
  output_quantity: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().nonnegative({ message: "产出量不能为负" }).optional()),
  defect_quantity: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().nonnegative({ message: "不良数量不能为负" }).optional()),
  remark: z.string().optional().nullable(),
  outsourcing_id: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().optional()),
  force: z.coerce.boolean().optional()
});

const productionStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'quality_hold', 'cancelled'], {
    errorMap: () => ({ message: "非法状态值" })
  })
});

const createProductionSchema = z.object({
  product_id: z.coerce.number().int().positive({ message: "必须提供有效的产品ID" }),
  quantity: z.coerce.number().positive({ message: "生产数量必须大于0" }),
  order_id: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().int().optional()),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable()
});

const updateProductionSchema = z.object({
  product_id: z.coerce.number().int().positive({ message: "必须提供有效的产品ID" }),
  quantity: z.coerce.number().positive({ message: "生产数量必须大于0" }),
  order_id: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().int().optional()),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable()
});

const reworkSchema = z.object({
  target_process_id: z.coerce.number().int().positive({ message: "请选择返工回退到的目标工序" }),
  quantity: z.preprocess(val => (val === '' || val == null ? undefined : Number(val)), z.number().positive().optional()),
  reason: z.string().min(1, { message: "请填写返工原因" }),
  operator: z.string().optional().nullable()
});

const scrapValueSchema = z.object({
  scrap_value: z.coerce.number().nonnegative({ message: "残值金额不能为负数" })
});

module.exports = {
  processReportSchema,
  productionStatusSchema,
  createProductionSchema,
  updateProductionSchema,
  reworkSchema,
  scrapValueSchema
};
