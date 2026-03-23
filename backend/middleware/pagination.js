/**
 * 分页中间件
 * 使用方法：在路由查询中添加 ?page=1&pageSize=20
 * 自动解析并注入 req.pagination
 */
function parsePagination(req, _res, next) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  req.pagination = { page, pageSize, offset };
  next();
}

/**
 * 构建分页 SQL 和响应
 * @param {Object} db - 数据库辅助对象
 * @param {string} baseSql - 基础查询 SQL（不要包含 LIMIT/OFFSET）
 * @param {Array} params - 参数数组
 * @param {Object} pagination - req.pagination
 * @returns {{ data: Array, pagination: Object }}
 */
function paginatedQuery(db, baseSql, params, pagination) {
  const { page, pageSize, offset } = pagination;
  
  // 计算总数
  const countSql = `SELECT COUNT(*) as total FROM (${baseSql})`;
  const { total } = db.get(countSql, params);
  
  // 分页查询
  const dataSql = `${baseSql} LIMIT ? OFFSET ?`;
  const data = db.all(dataSql, [...params, pageSize, offset]);
  
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

module.exports = { parsePagination, paginatedQuery };
