/**
 * 路由输入 Schema 定义
 * 使用 Zod 对关键路由的请求体进行类型和业务规则校验
 */
const { z } = require('zod');

// 必填正整数（自动 string→number 转换）
const requiredPositiveInt = (msg) => z.coerce.number({ message: msg }).int().positive();
// 必填正数（含小数，自动转换）
const requiredPositive = (msg) => z.coerce.number({ message: msg }).positive();
// 可选非负数（自动转换，默认 0）
const optionalNonNeg = z.coerce.number().min(0).optional().default(0);
// 可空正整数：null/空值直接通过，非空值转 number 后校验
const optionalPositiveInt = z.preprocess(
  (val) => (val === null || val === undefined || val === '') ? null : Number(val),
  z.number().int().positive().nullable()
).optional();

// ==================== 订单 ====================
const orderCreate = z.object({
  customer_id: optionalPositiveInt,
  customer_name: z.string({ message: '客户名称不能为空' }).min(1, '客户名称不能为空'),
  customer_phone: z.string().optional().nullable(),
  customer_address: z.string().optional().nullable(),
  delivery_date: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: requiredPositiveInt('请选择产品'),
    quantity: requiredPositive('数量必须大于0'),
    unit_price: optionalNonNeg,
    remark: z.string().optional().nullable(),
  })).min(1, '请至少添加一个产品'),
});

// ==================== 采购 ====================
const purchaseCreate = z.object({
  supplier_id: requiredPositiveInt('请选择供应商'),
  expected_date: z.string().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: requiredPositiveInt('请选择产品'),
    quantity: requiredPositive('数量必须大于0'),
    unit_price: optionalNonNeg,
  })).min(1, '请至少选择一个产品'),
});

// ==================== 生产工单 ====================
const productionCreate = z.object({
  product_id: requiredPositiveInt('请选择产品'),
  quantity: requiredPositive('数量必须大于0'),
  order_id: optionalPositiveInt,
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

// ==================== 入库 ====================
const inboundCreate = z.object({
  type: z.enum(['raw', 'semi', 'finished'], { message: '入库类型不合法' }),
  warehouse_id: requiredPositiveInt('请选择仓库'),
  supplier_id: optionalPositiveInt,
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: requiredPositiveInt('请选择产品'),
    quantity: requiredPositive('数量必须大于0'),
    batch_no: z.string().optional().nullable(),
    unit_price: optionalNonNeg,
  })).min(1, '请至少添加一个产品'),
});

// ==================== 出库 ====================
const outboundCreate = z.object({
  type: z.enum(['finished', 'raw', 'transfer'], { message: '出库类型不合法' }),
  warehouse_id: requiredPositiveInt('请选择仓库'),
  order_id: optionalPositiveInt,
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: requiredPositiveInt('请选择产品'),
    quantity: requiredPositive('数量必须大于0'),
    batch_no: z.string().optional().nullable(),
    unit_price: optionalNonNeg,
  })).min(1, '请至少添加一个产品'),
});

// ==================== 委外 ====================
const outsourcingCreate = z.object({
  supplier_id: requiredPositiveInt('请选择供应商'),
  production_order_id: optionalPositiveInt,
  process_id: optionalPositiveInt,
  expected_date: z.string().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: requiredPositiveInt('请选择产品'),
    quantity: requiredPositive('数量必须大于0'),
    unit_price: optionalNonNeg,
  })).min(1, '请至少添加一个产品'),
});

// ==================== 用户登录 ====================
const userLogin = z.object({
  username: z.string({ message: '请输入用户名' }).min(1, '用户名不能为空'),
  password: z.string({ message: '请输入密码' }).min(1, '密码不能为空'),
});


// ==================== 用户创建 ====================
const userCreate = z.object({
  username: z.string({ message: '请输入用户名' }).min(2, '用户名至少2个字符'),
  password: z.string({ message: '请输入密码' }).min(4, '密码至少4个字符'),
  real_name: z.string().optional().nullable(),
  user_type: z.enum(['internal', 'supplier', 'customer']).optional().default('internal'),
  department_id: optionalPositiveInt,
  role_id: optionalPositiveInt,
  supplier_id: optionalPositiveInt,
  customer_id: optionalPositiveInt,
  status: z.coerce.number().int().min(0).max(1).optional().default(1),
});

module.exports = {
  orderCreate,
  purchaseCreate,
  productionCreate,
  inboundCreate,
  outboundCreate,
  outsourcingCreate,
  userLogin,
  userCreate,
};
