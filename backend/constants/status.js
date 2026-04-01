/**
 * 实体状态常量枚举
 * 用于 users/suppliers/customers/products/processes/warehouses/workstations 等基础表
 * 这些表的 status 字段是 INTEGER 类型（1=启用, 0=禁用）
 * 
 * 注意：orders/production_orders/purchase_orders 等业务表的 status 是 TEXT 类型，
 * 使用字符串值（如 'pending', 'completed'），不需要使用此常量。
 */
const ENTITY_STATUS = {
  ACTIVE: 1,
  DISABLED: 0,
};

module.exports = { ENTITY_STATUS };
