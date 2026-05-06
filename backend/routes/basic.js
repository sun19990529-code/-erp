const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' }
});
const { createCRUDRouter } = require('./crud-factory');
const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_REFRESH_MAX_AGE } = require('../config/jwt');
const { BCRYPT_ROUNDS } = require('../config/security');
const { validate } = require('../middleware/validate');
const { userLogin, userCreate } = require('../validators/schemas');
const { clearPermissionCache } = require('../middleware/permission');
const { ENTITY_STATUS } = require('../constants/status');
// 管理员专属中间件：角色/权限/用户管理仅限 admin 角色
const adminOnly = async (req, res, next) => {
  if (!req.user || req.user.role_code !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可执行此操作' });
  }
  next();
};

// ==================== 部门管理（使用 CRUD 工厂）====================
const departmentRouter = createCRUDRouter({
  table: 'departments',
  fields: ['name', 'description'],
  orderBy: 'id',
  permissionPrefix: 'basic_data',
  softDelete: true,
  checkRelations: [
    { table: 'users', foreignKey: 'department_id', message: '该部门下有关联用户，无法删除' }
  ]
});
router.use('/departments', departmentRouter);

// ==================== 客户管理（使用 CRUD 工厂）====================
const customerRouter = createCRUDRouter({
  table: 'customers',
  fields: ['name', 'code', 'contact_person', 'phone', 'email', 'address', 'credit_level', 'status'],
  orderBy: 'id DESC',
  permissionPrefix: 'basic_data',
  softDelete: true,
  checkRelations: [
    { table: 'orders', foreignKey: 'customer_id', message: '该客户有关联订单，无法删除' }
  ]
});
router.use('/customers', customerRouter);

// ==================== 供应商管理（使用 CRUD 工厂）====================
const supplierRouter = createCRUDRouter({
  table: 'suppliers',
  fields: ['name', 'code', 'contact_person', 'phone', 'email', 'address', 'status'],
  orderBy: 'id DESC',
  permissionPrefix: 'basic_data',
  softDelete: true,
  checkRelations: [
    { table: 'purchase_orders', foreignKey: 'supplier_id', message: '该供应商有关联采购单，无法删除' },
    { table: 'outsourcing_orders', foreignKey: 'supplier_id', message: '该供应商有关联委外单，无法删除' }
  ]
});
router.use('/suppliers', supplierRouter);

