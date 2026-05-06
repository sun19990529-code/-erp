require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const { setupSwagger } = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 3198;

// ==================== PostgreSQL 连接池 ====================
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'msgy-erp',
  max: parseInt(process.env.DB_POOL_MAX) || 10,  // 最大连接数
  min: 2,                         // 最小保持连接数
  idleTimeoutMillis: 30000,       // 空闲连接超时
  connectionTimeoutMillis: 5000,  // 连接超时
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] 连接池异常:', err.message);
});

// ==================== 事务上下文存储 ====================
// 用 AsyncLocalStorage 实现：transaction 回调内部的 req.db 调用自动路由到事务客户端
const txStorage = new AsyncLocalStorage();

// SQL 占位符转换：? → $1, $2, $3...
// 安全处理 PostgreSQL 的 '' 单引号、"" 双引号、$$ 美元符字符串、E'' 转义字符串
function convertPlaceholders(sql) {
  let idx = 0;
  let i = 0;
  let result = '';
  const len = sql.length;

  while (i < len) {
    const char = sql[i];

    // 处理 $tag$...$tag$ 美元符字符串（PostgreSQL 扩展语法）
    if (char === '$' && i + 1 < len) {
      const tagStart = i;
      let j = i + 1;
      // 读取 tag 名（可以为空 → $$...$$）
      while (j < len && sql[j] !== '$' && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      if (j < len && sql[j] === '$') {
        const tag = sql.slice(tagStart, j + 1); // 例如 $$ 或 $tag$
        const endPos = sql.indexOf(tag, j + 1);
        if (endPos !== -1) {
          result += sql.slice(tagStart, endPos + tag.length);
          i = endPos + tag.length;
          continue;
        }
      }
      result += char;
      i++;
      continue;
    }

    // 处理单引号字符串（含 E'' 转义字符串和 '' 双写转义）
    if (char === "'" || (char === 'E' && i + 1 < len && sql[i + 1] === "'")) {
      const isEscape = char === 'E';
      if (isEscape) { result += 'E'; i++; }
      result += "'";
      i++;
      while (i < len) {
        if (sql[i] === "'" && i + 1 < len && sql[i + 1] === "'") {
          result += "''"; i += 2; // 双写引号转义
        } else if (sql[i] === '\\' && isEscape && i + 1 < len) {
          result += sql[i] + sql[i + 1]; i += 2; // 反斜杠转义
        } else if (sql[i] === "'") {
          result += "'"; i++;
          break;
        } else {
          result += sql[i]; i++;
        }
      }
      continue;
    }

    // 处理双引号标识符
    if (char === '"') {
      result += '"';
      i++;
      while (i < len && sql[i] !== '"') { result += sql[i]; i++; }
      if (i < len) { result += '"'; i++; }
      continue;
    }

    // 核心：替换 ? 占位符
    if (char === '?') {
      result += `$${++idx}`;
      i++;
      continue;
    }

    result += char;
    i++;
  }
  return result;
}

// ==================== dbHelper（PostgreSQL 异步版） ====================
const dbHelper = {
  async run(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const executor = txStorage.getStore() || pool;
    // INSERT 语句自动追加 RETURNING * 以获取自增 ID
    const isInsert = /^\s*INSERT/i.test(pgSql);
    const finalSql = (isInsert && !/RETURNING/i.test(pgSql))
      ? pgSql + ' RETURNING *'
      : pgSql;
    const result = await executor.query(finalSql, params);
    return {
      lastInsertRowid: result.rows[0]?.id ?? null,
      changes: result.rowCount,
    };
  },

  async get(sql, params = []) {
    const executor = txStorage.getStore() || pool;
    const result = await executor.query(convertPlaceholders(sql), params);
    return result.rows[0] || null;
  },

  async all(sql, params = []) {
    const executor = txStorage.getStore() || pool;
    const result = await executor.query(convertPlaceholders(sql), params);
    return result.rows;
  },

  async paginate(sql, params = [], page = 1, pageSize = 20) {
    const pgSql = convertPlaceholders(sql);
    const executor = txStorage.getStore() || pool;
    // COUNT 子查询
    const countSql = `SELECT COUNT(*) as total FROM (${pgSql}) as _t`;
    const countResult = await executor.query(countSql, params);
    const total = parseInt(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    // LIMIT/OFFSET 使用新的占位符编号
    const nextIdx = params.length;
    const dataSql = `${pgSql} LIMIT $${nextIdx + 1} OFFSET $${nextIdx + 2}`;
    const dataResult = await executor.query(dataSql, [...params, pageSize, offset]);
    return { data: dataResult.rows, pagination: { total, totalPages, page, pageSize } };
  },

  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // fn 内部所有 dbHelper 调用自动走这个 client
      const result = await txStorage.run(client, () => fn());
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

// 中间件
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const { hostname } = new URL(origin);
      const isLocalhost = /^(localhost|127\.\d+\.\d+\.\d+)$/.test(hostname);
      const isLAN      = /^(192\.168\.|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
      const isTrusted  = /(^|\.)suncraft\.site$|(^|\.)msgy\.asia$/.test(hostname);
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
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// 安全响应头
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
      upgradeInsecureRequests: null,
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: false,
}));

app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 全局请求限流已移除，转移至具体的登录接口以提高业务并发能力

// PostgreSQL 无需手动存盘（保留接口兼容）
function saveDatabase() { /* no-op for PostgreSQL */ }

// ==================== dbHelper 中间件 ====================
app.use((req, res, next) => {
  req.db = dbHelper;
  req.getDb = () => pool;  // 兼容 printTemplate 等直接使用原生 DB 的模块
  req.saveDatabase = saveDatabase;
  next();
});

// ==================== JWT 鉴权中间件 ====================
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/jwt');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  [安全警告] JWT_SECRET 使用默认值，生产环境请设置环境变量 JWT_SECRET');
}
const whiteList = ['/api/users/login', '/api/users/refresh', '/api/users/logout'];
const screenWhitePrefix = '/api/workstation/screen/';
const botWhitePrefix = '/api/bot/';  // 机器人回调免鉴权

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api') || whiteList.includes(req.path)) {
    return next();
  }
  if (req.method === 'GET' && req.path.startsWith(screenWhitePrefix)) {
    return next();
  }
  // 机器人回调接口免鉴权
  if (req.path.startsWith(botWhitePrefix)) {
    return next();
  }
  const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
  
  if (!token) {
    return res.status(401).json({ success: false, message: '未授权访问，请重新登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // 令牌版本号校验：如果用户被禁用/角色变更/强制注销，token_version 会递增，旧令牌立即失效
    if (decoded.token_version != null && decoded.id) {
      try {
        const dbUser = await req.db.get('SELECT token_version, status FROM users WHERE id = ?', [decoded.id]);
        if (!dbUser || dbUser.status === 0) {
          return res.status(401).json({ success: false, message: '账号已被禁用，请联系管理员' });
        }
        if (dbUser.token_version != null && dbUser.token_version !== decoded.token_version) {
          return res.status(401).json({ success: false, message: '登录凭证已失效，请重新登录' });
        }
      } catch (dbErr) {
        // 数据库异常时降级为仅 JWT 签名校验，不阻断业务请求
        console.error('[auth] token_version 校验失败，降级放行:', dbErr.message);
      }
    }

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
const { router: aiRoutes } = require('./routes/ai');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api', basicRoutes);
app.use('/api/products', productRoutes);
app.use('/api', warehouseRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/inspection', inspectionRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/outsourcing', outsourcingRoutes);
app.use('/api/pick', pickRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/ai', aiRoutes);

const materialCategoryRoutes = require('./routes/material-categories');
app.use('/api/material-categories', materialCategoryRoutes);

const logsRoutes = require('./routes/logs');
app.use('/api/logs', logsRoutes);

const trackingRoutes = require('./routes/production-tracking');
app.use('/api/tracking', trackingRoutes);

const stocktakeRoutes = require('./routes/stocktake');
app.use('/api/stocktake', stocktakeRoutes);
const { router: notificationRoutes } = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);
const { router: financeRoutes } = require('./routes/finance');
app.use('/api/finance', financeRoutes);
const reportRoutes = require('./routes/report');
app.use('/api/report', reportRoutes);
const importRoutes = require('./routes/import');
app.use('/api/import', importRoutes);
const workstationRoutes = require('./routes/workstation');
app.use('/api/workstation', workstationRoutes);

const printTemplateRoutes = require('./routes/printTemplate');
app.use('/api/print-templates', printTemplateRoutes);

const { router: botRoutes, queryProductionSummary } = require('./routes/bot');
app.use('/api/bot', botRoutes);

// ==================== 全局错误处理中间件 ====================
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误，请联系管理员'
  });
});

