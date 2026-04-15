import { describe, it, expect, vi } from 'vitest';

/**
 * CRUD 工厂 - 软删除行为测试
 * 验证 softDelete 配置项对列表过滤和删除操作的影响
 */

// 从 crud-factory.js 提取的核心逻辑
function buildListSql(table, orderBy, softDelete) {
  const whereClause = softDelete ? 'WHERE (is_deleted IS NULL OR is_deleted = 0)' : '';
  return `SELECT * FROM ${table} ${whereClause} ORDER BY ${orderBy}`;
}

function buildDeleteAction(table, softDelete, hasTimestamps) {
  if (softDelete) {
    return `UPDATE ${table} SET is_deleted = 1${hasTimestamps ? ', updated_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`;
  }
  return `DELETE FROM ${table} WHERE id = ?`;
}

describe('CRUD 工厂 - 列表 SQL 生成', () => {
  it('softDelete=true 时应包含 is_deleted 过滤', () => {
    const sql = buildListSql('customers', 'id DESC', true);
    expect(sql).toContain('is_deleted IS NULL OR is_deleted = 0');
    expect(sql).toContain('ORDER BY id DESC');
  });

  it('softDelete=false 时不应包含 is_deleted 过滤', () => {
    const sql = buildListSql('departments', 'id', false);
    expect(sql).not.toContain('is_deleted');
    expect(sql).toBe('SELECT * FROM departments  ORDER BY id');
  });

  it('应正确处理不同表名', () => {
    const sql = buildListSql('suppliers', 'id DESC', true);
    expect(sql).toContain('FROM suppliers');
    expect(sql).toContain('is_deleted');
  });
});

describe('CRUD 工厂 - 删除 SQL 生成', () => {
  it('softDelete=true 应生成 UPDATE 语句', () => {
    const sql = buildDeleteAction('customers', true, true);
    expect(sql).toContain('UPDATE customers SET is_deleted = 1');
    expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
    expect(sql).not.toContain('DELETE FROM');
  });

  it('softDelete=true + hasTimestamps=false 不应包含 updated_at', () => {
    const sql = buildDeleteAction('customers', true, false);
    expect(sql).toContain('UPDATE customers SET is_deleted = 1');
    expect(sql).not.toContain('updated_at');
  });

  it('softDelete=false 应生成 DELETE 语句', () => {
    const sql = buildDeleteAction('departments', false, true);
    expect(sql).toBe('DELETE FROM departments WHERE id = ?');
  });
});

describe('CRUD 工厂 - 关联检查逻辑', () => {
  // 模拟 checkRelations 逻辑
  async function checkRelations(relations, id, dbGet) {
    for (const rel of relations) {
      const count = await dbGet(
        `SELECT COUNT(*) as count FROM ${rel.table} WHERE ${rel.foreignKey} = ?`,
        [id]
      );
      if (count && count.count > 0) {
        return { blocked: true, message: rel.message };
      }
    }
    return { blocked: false };
  }

  it('有关联数据时应阻止删除', async () => {
    const mockDbGet = vi.fn().mockResolvedValue({ count: 3 });
    const relations = [
      { table: 'orders', foreignKey: 'customer_id', message: '该客户有关联订单，无法删除' }
    ];
    const result = await checkRelations(relations, 1, mockDbGet);
    expect(result.blocked).toBe(true);
    expect(result.message).toContain('关联订单');
  });

  it('无关联数据时应允许删除', async () => {
    const mockDbGet = vi.fn().mockResolvedValue({ count: 0 });
    const relations = [
      { table: 'orders', foreignKey: 'customer_id', message: '有关联订单' }
    ];
    const result = await checkRelations(relations, 1, mockDbGet);
    expect(result.blocked).toBe(false);
  });

  it('多重关联应按顺序检查，首个命中即返回', async () => {
    const mockDbGet = vi.fn()
      .mockResolvedValueOnce({ count: 0 })  // purchase_orders: 无关联
      .mockResolvedValueOnce({ count: 2 });  // outsourcing_orders: 有关联
    const relations = [
      { table: 'purchase_orders', foreignKey: 'supplier_id', message: '有采购单' },
      { table: 'outsourcing_orders', foreignKey: 'supplier_id', message: '有委外单' },
    ];
    const result = await checkRelations(relations, 1, mockDbGet);
    expect(result.blocked).toBe(true);
    expect(result.message).toContain('委外单');
    expect(mockDbGet).toHaveBeenCalledTimes(2);
  });
});

describe('CRUD 工厂 - 软删除与列表联动', () => {
  it('软删除的记录不应出现在列表 SQL 结果集中', () => {
    // 模拟数据库中的记录
    const allRecords = [
      { id: 1, name: '客户A', is_deleted: 0 },
      { id: 2, name: '客户B', is_deleted: 1 },  // 已软删除
      { id: 3, name: '客户C', is_deleted: null }, // 旧数据无此字段
      { id: 4, name: '客户D', is_deleted: 0 },
    ];

    // 模拟 WHERE 过滤
    const filtered = allRecords.filter(r => r.is_deleted == null || r.is_deleted === 0);
    expect(filtered).toHaveLength(3);
    expect(filtered.map(r => r.id)).toEqual([1, 3, 4]);
    // 软删除的客户B不应在结果中
    expect(filtered.find(r => r.id === 2)).toBeUndefined();
  });

  it('JOIN 查询不应过滤已删除的字典项（保护历史单据）', () => {
    // 模拟：订单引用了已删除的客户
    const orders = [
      { id: 1, customer_id: 2, customer_name: null }, // 客户B已删除
    ];
    const customers = [
      { id: 2, name: '客户B', is_deleted: 1 },
    ];

    // JOIN 不应过滤 is_deleted → 历史订单仍然能拿到客户名
    const enriched = orders.map(o => ({
      ...o,
      customer_name: customers.find(c => c.id === o.customer_id)?.name || null,
    }));
    expect(enriched[0].customer_name).toBe('客户B');
  });
});
