/**
 * 权限校验中间件
 * 基于角色-权限表做路由级权限控制
 */

// 权限缓存（按 role_id 缓存，避免每次请求查库）
const permissionCache = new Map();
const CACHE_TTL = 60 * 1000; // 缓存 60 秒

async function getPermissions(db, roleId) {
  const cached = permissionCache.get(roleId);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.perms;
  }
  const rows = await db.all(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?`,
    [roleId]
  );
  const perms = rows.map(p => p.code);
  permissionCache.set(roleId, { perms, time: Date.now() });
  return perms;
}

// 清除缓存（在分配权限后调用）
function clearPermissionCache(roleId) {
  if (roleId) {
    permissionCache.delete(roleId);
  } else {
    permissionCache.clear();
  }
}

/**
 * 权限校验中间件工厂
 * @param {string} permissionCode - 所需权限编码，如 'order_view'
 * @returns Express middleware
 */
function requirePermission(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }
    if (req.user.role_code === 'admin') {
      return next();
    }
    const perms = await getPermissions(req.db, req.user.role_id);
    if (perms.includes(permissionCode)) {
      return next();
    }
    return res.status(403).json({ success: false, message: '权限不足，无法执行此操作' });
  };
}

/**
 * 多权限校验（满足其一即可）
 * @param  {...string} codes - 权限编码列表
 */
function requireAnyPermission(...codes) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未授权访问' });
    }
    if (req.user.role_code === 'admin') {
      return next();
    }
    const perms = await getPermissions(req.db, req.user.role_id);
    if (codes.some(code => perms.includes(code))) {
      return next();
    }
    return res.status(403).json({ success: false, message: '权限不足，无法执行此操作' });
  };
}

module.exports = { requirePermission, requireAnyPermission, clearPermissionCache };