// ==================== 启动服务器 ====================
async function startServer() {
  // 验证 PostgreSQL 连接
  try {
    const client = await pool.connect();
    const ver = await client.query('SELECT version()');
    console.log('PostgreSQL 连接成功:', ver.rows[0].version.split(',')[0]);
    client.release();
  } catch (err) {
    console.error('PostgreSQL 连接失败:', err.message);
    process.exit(1);
  }

  // ==== 启动企微长连接智能狗狗 ====
  try {
    const { initWechatBot } = require('./services/wechatBot');
    await initWechatBot(dbHelper);
  } catch(e) {
    console.warn('[WecomBot] 加载失败，智能对接退化:', e.message);
  }

  // 启动自动备份（PostgreSQL 模式下使用 pg_dump）
  startAutoBackup(() => pool, saveDatabase);

  // 定时生产日报推送（每天 8:00）
  const { pushWebhook } = require('./utils/webhook');
  function scheduleDailyReport() {
    const now = new Date();
    const next8am = new Date(now);
    next8am.setHours(8, 0, 0, 0);
    if (now >= next8am) next8am.setDate(next8am.getDate() + 1);
    const delay = next8am.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        const report = await queryProductionSummary(dbHelper);
        await pushWebhook(report.title, report.content, 'info');
        console.log('[日报] 生产日报已推送');
      } catch (e) {
        console.error('[日报] 推送失败:', e.message);
      }
      // 设置下一次（24小时后）
      setInterval(async () => {
        try {
          const report = await queryProductionSummary(dbHelper);
          await pushWebhook(report.title, report.content, 'info');
          console.log('[日报] 生产日报已推送');
        } catch (e) {
          console.error('[日报] 推送失败:', e.message);
        }
      }, 24 * 60 * 60 * 1000);
    }, delay);
    console.log(`生产日报定时推送已启动，下次推送: ${next8am.toLocaleString()}`);
  }
  scheduleDailyReport();

  setupSwagger(app);

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });

  // HTTPS 自动加载逻辑
  const certPath = path.join(__dirname, 'config', 'server.pem');
  const keyPath = path.join(__dirname, 'config', 'server.key');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const https = require('https');
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    https.createServer(options, app).listen(PORT, () => {
      console.log(`🔒 HTTPS 服务器已启动，请访问: https://你的域名:${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log(`(若需开启 HTTPS，请将阿里云证书放置在 backend/config/ 下并命名为 server.pem 和 server.key)`);
    });
  }
}

// 进程级崩溃防护
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 未捕获的异常:', err.stack || err.message);
  // Node.js 官方建议：uncaughtException 后进程状态不确定，应退出让 PM2 重启
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] 未处理的 Promise 拒绝:', reason);
});

startServer();