// ==================== 操作员列表（按部门分组）====================
router.get('/operators', async (req, res) => {
  try {
    const users = await req.db.all(`
      SELECT u.id, u.real_name, u.username, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.status != ?
      ORDER BY d.name, u.real_name
    `, [ENTITY_STATUS.DISABLED]);
    // 按部门分组
    const grouped = {};
    users.forEach(u => {
      const dept = u.department_name || '未分配部门';
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push({ id: u.id, name: u.real_name || u.username });
    });
    const data = Object.entries(grouped).map(([department, members]) => ({ department, members }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[basic.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 角色管理 ====================
router.get('/roles', adminOnly, async (req, res) => {
  try {
    const roles = await req.db.all('SELECT * FROM roles ORDER BY id');
    res.json({ success: true, data: roles });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/roles', adminOnly, async (req, res) => {
  try {
    const { name, code, description } = req.body;
    await req.db.run('INSERT INTO roles (name, code, description) VALUES (?, ?, ?)', [name, code, description]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/roles/:id', adminOnly, async (req, res) => {
  try {
    const { name, code, description } = req.body;
    await req.db.run('UPDATE roles SET name = ?, code = ?, description = ? WHERE id = ?', [name, code, description, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/roles/:id', adminOnly, async (req, res) => {
  try {
    // 检查是否有用户关联该角色
    const count = await req.db.get('SELECT COUNT(*) as count FROM users WHERE role_id = ?', [req.params.id]);
    if (count && count.count > 0) {
      return res.status(400).json({ success: false, message: '该角色下有关联用户，无法删除' });
    }
    await req.db.run('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    await req.db.run('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 权限管理 ====================
router.get('/permissions', adminOnly, async (req, res) => {
  try {
    const permissions = await req.db.all('SELECT * FROM permissions ORDER BY id');
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/permissions', adminOnly, async (req, res) => {
  try {
    const { name, code, module, description } = req.body;
    if (!name || !code || !module) {
      return res.status(400).json({ success: false, message: '名称、编码和模块不能为空' });
    }
    const result = await req.db.run(
      'INSERT INTO permissions (name, code, module, description) VALUES (?, ?, ?, ?)',
      [name, code, module, description || name + '权限']
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: '权限编码已存在' });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/permissions/:id', adminOnly, async (req, res) => {
  try {
    const { name, code, module, description } = req.body;
    if (!name || !code || !module) {
      return res.status(400).json({ success: false, message: '名称、编码和模块不能为空' });
    }
    await req.db.run(
      'UPDATE permissions SET name = ?, code = ?, module = ?, description = ? WHERE id = ?',
      [name, code, module, description, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: '权限编码已存在' });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/permissions/:id', adminOnly, async (req, res) => {
  try {
    const relations = await req.db.all('SELECT * FROM role_permissions WHERE permission_id = ?', [req.params.id]);
    if (relations.length > 0) {
      return res.status(400).json({ success: false, message: '该权限已被角色使用，无法删除' });
    }
    await req.db.run('DELETE FROM permissions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/roles/:id/permissions', adminOnly, async (req, res) => {
  try {
    const permissions = await req.db.all(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/roles/:id/permissions', adminOnly, async (req, res) => {
  try {
    const { permissionIds } = req.body;
    // 使用事务批量操作
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
      for (const pid of permissionIds) {
        await req.db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [req.params.id, pid]);
      }
    });
    // 【F5】权限修改后立即清除缓存
    clearPermissionCache(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 用户管理 ====================
router.get('/users', adminOnly, async (req, res) => {
  try {
    const { user_type } = req.query;
    let sql = `
      SELECT u.*, d.name as department_name, r.name as role_name, s.name as supplier_name, c.name as customer_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN suppliers s ON u.supplier_id = s.id
      LEFT JOIN customers c ON u.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (user_type) {
      if (user_type === 'external') {
        sql += " AND u.user_type IN ('supplier', 'customer')";
      } else {
        sql += ' AND u.user_type = ?';
        params.push(user_type);
      }
    }
    sql += ' ORDER BY u.id';
    const users = await req.db.all(sql, params);
    users.forEach(u => delete u.password);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/users/login', authLimiter, validate(userLogin), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await req.db.get(`
      SELECT u.*, d.name as department_name, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = ? AND u.status = 1
    `, [username]);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    // 密码验证：严格验证 Bcrypt 哈希
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    delete user.password;
    
    // 获取用户权限
    let permissions = [];
    if (user.role_id) {
      const permRows = await req.db.all(`
        SELECT p.code FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `, [user.role_id]);
      permissions = permRows.map(p => p.code);
    }
    
    const tokenPayload = { id: user.id, username: user.username, role_id: user.role_id, role_code: user.role_code, user_type: user.user_type, token_version: user.token_version || 1 };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
    
    const isProd = process.env.NODE_ENV === 'production';
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000 // 12h
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/users/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7d
    });
    
    res.json({ success: true, data: { ...user, permissions } });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/users', adminOnly, validate(userCreate), async (req, res) => {
  try {
    const { username, password, real_name, user_type, department_id, role_id, supplier_id, customer_id, status } = req.body;
    // 密码加密
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await req.db.run(`
      INSERT INTO users (username, password, real_name, user_type, department_id, role_id, supplier_id, customer_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [username, hashedPassword, real_name, user_type || 'internal', department_id, role_id, supplier_id, customer_id, status ?? 1]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/users/:id', adminOnly, async (req, res) => {
  try {
    const { username, real_name, user_type, department_id, role_id, supplier_id, customer_id, status, password } = req.body;
    let sql = 'UPDATE users SET username = ?, real_name = ?, user_type = ?, department_id = ?, role_id = ?, supplier_id = ?, customer_id = ?, status = ?';
    const params = [username, real_name, user_type, department_id, role_id, supplier_id, customer_id, status];
    if (password) {
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      sql += ', password = ?';
      params.push(hashedPassword);
    }
    // 角色/密码/状态变动时递增 token_version，使该用户的所有旧令牌立即失效
    const oldUser = await req.db.get('SELECT role_id, status FROM users WHERE id = ?', [req.params.id]);
    if (oldUser && (oldUser.role_id !== role_id || oldUser.status !== status || password)) {
      sql += ', token_version = COALESCE(token_version, 1) + 1';
    }
    sql += ', updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    params.push(req.params.id);
    await req.db.run(sql, params);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // 【S3】保护 admin 用户不可被删除
    const user = await req.db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    if (user.role_id === 1) return res.status(400).json({ success: false, message: '系统管理员不允许删除' });
    // 不能删除自己
    if (req.user && req.user.id === userId) return res.status(400).json({ success: false, message: '不能删除自己的账号' });
    // 【B4】检查关联数据
    const relatedOrders = await req.db.get("SELECT COUNT(*) as count FROM production_orders WHERE operator = ?", [user.real_name]);
    if (relatedOrders && relatedOrders.count > 0) {
      return res.status(400).json({ success: false, message: `该用户有 ${relatedOrders.count} 条关联生产记录，无法删除` });
    }
    await req.db.run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[basic.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// JWT 令牌静默刷新端点（无需鉴权中间件，由 server.js 白名单控制）
router.post('/users/refresh', authLimiter, async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(400).json({ success: false, message: '缺少 refreshToken' });
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    // 校验 token_version：如果用户已被注销/禁用，拒绝刷新
    if (decoded.id) {
      const dbUser = await req.db.get('SELECT token_version, status FROM users WHERE id = ?', [decoded.id]);
      if (!dbUser || dbUser.status === 0) {
        return res.status(401).json({ success: false, message: '账号已被禁用，请联系管理员' });
      }
      if (decoded.token_version != null && dbUser.token_version != null && dbUser.token_version !== decoded.token_version) {
        return res.status(401).json({ success: false, message: '登录凭证已失效，请重新登录' });
      }
    }
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role_id: decoded.role_id, role_code: decoded.role_code, user_type: decoded.user_type, token_version: decoded.token_version },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000
    });
    res.json({ success: true, data: { token_refreshed: true } });
  } catch (e) {
    res.status(401).json({ success: false, message: '刷新令牌无效或已过期，请重新登录' });
  }
});

// 退出登录，清空 Cookie
router.post('/users/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/users/refresh' });
  res.json({ success: true });
});

// 获取本人权限等运行时必需品
router.get('/users/me/permissions', async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: '无权操作' });
    let permissions = [];
    if (req.user.role_id) {
      const permRows = await req.db.all(`
        SELECT p.code FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `, [req.user.role_id]);
      permissions = permRows.map(p => p.code);
    }
    const dbUser = await req.db.get(`
      SELECT u.*, d.name as department_name, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ? AND u.status = 1
    `, [req.user.id]);
    
    if (!dbUser) return res.status(401).json({ success: false, message: '用户已失效' });
    delete dbUser.password;
    
    res.json({ success: true, data: { ...dbUser, permissions } });
  } catch (error) {
    console.error(`[basic.js] get me error:`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
