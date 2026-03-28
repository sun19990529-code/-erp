const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { setupSwagger } = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 3198;
const DB_PATH = path.join(__dirname, 'mes.db');

let db;

// 中间件
app.use(cors({
  origin: function(origin, callback) {
    // 无 origin（同源直链、curl 等工具请求）直接放行
    if (!origin) return callback(null, true);
    try {
      const { hostname } = new URL(origin);
      // 放行 localhost / 127.x / 局域网 / 任意 IP 直接访问（外网通过 IP 访问本机属合法同主机场景）
      const isLocalhost = /^(localhost|127\.\d+\.\d+\.\d+)$/.test(hostname);
      const isLAN      = /^(192\.168\.|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
      const isTrusted  = /(^|\.)suncraft\.site$|(^|\.)msgy\.asia$/.test(hostname);
      // 开发环境放行所有 IP，生产环境仅放行局域网+可信域名
      const isProd = process.env.NODE_ENV === 'production';
      const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
      if (isLocalhost || isLAN || isTrusted || (!isProd && isIPv4)) return callback(null, true);
      callback(new Error('CORS 来源不允许'));
    } catch {
      callback(new Error('CORS 来源解析失败'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// 安全响应头（防 XSS、点击劫持、MIME 嗅探等）
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  hsts: false,
}));

app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 请求限流：每 IP 每分钟最多 300 次请求
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' }
});
app.use('/api', limiter);

// better-sqlite3 自动持久化，无需手动存盘（保留接口兼容 backup 模块）
function saveDatabase() { /* no-op for better-sqlite3 */ }


const dbHelper = {
  run: (sql, params = []) => {
    const info = db.prepare(sql).run(params);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  },
  get: (sql, params = []) => {
    return db.prepare(sql).get(params) || null;
  },
  all: (sql, params = []) => {
    return db.prepare(sql).all(params);
  },
  paginate: (sql, params = [], page = 1, pageSize = 20) => {
    // 【P2】用子查询包装而非正则剥离 ORDER BY
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as _t`;
    const totalResult = dbHelper.get(countSql, params);
    const total = totalResult?.total || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const data = dbHelper.all(`${sql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return { data, pagination: { total, totalPages, page, pageSize } };
  },
  transaction: (fn) => {
    const executeTx = db.transaction(() => {
      fn();
    });
    executeTx();
  }
};

// ==================== dbHelper 中间件 ====================
// 将 dbHelper 注入到每个请求中，路由模块通过 req.db 访问
app.use((req, res, next) => {
  req.db = dbHelper;
  req.getDb = () => db;
  req.saveDatabase = saveDatabase;
  req.restoreDb = (backupFilePath) => {
    // bettersqlite3 的还原逻辑：关闭当前连接 -> 覆盖文件 -> 重新实例化
    const Database = require('better-sqlite3');
    try {
      db.close();
      fs.copyFileSync(backupFilePath, DB_PATH);
      db = new Database(DB_PATH);
      console.log('数据库还原完成:', backupFilePath);
    } catch (err) {
      console.error('还原失败:', err);
      throw err;
    }
  };
  next();
});

// ==================== JWT 鉴权中间件 ====================
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/jwt');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  [安全警告] JWT_SECRET 使用默认值，生产环境请设置环境变量 JWT_SECRET');
}
const whiteList = ['/api/users/login', '/api/users/refresh'];

app.use((req, res, next) => {
  // 静态文件、白名单放行
  if (!req.path.startsWith('/api') || whiteList.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未授权访问，请重新登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
});

// ==================== 路由注册 ====================
const dashboardRoutes = require('./routes/dashboard');
const basicRoutes = require('./routes/basic');
const productRoutes = require('./routes/products');
const warehouseRoutes = require('./routes/warehouse');
const orderRoutes = require('./routes/orders');
const productionRoutes = require('./routes/production');
const inspectionRoutes = require('./routes/inspection');
const purchaseRoutes = require('./routes/purchase');
const outsourcingRoutes = require('./routes/outsourcing');
const pickRoutes = require('./routes/pick');
const { router: backupRoutes, startAutoBackup } = require('./routes/backup');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api', basicRoutes);            // /api/departments, /api/roles, /api/users, etc.
app.use('/api/products', productRoutes);
app.use('/api', warehouseRoutes);         // /api/warehouses, /api/inventory, /api/inbound, /api/outbound
app.use('/api/orders', orderRoutes);
app.use('/api/production', productionRoutes);  // /api/production, /api/production/processes
app.use('/api/inspection', inspectionRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/outsourcing', outsourcingRoutes);
app.use('/api/pick', pickRoutes);
app.use('/api/backup', backupRoutes);

const materialCategoryRoutes = require('./routes/material-categories');
app.use('/api/material-categories', materialCategoryRoutes);

// 操作日志路由
const logsRoutes = require('./routes/logs');
app.use('/api/logs', logsRoutes);

// 生产追踪路由
const trackingRoutes = require('./routes/production-tracking');
app.use('/api/tracking', trackingRoutes);

// ==================== 全局错误处理中间件 ====================
 
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误，请联系管理员'
  });
});

// ==================== 启动服务器 ====================

const { initDatabase } = require('./database');
const Database = require('better-sqlite3');

async function startServer() {
  db = new Database(DB_PATH);
  console.log('数据库加载成功 (better-sqlite3)');
  db = await initDatabase(db);
  
  // 启动自动备份
  startAutoBackup(() => db, saveDatabase);
  
  // 挂载 Swagger API 文档
  setupSwagger(app);

  // SPA fallback：非 API 路由全部返回 index.html，由 React Router 处理
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });

  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

// 进程级崩溃防护
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 未捕获的异常，服务不中断继续运行:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] 未处理的 Promise 拒绝:', reason);
});

startServer();
