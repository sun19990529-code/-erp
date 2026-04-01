/**
 * SQL 工具函数
 * 解决 IN 子句空数组等常见边界问题
 */

/**
 * 安全构造 IN 子句，当 ids 为空数组时返回 FALSE 条件以避免 SQL 语法错误
 * @param {string} column - 列名，如 'pp.product_id'
 * @param {Array} ids - 参数数组
 * @returns {{ clause: string, params: Array }}
 * 
 * 使用示例:
 *   const { clause, params } = safeInClause('po.id', poIds);
 *   const rows = await db.all(`SELECT * FROM orders WHERE ${clause}`, params);
 */
function safeInClause(column, ids) {
  if (!ids || ids.length === 0) {
    return { clause: '1=0', params: [] }; // 永假条件，不返回任何行
  }
  const placeholders = ids.map(() => '?').join(',');
  return { clause: `${column} IN (${placeholders})`, params: [...ids] };
}

module.exports = { safeInClause };
