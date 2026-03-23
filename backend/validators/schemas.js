/**
 * 路由输入 Schema 定义
 * 使用 Zod 对关键路由的请求体进行类型和业务规则校验
 */
const { z } = require('zod');

// ==================== 订单 ====================
const orderCreate = z.object({
  customer_id: z.number({ message: '请选择客户' }).int().positive().optional().nullable(),
  customer_name: z.string({ message: '客户名称不能为空' }).min(1, '客户名称不能为空'),
  customer_phone: z.string().optional().nullable(),
  customer_address: z.string().optional().nullable(),
  delivery_date: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.number({ message: '请选择产品' }).int().positive(),
    quantity: z.number({ message: '数量必须大于0' }).positive(),
    unit_price: z.number().min(0).optional().default(0),
    remark: z.string().optional().nullable(),
  })).min(1, '请至少添加一个产品'),
});

// ==================== 采购 ====================
const purchaseCreate = z.object({
  supplier_id: z.number({ message: '请选择供应商' }).int().positive(),
  expected_date: z.string().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.number({ message: '请选择产品' }).int().positive(),
    quantity: z.number({ message: '数量必须大于0' }).positive(),
    unit_price: z.number().min(0).optional().default(0),
  })).min(1, '请至少选择一个产品'),
});

// ==================== 生产工单 ====================
const productionCreate = z.object({
  product_id: z.number({ message: '请选择产品' }).int().positive(),
  quantity: z.number({ message: '数量必须大于0' }).positive(),
  order_id: z.number().int().positive().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

// ==================== 入库 ====================
const inboundCreate = z.object({
  type: z.enum(['raw', 'semi', 'finished'], { message: '入库类型不合法' }),
  warehouse_id: z.number({ message: '请选择仓库' }).int().positive(),
  supplier_id: z.number().int().positive().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.number({ message: '请选择产品' }).int().positive(),
    quantity: z.number({ message: '数量必须大于0' }).positive(),
    batch_no: z.string().optional().nullable(),
    unit_price: z.number().min(0).optional().default(0),
  })).min(1, '请至少添加一个产品'),
});

// ==================== 出库 ====================
const outboundCreate = z.object({
  type: z.enum(['finished', 'raw', 'transfer'], { message: '出库类型不合法' }),
  warehouse_id: z.number({ message: '请选择仓库' }).int().positive(),
  order_id: z.number().int().positive().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.number({ message: '请选择产品' }).int().positive(),
    quantity: z.number({ message: '数量必须大于0' }).positive(),
    batch_no: z.string().optional().nullable(),
    unit_price: z.number().min(0).optional().default(0),
  })).min(1, '请至少添加一个产品'),
});

// ==================== 委外 ====================
const outsourcingCreate = z.object({
  supplier_id: z.number({ message: '请选择供应商' }).int().positive(),
  production_order_id: z.number().int().positive().optional().nullable(),
  process_id: z.number().int().positive().optional().nullable(),
  expected_date: z.string().optional().nullable(),
  operator: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  items: z.array(z.object({
    product_id: z.number({ message: '请选择产品' }).int().positive(),
    quantity: z.number({ message: '数量必须大于0' }).positive(),
    unit_price: z.number().min(0).optional().default(0),
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
  department_id: z.number().int().positive().optional().nullable(),
  role_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  customer_id: z.number().int().positive().optional().nullable(),
  status: z.number().int().min(0).max(1).optional().default(1),
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
