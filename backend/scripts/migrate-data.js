/**
 * SQLite → PostgreSQL 数据迁移脚本
 * 功能：将 mes.db 中的全部数据原封不动迁移到 PostgreSQL
 * 用法：node scripts/migrate-data.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'mes.db');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'msgy-erp',
});

// 表的依赖顺序（被依赖的先建先导）
const TABLE_ORDER = [
  'departments',
  'roles',
  'permissions',
  'role_permissions',
  'customers',
  'suppliers',
  'material_categories',
  'processes',
  'warehouses',
  'products',
  'product_suppliers',
  'product_customers',
  'product_bound_materials',
  'product_processes',
  'process_materials',
  'orders',
  'order_items',
  'order_materials',
  'users',
  'inventory',
  'production_orders',
  'production_process_records',
  'production_material_consumption',
  'inbound_orders',
  'inbound_items',
  'inbound_inspections',
  'outbound_orders',
  'outbound_items',
  'pick_orders',
  'pick_items',
  'purchase_orders',
  'purchase_items',
  'outsourcing_orders',
  'outsourcing_items',
  'outsourcing_inspections',
  'patrol_inspections',
  'final_inspections',
  'operation_logs',
  'stocktake_orders',
  'stocktake_items',
  'notifications',
  'payables',
  'receivables',
  'payment_records',
  'workstations',
  'print_templates',
];

// PostgreSQL 建表 DDL（从 SQLite 语法完整转换）
const PG_DDL = `
-- 部门
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 角色
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 权限
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  module TEXT NOT NULL,
  description TEXT
);

-- 角色权限
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  permission_id INTEGER NOT NULL REFERENCES permissions(id),
  UNIQUE(role_id, permission_id)
);

-- 客户
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  credit_level TEXT,
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 供应商
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 材质分类
CREATE TABLE IF NOT EXISTS material_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 工序
CREATE TABLE IF NOT EXISTS processes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  sequence INTEGER DEFAULT 0,
  description TEXT,
  status INTEGER DEFAULT 1
);

-- 仓库
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  location TEXT,
  manager TEXT,
  status INTEGER DEFAULT 1
);

-- 产品
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  specification TEXT,
  unit TEXT,
  category TEXT NOT NULL,
  unit_price REAL,
  stock_threshold INTEGER DEFAULT 0,
  outer_diameter REAL,
  inner_diameter REAL,
  wall_thickness REAL,
  length REAL,
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER DEFAULT 0,
  tolerance_od REAL,
  tolerance_id REAL,
  tolerance_wt REAL,
  tolerance_len REAL,
  tolerance_od_lower REAL,
  tolerance_id_lower REAL,
  tolerance_wt_lower REAL,
  tolerance_len_lower REAL,
  material_category_id INTEGER REFERENCES material_categories(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产品-供应商绑定
CREATE TABLE IF NOT EXISTS product_suppliers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, supplier_id)
);

-- 产品-客户绑定
CREATE TABLE IF NOT EXISTS product_customers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, customer_id)
);

-- 产品-物料绑定
CREATE TABLE IF NOT EXISTS product_bound_materials (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, material_id)
);

-- 产品工序
CREATE TABLE IF NOT EXISTS product_processes (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  sequence INTEGER DEFAULT 0,
  is_outsourced INTEGER DEFAULT 0,
  estimated_duration INTEGER DEFAULT 0,
  output_product_id INTEGER REFERENCES products(id),
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 工序物料
CREATE TABLE IF NOT EXISTS process_materials (
  id SERIAL PRIMARY KEY,
  product_process_id INTEGER NOT NULL REFERENCES product_processes(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT '公斤',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 订单
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  total_amount REAL DEFAULT 0,
  priority INTEGER DEFAULT 1,
  delivery_date DATE,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  remark TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 订单明细
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL DEFAULT 0,
  remark TEXT
);

-- 订单物料
CREATE TABLE IF NOT EXISTS order_materials (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  material_id INTEGER NOT NULL REFERENCES products(id),
  required_quantity INTEGER NOT NULL,
  picked_quantity INTEGER DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  real_name TEXT NOT NULL,
  user_type TEXT DEFAULT 'internal',
  department_id INTEGER REFERENCES departments(id),
  role_id INTEGER REFERENCES roles(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  customer_id INTEGER REFERENCES customers(id),
  status INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 库存
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT DEFAULT 'DEFAULT_BATCH',
  quantity INTEGER DEFAULT 0,
  locked_quantity INTEGER DEFAULT 0,
  supplier_batch_no TEXT,
  heat_no TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, product_id, batch_no)
);

-- 生产工单
CREATE TABLE IF NOT EXISTS production_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT,
  quantity INTEGER NOT NULL,
  completed_quantity INTEGER DEFAULT 0,
  current_process TEXT,
  operator TEXT,
  material_ready INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 生产工序记录
CREATE TABLE IF NOT EXISTS production_process_records (
  id SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  outsourcing_id INTEGER,
  operator TEXT,
  input_quantity INTEGER DEFAULT 0,
  output_quantity INTEGER DEFAULT 0,
  defect_quantity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 生产物料消耗
CREATE TABLE IF NOT EXISTS production_material_consumption (
  id SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id),
  process_id INTEGER NOT NULL REFERENCES processes(id),
  material_id INTEGER NOT NULL REFERENCES products(id),
  planned_quantity REAL DEFAULT 0,
  actual_quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '公斤',
  operator TEXT,
  supplier_batch_no TEXT,
  heat_no TEXT,
  batch_no TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 入库单
CREATE TABLE IF NOT EXISTS inbound_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  production_order_id INTEGER REFERENCES production_orders(id),
  purchase_order_id INTEGER,
  total_amount REAL DEFAULT 0,
  operator TEXT,
  inspector TEXT,
  inspection_result TEXT,
  status TEXT DEFAULT 'pending',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 入库明细
CREATE TABLE IF NOT EXISTS inbound_items (
  id SERIAL PRIMARY KEY,
  inbound_id INTEGER NOT NULL REFERENCES inbound_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT DEFAULT 'DEFAULT_BATCH',
  quantity INTEGER NOT NULL,
  input_quantity REAL,
  input_unit TEXT DEFAULT '公斤',
  unit_price REAL DEFAULT 0,
  supplier_batch_no TEXT,
  heat_no TEXT,
  remark TEXT
);

-- 入库检验
CREATE TABLE IF NOT EXISTS inbound_inspections (
  id SERIAL PRIMARY KEY,
  inspection_no TEXT UNIQUE NOT NULL,
  inbound_id INTEGER NOT NULL REFERENCES inbound_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  pass_quantity INTEGER DEFAULT 0,
  fail_quantity INTEGER DEFAULT 0,
  inspector TEXT,
  result TEXT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 出库单
CREATE TABLE IF NOT EXISTS outbound_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  target_warehouse_id INTEGER REFERENCES warehouses(id),
  order_id INTEGER REFERENCES orders(id),
  total_amount REAL DEFAULT 0,
  operator TEXT,
  status TEXT DEFAULT 'pending',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 出库明细
CREATE TABLE IF NOT EXISTS outbound_items (
  id SERIAL PRIMARY KEY,
  outbound_id INTEGER NOT NULL REFERENCES outbound_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT DEFAULT 'DEFAULT_BATCH',
  quantity INTEGER NOT NULL,
  input_quantity REAL,
  input_unit TEXT DEFAULT '公斤',
  unit_price REAL DEFAULT 0,
  remark TEXT
);

-- 领料单
CREATE TABLE IF NOT EXISTS pick_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  production_order_id INTEGER REFERENCES production_orders(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  type TEXT DEFAULT 'pick',
  operator TEXT,
  status TEXT DEFAULT 'pending',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 领料明细
CREATE TABLE IF NOT EXISTS pick_items (
  id SERIAL PRIMARY KEY,
  pick_order_id INTEGER NOT NULL REFERENCES pick_orders(id),
  material_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT DEFAULT 'DEFAULT_BATCH',
  quantity INTEGER NOT NULL,
  input_quantity REAL,
  input_unit TEXT DEFAULT '公斤',
  supplier_batch_no TEXT,
  heat_no TEXT,
  remark TEXT
);

-- 采购单
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  total_amount REAL DEFAULT 0,
  expected_date DATE,
  operator TEXT,
  status TEXT DEFAULT 'pending',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 采购明细
CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  unit_price REAL DEFAULT 0,
  remark TEXT
);

-- 委外加工单
CREATE TABLE IF NOT EXISTS outsourcing_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  production_order_id INTEGER REFERENCES production_orders(id),
  process_id INTEGER REFERENCES processes(id),
  total_amount REAL DEFAULT 0,
  expected_date DATE,
  operator TEXT,
  status TEXT DEFAULT 'pending',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 委外明细
CREATE TABLE IF NOT EXISTS outsourcing_items (
  id SERIAL PRIMARY KEY,
  outsourcing_order_id INTEGER NOT NULL REFERENCES outsourcing_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  returned_quantity INTEGER DEFAULT 0,
  unit_price REAL DEFAULT 0,
  remark TEXT
);

-- 委外检验
CREATE TABLE IF NOT EXISTS outsourcing_inspections (
  id SERIAL PRIMARY KEY,
  inspection_no TEXT UNIQUE NOT NULL,
  outsourcing_id INTEGER NOT NULL REFERENCES outsourcing_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  pass_quantity INTEGER DEFAULT 0,
  fail_quantity INTEGER DEFAULT 0,
  inspector TEXT,
  result TEXT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 巡检
CREATE TABLE IF NOT EXISTS patrol_inspections (
  id SERIAL PRIMARY KEY,
  inspection_no TEXT UNIQUE NOT NULL,
  production_order_id INTEGER REFERENCES production_orders(id),
  process_id INTEGER REFERENCES processes(id),
  product_id INTEGER REFERENCES products(id),
  inspector TEXT,
  result TEXT,
  defect_count INTEGER DEFAULT 0,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 终检
CREATE TABLE IF NOT EXISTS final_inspections (
  id SERIAL PRIMARY KEY,
  inspection_no TEXT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  production_order_id INTEGER REFERENCES production_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  pass_quantity INTEGER DEFAULT 0,
  fail_quantity INTEGER DEFAULT 0,
  inspector TEXT,
  result TEXT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 操作日志
CREATE TABLE IF NOT EXISTS operation_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  target_id TEXT,
  detail TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 盘点单
CREATE TABLE IF NOT EXISTS stocktake_orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  operator TEXT,
  status TEXT DEFAULT 'draft',
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 盘点明细
CREATE TABLE IF NOT EXISTS stocktake_items (
  id SERIAL PRIMARY KEY,
  stocktake_id INTEGER NOT NULL REFERENCES stocktake_orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT DEFAULT 'DEFAULT_BATCH',
  system_quantity REAL DEFAULT 0,
  actual_quantity REAL,
  difference REAL DEFAULT 0,
  remark TEXT
);

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  module TEXT,
  target_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 应付账款
CREATE TABLE IF NOT EXISTS payables (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  supplier_id INTEGER REFERENCES suppliers(id),
  amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid',
  due_date DATE,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 应收账款
CREATE TABLE IF NOT EXISTS receivables (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  customer_id INTEGER REFERENCES customers(id),
  amount REAL NOT NULL DEFAULT 0,
  received_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'unpaid',
  due_date DATE,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 收付款记录
CREATE TABLE IF NOT EXISTS payment_records (
  id SERIAL PRIMARY KEY,
  payable_id INTEGER,
  receivable_id INTEGER,
  amount REAL NOT NULL,
  payment_method TEXT DEFAULT 'bank',
  operator TEXT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 工位
CREATE TABLE IF NOT EXISTS workstations (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  process_id INTEGER REFERENCES processes(id),
  status INTEGER DEFAULT 1,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 打印模板
CREATE TABLE IF NOT EXISTS print_templates (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// 索引 DDL
const PG_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_production_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_order ON production_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_production_product ON production_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_production_process ON production_orders(current_process);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_batch ON inventory(batch_no);
CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_inbound_warehouse ON inbound_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_order_no ON inbound_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_outbound_warehouse ON outbound_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_outbound_order ON outbound_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_outbound_type ON outbound_orders(type);
CREATE INDEX IF NOT EXISTS idx_outbound_created ON outbound_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_target_warehouse ON outbound_orders(target_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_outsourcing_status ON outsourcing_orders(status);
CREATE INDEX IF NOT EXISTS idx_outsourcing_production ON outsourcing_orders(production_order_id);
CREATE INDEX IF NOT EXISTS idx_pick_status ON pick_orders(status);
CREATE INDEX IF NOT EXISTS idx_pick_order ON pick_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_pick_type ON pick_orders(type);
CREATE INDEX IF NOT EXISTS idx_process_records_production ON production_process_records(production_order_id);
CREATE INDEX IF NOT EXISTS idx_process_records_status ON production_process_records(status);
CREATE INDEX IF NOT EXISTS idx_final_inspection_result ON final_inspections(result);
CREATE INDEX IF NOT EXISTS idx_final_inspection_order ON final_inspections(order_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_status ON stocktake_orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status);
`;

async function migrate() {
  console.log('========================================');
  console.log('  SQLite → PostgreSQL 数据迁移工具');
  console.log('========================================\n');

  // 1. 连接 SQLite
  console.log('[1/5] 连接 SQLite 数据库...');
  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.pragma('journal_mode = WAL');

  // 获取 SQLite 中存在的表
  const sqliteTables = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(t => t.name);
  console.log(`  发现 ${sqliteTables.length} 张表: ${sqliteTables.join(', ')}`);

  // 2. 连接 PostgreSQL
  console.log('\n[2/5] 连接 PostgreSQL 数据库...');
  const client = await pool.connect();
  console.log(`  已连接到 ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  try {
    // 3. 清空旧表 + 创建表结构
    console.log('\n[3/6] 清空旧表并重建结构...');
    // 逆序 DROP（先删子表再删父表）
    const reversedTables = [...TABLE_ORDER].reverse();
    for (const t of reversedTables) {
      await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
    console.log('  旧表已清除');
    await client.query(PG_DDL);
    console.log('  新表结构创建完成');

    // 禁用外键触发器（允许按任意顺序插入数据）
    await client.query('SET session_replication_role = replica');

    // 4. 迁移数据（按依赖顺序）
    console.log('\n[4/6] 开始数据迁移（外键检查已暂停）...');
    let totalRows = 0;

    for (const tableName of TABLE_ORDER) {
      // 跳过 SQLite 中不存在的表
      if (!sqliteTables.includes(tableName)) {
        console.log(`  ⏭  ${tableName} - SQLite 中不存在，跳过`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
      if (rows.length === 0) {
        console.log(`  ⏭  ${tableName} - 无数据，跳过`);
        continue;
      }

      // 获取 PostgreSQL 中该表实际存在的列
      const pgColsResult = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [tableName]
      );
      const pgCols = pgColsResult.rows.map(r => r.column_name);

      // 取 SQLite 行的列和 PG 列的交集（只迁移两边都有的列）
      const sampleRow = rows[0];
      const sqliteCols = Object.keys(sampleRow);
      const commonCols = sqliteCols.filter(c => pgCols.includes(c));

      if (commonCols.length === 0) {
        console.log(`  ⚠️  ${tableName} - 无匹配列，跳过`);
        continue;
      }

      // 清空目标表（防止重复执行）
      await client.query(`DELETE FROM "${tableName}"`);

      // 批量插入
      const colNames = commonCols.map(c => `"${c}"`).join(', ');
      const placeholders = commonCols.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

      let inserted = 0;
      // 每 100 行一个事务批次
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        await client.query('BEGIN');
        try {
          for (const row of batch) {
            const values = commonCols.map(col => {
              const val = row[col];
              // SQLite 的 NULL 和 undefined 统一转 null
              if (val === undefined || val === null) return null;
              return val;
            });
            await client.query(insertSql, values);
            inserted++;
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ❌ ${tableName} 第 ${i+1}-${i+batch.length} 行插入失败:`, err.message);
          // 继续下一批
        }
      }

      // 重置序列（SERIAL 自增 ID）到当前最大值
      const hasId = commonCols.includes('id');
      if (hasId) {
        const maxIdResult = await client.query(`SELECT COALESCE(MAX(id), 0) as max_id FROM "${tableName}"`);
        const maxId = maxIdResult.rows[0].max_id;
        if (maxId > 0) {
          const seqName = `${tableName}_id_seq`;
          await client.query(`SELECT setval($1, $2, true)`, [seqName, maxId]);
        }
      }

      totalRows += inserted;
      console.log(`  ✅ ${tableName} - ${inserted}/${rows.length} 行`);
    }

    // 5. 恢复外键检查
    console.log('\n[5/6] 恢复外键约束...');
    await client.query('SET session_replication_role = DEFAULT');
    console.log('  外键约束已恢复');

    // 6. 创建索引
    console.log('\n[6/6] 创建索引...');
    await client.query(PG_INDEXES);
    console.log('  索引创建完成');

    console.log('\n========================================');
    console.log(`  迁移完成！共迁移 ${totalRows} 行数据`);
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

migrate().catch(console.error);
