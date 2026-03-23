/**
 * fix_role_permissions.js
 * 为各业务角色分配合理的权限组
 * 
 * 职责说明：
 * - admin（系统管理员）：所有权限（已有，跳过）
 * - production_manager（生产主管）：生产+仓库查看+委外+质检查看+订单查看
 * - inspector（质检员）：质检增删改查+生产查看+订单查看
 * - warehouse_manager（仓库管理员）：仓库增删改查+订单查看+采购查看
 * - purchaser（采购员）：采购增删改查+仓库查看+基础数据查看
 * - salesman（销售员）：订单增删改查+仓库查看+基础数据查看
 * - supplier_user（供应商用户）：采购查看+仓库查看（只读，外部用户）
 * - customer_user（客户用户）：订单查看（只读，外部用户）
 */
const Database = require('better-sqlite3');
const db = new Database('mes.db');

// 读取所有权限 code -> id 映射
const permMap = {};
db.prepare('SELECT id, code FROM permissions').all().forEach(p => { permMap[p.code] = p.id; });
console.log('权限映射:', JSON.stringify(permMap, null, 2));

// 读取角色 code -> id 映射
const roleMap = {};
db.prepare('SELECT id, code FROM roles').all().forEach(r => { roleMap[r.code] = r.id; });
console.log('角色映射:', JSON.stringify(roleMap, null, 2));

// 角色权限配置（code -> permission codes[]）
const rolePermissions = {
  production_manager: [
    // 生产管理：全权
    'production_view', 'production_create', 'production_edit', 'production_delete',
    // 委外加工：全权
    'outsourcing_view', 'outsourcing_create', 'outsourcing_edit', 'outsourcing_delete',
    // 质量检验：全权
    'inspection_view', 'inspection_create', 'inspection_edit', 'inspection_delete',
    // 仓库管理：查看
    'warehouse_view',
    // 订单管理：查看
    'order_view',
    // 采购管理：查看
    'purchase_view',
    // 基础数据：查看
    'basic_data_view',
  ],
  inspector: [
    // 质量检验：全权
    'inspection_view', 'inspection_create', 'inspection_edit', 'inspection_delete',
    // 生产管理：查看
    'production_view',
    // 订单管理：查看
    'order_view',
    // 仓库管理：查看
    'warehouse_view',
  ],
  warehouse_manager: [
    // 仓库管理：全权
    'warehouse_view', 'warehouse_create', 'warehouse_edit', 'warehouse_delete',
    // 订单管理：查看
    'order_view',
    // 采购管理：查看
    'purchase_view',
    // 生产管理：查看
    'production_view',
    // 基础数据：查看
    'basic_data_view',
  ],
  purchaser: [
    // 采购管理：全权
    'purchase_view', 'purchase_create', 'purchase_edit', 'purchase_delete',
    // 仓库管理：查看（入库确认）
    'warehouse_view',
    // 基础数据：查看（供应商/产品查看）
    'basic_data_view',
    // 委外加工：查看
    'outsourcing_view',
  ],
  salesman: [
    // 订单管理：全权
    'order_view', 'order_create', 'order_edit', 'order_delete',
    // 仓库管理：查看（库存确认）
    'warehouse_view',
    // 基础数据：查看（客户/产品查看）
    'basic_data_view',
  ],
  supplier_user: [
    // 采购管理：查看（自己的订单）
    'purchase_view',
    // 委外加工：查看
    'outsourcing_view',
  ],
  customer_user: [
    // 订单管理：查看（自己的订单）
    'order_view',
  ],
};

// 执行
db.transaction(() => {
  Object.entries(rolePermissions).forEach(([roleCode, permCodes]) => {
    const roleId = roleMap[roleCode];
    if (!roleId) { console.warn('角色不存在:', roleCode); return; }
    
    // 先删除该角色现有权限（保证幂等）
    const deleted = db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    console.log(`\n[${roleCode}] 清除旧权限: ${deleted.changes} 条`);
    
    // 插入新权限
    const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    let inserted = 0;
    permCodes.forEach(code => {
      const permId = permMap[code];
      if (!permId) { console.warn('  权限不存在:', code); return; }
      insert.run(roleId, permId);
      inserted++;
      console.log(`  + ${code}`);
    });
    console.log(`  [${roleCode}] 共分配 ${inserted} 条权限`);
  });
})();

// 验证
console.log('\n=== 验证结果 ===');
db.prepare('SELECT r.name as role, COUNT(rp.permission_id) as cnt FROM roles r LEFT JOIN role_permissions rp ON r.id=rp.role_id GROUP BY r.id ORDER BY r.id').all()
  .forEach(x => console.log(`${x.role}: ${x.cnt} 条权限`));

db.close();
console.log('\n✅ 权限配置完成！');
