const fs = require('fs');
const path = require('path');

// 初始化数据库
function initDatabase(db) {
  // ==================== 性能优化：WAL 模式 ====================
  // WAL (预写式日志) 允许并发读取，写入不再锁死整个数据库
  db.pragma('journal_mode = WAL');
  // NORMAL：写入后不等待磁盘同步，性能更好（WAL 模式下数据安全有保障）
  db.pragma('synchronous = NORMAL');
  // 64MB 查询缓存（默认 2MB），大幅减少磁盘 I/O
  db.pragma('cache_size = -64000');
  // 临时表存在内存中，避免磁盘临时文件
  db.pragma('temp_store = memory');
  // ============================================================

  // 注入兼容 better-sqlite3 与旧版 db.run 的方法
  db.run = function(sql, params) {
    if (params) {
      return this.prepare(sql).run(params);
    } else {
      return this.exec(sql);
    }
  };
  
  // 统一确保表结构存在
  createTablesIfNotExist(db);
  
  // 插入初始数据
  insertInitialData(db);

  // 权限补充迁移（不受 insertInitialData 的 early return 影响）
  ensurePermissionExists(db);
  
  // 打印模板补充迁移（提供初始的高级中文注释 HTML 模板）
  ensurePrintTemplates(db);
  
  console.log('数据库结构初始化完成！(WAL 模式已启用)');
  return db;
}

// 仅创建不存在的表（不删除数据）
function createTablesIfNotExist(db) {
  // 检查表是否存在，不存在则创建
  const tables = [
    { name: 'departments', sql: `CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'roles', sql: `CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, code TEXT UNIQUE NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'permissions', sql: `CREATE TABLE IF NOT EXISTS permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL, description TEXT)` },
    { name: 'role_permissions', sql: `CREATE TABLE IF NOT EXISTS role_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, role_id INTEGER NOT NULL, permission_id INTEGER NOT NULL, FOREIGN KEY (role_id) REFERENCES roles(id), FOREIGN KEY (permission_id) REFERENCES permissions(id), UNIQUE(role_id, permission_id))` },
    { name: 'users', sql: `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, real_name TEXT NOT NULL, user_type TEXT DEFAULT 'internal', department_id INTEGER, role_id INTEGER, supplier_id INTEGER, customer_id INTEGER, status INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (department_id) REFERENCES departments(id), FOREIGN KEY (role_id) REFERENCES roles(id), FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (customer_id) REFERENCES customers(id))` },
    { name: 'customers', sql: `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, contact_person TEXT, phone TEXT, email TEXT, address TEXT, credit_level TEXT, status INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'suppliers', sql: `CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, contact_person TEXT, phone TEXT, email TEXT, address TEXT, status INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
    { name: 'products', sql: `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, specification TEXT, unit TEXT, category TEXT NOT NULL, unit_price REAL, stock_threshold INTEGER DEFAULT 0, outer_diameter REAL, inner_diameter REAL, wall_thickness REAL, length REAL, supplier_id INTEGER, status INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id))` },
    { name: 'product_suppliers', sql: `CREATE TABLE IF NOT EXISTS product_suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL, is_default INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE, UNIQUE(product_id, supplier_id))` },
    { name: 'product_customers', sql: `CREATE TABLE IF NOT EXISTS product_customers (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, is_default INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE, UNIQUE(product_id, customer_id))` },
    { name: 'product_bound_materials', sql: `CREATE TABLE IF NOT EXISTS product_bound_materials (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, material_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES products(id) ON DELETE CASCADE, UNIQUE(product_id, material_id))` },
    { name: 'warehouses', sql: `CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL, location TEXT, manager TEXT, status INTEGER DEFAULT 1)` },
    { name: 'inventory', sql: `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id INTEGER NOT NULL, product_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', quantity INTEGER DEFAULT 0, locked_quantity INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (warehouse_id) REFERENCES warehouses(id), FOREIGN KEY (product_id) REFERENCES products(id), UNIQUE(warehouse_id, product_id, batch_no))` },
    { name: 'inbound_orders', sql: `CREATE TABLE IF NOT EXISTS inbound_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, type TEXT NOT NULL, warehouse_id INTEGER NOT NULL, supplier_id INTEGER, total_amount REAL DEFAULT 0, operator TEXT, inspector TEXT, inspection_result TEXT, status TEXT DEFAULT 'pending', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (warehouse_id) REFERENCES warehouses(id), FOREIGN KEY (supplier_id) REFERENCES suppliers(id))` },
    { name: 'inbound_items', sql: `CREATE TABLE IF NOT EXISTS inbound_items (id INTEGER PRIMARY KEY AUTOINCREMENT, inbound_id INTEGER NOT NULL, product_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', quantity INTEGER NOT NULL, input_quantity REAL, input_unit TEXT DEFAULT '公斤', unit_price REAL DEFAULT 0, remark TEXT, FOREIGN KEY (inbound_id) REFERENCES inbound_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'outbound_orders', sql: `CREATE TABLE IF NOT EXISTS outbound_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, type TEXT NOT NULL, warehouse_id INTEGER NOT NULL, order_id INTEGER, total_amount REAL DEFAULT 0, operator TEXT, status TEXT DEFAULT 'pending', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (warehouse_id) REFERENCES warehouses(id), FOREIGN KEY (order_id) REFERENCES orders(id))` },
    { name: 'outbound_items', sql: `CREATE TABLE IF NOT EXISTS outbound_items (id INTEGER PRIMARY KEY AUTOINCREMENT, outbound_id INTEGER NOT NULL, product_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', quantity INTEGER NOT NULL, input_quantity REAL, input_unit TEXT DEFAULT '公斤', unit_price REAL DEFAULT 0, remark TEXT, FOREIGN KEY (outbound_id) REFERENCES outbound_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'orders', sql: `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, customer_id INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT, customer_address TEXT, total_amount REAL DEFAULT 0, priority INTEGER DEFAULT 1, delivery_date DATE, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, remark TEXT, created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (customer_id) REFERENCES customers(id))` },
    { name: 'order_items', sql: `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, unit_price REAL DEFAULT 0, remark TEXT, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'order_materials', sql: `CREATE TABLE IF NOT EXISTS order_materials (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, material_id INTEGER NOT NULL, required_quantity INTEGER NOT NULL, picked_quantity INTEGER DEFAULT 0, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (material_id) REFERENCES products(id))` },
    { name: 'pick_orders', sql: `CREATE TABLE IF NOT EXISTS pick_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, order_id INTEGER, production_order_id INTEGER, warehouse_id INTEGER NOT NULL, operator TEXT, status TEXT DEFAULT 'pending', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (warehouse_id) REFERENCES warehouses(id))` },
    { name: 'pick_items', sql: `CREATE TABLE IF NOT EXISTS pick_items (id INTEGER PRIMARY KEY AUTOINCREMENT, pick_order_id INTEGER NOT NULL, material_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', quantity INTEGER NOT NULL, input_quantity REAL, input_unit TEXT DEFAULT '公斤', remark TEXT, FOREIGN KEY (pick_order_id) REFERENCES pick_orders(id), FOREIGN KEY (material_id) REFERENCES products(id))` },
    { name: 'production_orders', sql: `CREATE TABLE IF NOT EXISTS production_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, order_id INTEGER, product_id INTEGER NOT NULL, batch_no TEXT, quantity INTEGER NOT NULL, completed_quantity INTEGER DEFAULT 0, current_process TEXT, operator TEXT, status TEXT DEFAULT 'pending', start_time DATETIME, end_time DATETIME, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'processes', sql: `CREATE TABLE IF NOT EXISTS processes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, sequence INTEGER DEFAULT 0, description TEXT, status INTEGER DEFAULT 1)` },
    { name: 'product_processes', sql: `CREATE TABLE IF NOT EXISTS product_processes (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, process_id INTEGER NOT NULL, sequence INTEGER DEFAULT 0, is_outsourced INTEGER DEFAULT 0, estimated_duration INTEGER DEFAULT 0, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (process_id) REFERENCES processes(id))` },
    { name: 'process_materials', sql: `CREATE TABLE IF NOT EXISTS process_materials (id INTEGER PRIMARY KEY AUTOINCREMENT, product_process_id INTEGER NOT NULL, material_id INTEGER NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT DEFAULT '公斤', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_process_id) REFERENCES product_processes(id) ON DELETE CASCADE, FOREIGN KEY (material_id) REFERENCES products(id))` },
    { name: 'production_process_records', sql: `CREATE TABLE IF NOT EXISTS production_process_records (id INTEGER PRIMARY KEY AUTOINCREMENT, production_order_id INTEGER NOT NULL, process_id INTEGER NOT NULL, outsourcing_id INTEGER, operator TEXT, input_quantity INTEGER DEFAULT 0, output_quantity INTEGER DEFAULT 0, defect_quantity INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', start_time DATETIME, end_time DATETIME, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (process_id) REFERENCES processes(id), FOREIGN KEY (outsourcing_id) REFERENCES outsourcing_orders(id))` },
    { name: 'inbound_inspections', sql: `CREATE TABLE IF NOT EXISTS inbound_inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_no TEXT UNIQUE NOT NULL, inbound_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, pass_quantity INTEGER DEFAULT 0, fail_quantity INTEGER DEFAULT 0, inspector TEXT, result TEXT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (inbound_id) REFERENCES inbound_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'patrol_inspections', sql: `CREATE TABLE IF NOT EXISTS patrol_inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_no TEXT UNIQUE NOT NULL, production_order_id INTEGER, process_id INTEGER, product_id INTEGER, inspector TEXT, result TEXT, defect_count INTEGER DEFAULT 0, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (process_id) REFERENCES processes(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'outsourcing_inspections', sql: `CREATE TABLE IF NOT EXISTS outsourcing_inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_no TEXT UNIQUE NOT NULL, outsourcing_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, pass_quantity INTEGER DEFAULT 0, fail_quantity INTEGER DEFAULT 0, inspector TEXT, result TEXT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (outsourcing_id) REFERENCES outsourcing_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'final_inspections', sql: `CREATE TABLE IF NOT EXISTS final_inspections (id INTEGER PRIMARY KEY AUTOINCREMENT, inspection_no TEXT UNIQUE NOT NULL, order_id INTEGER, production_order_id INTEGER, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, pass_quantity INTEGER DEFAULT 0, fail_quantity INTEGER DEFAULT 0, inspector TEXT, result TEXT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'purchase_orders', sql: `CREATE TABLE IF NOT EXISTS purchase_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, supplier_id INTEGER NOT NULL, total_amount REAL DEFAULT 0, expected_date DATE, operator TEXT, status TEXT DEFAULT 'pending', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id))` },
    { name: 'purchase_items', sql: `CREATE TABLE IF NOT EXISTS purchase_items (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, received_quantity INTEGER DEFAULT 0, unit_price REAL DEFAULT 0, remark TEXT, FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'outsourcing_orders', sql: `CREATE TABLE IF NOT EXISTS outsourcing_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, supplier_id INTEGER NOT NULL, production_order_id INTEGER, process_id INTEGER, total_amount REAL DEFAULT 0, expected_date DATE, operator TEXT, status TEXT DEFAULT 'pending', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id), FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (process_id) REFERENCES processes(id))` },
    { name: 'outsourcing_items', sql: `CREATE TABLE IF NOT EXISTS outsourcing_items (id INTEGER PRIMARY KEY AUTOINCREMENT, outsourcing_order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, returned_quantity INTEGER DEFAULT 0, unit_price REAL DEFAULT 0, remark TEXT, FOREIGN KEY (outsourcing_order_id) REFERENCES outsourcing_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'operation_logs', sql: `CREATE TABLE IF NOT EXISTS operation_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, module TEXT NOT NULL, target_id TEXT, detail TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))` },
    { name: 'material_categories', sql: `CREATE TABLE IF NOT EXISTS material_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, parent_id INTEGER DEFAULT NULL, sort_order INTEGER DEFAULT 0, description TEXT, status INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (parent_id) REFERENCES material_categories(id))` },
    { name: 'production_material_consumption', sql: `CREATE TABLE IF NOT EXISTS production_material_consumption (id INTEGER PRIMARY KEY AUTOINCREMENT, production_order_id INTEGER NOT NULL, process_id INTEGER NOT NULL, material_id INTEGER NOT NULL, planned_quantity REAL DEFAULT 0, actual_quantity REAL DEFAULT 0, unit TEXT DEFAULT '公斤', operator TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (production_order_id) REFERENCES production_orders(id), FOREIGN KEY (process_id) REFERENCES processes(id), FOREIGN KEY (material_id) REFERENCES products(id))` },
    // v1.7.0 新增
    { name: 'stocktake_orders', sql: `CREATE TABLE IF NOT EXISTS stocktake_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, warehouse_id INTEGER NOT NULL, operator TEXT, status TEXT DEFAULT 'draft', remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (warehouse_id) REFERENCES warehouses(id))` },
    { name: 'stocktake_items', sql: `CREATE TABLE IF NOT EXISTS stocktake_items (id INTEGER PRIMARY KEY AUTOINCREMENT, stocktake_id INTEGER NOT NULL, product_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', system_quantity REAL DEFAULT 0, actual_quantity REAL, difference REAL DEFAULT 0, remark TEXT, FOREIGN KEY (stocktake_id) REFERENCES stocktake_orders(id), FOREIGN KEY (product_id) REFERENCES products(id))` },
    { name: 'notifications', sql: `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT, module TEXT, target_id INTEGER, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id))` },
    { name: 'payables', sql: `CREATE TABLE IF NOT EXISTS payables (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, type TEXT NOT NULL, source_type TEXT, source_id INTEGER, supplier_id INTEGER, amount REAL NOT NULL DEFAULT 0, paid_amount REAL DEFAULT 0, status TEXT DEFAULT 'unpaid', due_date DATE, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (supplier_id) REFERENCES suppliers(id))` },
    { name: 'receivables', sql: `CREATE TABLE IF NOT EXISTS receivables (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE NOT NULL, type TEXT NOT NULL, source_type TEXT, source_id INTEGER, customer_id INTEGER, amount REAL NOT NULL DEFAULT 0, received_amount REAL DEFAULT 0, status TEXT DEFAULT 'unpaid', due_date DATE, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (customer_id) REFERENCES customers(id))` },
    { name: 'payment_records', sql: `CREATE TABLE IF NOT EXISTS payment_records (id INTEGER PRIMARY KEY AUTOINCREMENT, payable_id INTEGER, receivable_id INTEGER, amount REAL NOT NULL, payment_method TEXT DEFAULT 'bank', operator TEXT, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)` },
    // v2.0 工位管理
    { name: 'workstations', sql: `CREATE TABLE IF NOT EXISTS workstations (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, process_id INTEGER, status INTEGER DEFAULT 1, remark TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (process_id) REFERENCES processes(id))` },
    // v2.1 打印模板管理引擎
    { name: 'print_templates', sql: `CREATE TABLE IF NOT EXISTS print_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL, is_default INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)` }
  ];
  
  tables.forEach(t => {
    db.run(t.sql);
  });
  
  // 为现有表添加新字段（如果不存在）
  try {
    const checkAndAddCol = (table, colName, addSql) => {
      const cols = db.pragma(`table_info(${table})`);
      if (cols.length > 0 && !cols.some(c => c.name === colName)) {
        db.exec(addSql);
      }
    };
    
    checkAndAddCol('inbound_items', 'input_unit', "ALTER TABLE inbound_items ADD COLUMN input_quantity REAL; ALTER TABLE inbound_items ADD COLUMN input_unit TEXT DEFAULT '公斤';");
    checkAndAddCol('outbound_items', 'input_unit', "ALTER TABLE outbound_items ADD COLUMN input_quantity REAL; ALTER TABLE outbound_items ADD COLUMN input_unit TEXT DEFAULT '公斤';");
    checkAndAddCol('pick_items', 'input_unit', "ALTER TABLE pick_items ADD COLUMN input_quantity REAL; ALTER TABLE pick_items ADD COLUMN input_unit TEXT DEFAULT '公斤';");
    
    checkAndAddCol('products', 'outer_diameter', "ALTER TABLE products ADD COLUMN outer_diameter REAL;");
    checkAndAddCol('products', 'inner_diameter', "ALTER TABLE products ADD COLUMN inner_diameter REAL;");
    checkAndAddCol('products', 'wall_thickness', "ALTER TABLE products ADD COLUMN wall_thickness REAL;");
    checkAndAddCol('products', 'length', "ALTER TABLE products ADD COLUMN length REAL;");
    checkAndAddCol('products', 'min_stock', "ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 0;");
    checkAndAddCol('products', 'max_stock', "ALTER TABLE products ADD COLUMN max_stock INTEGER DEFAULT 0;");
    
    checkAndAddCol('inbound_orders', 'production_order_id', "ALTER TABLE inbound_orders ADD COLUMN production_order_id INTEGER REFERENCES production_orders(id);");
    checkAndAddCol('inbound_orders', 'purchase_order_id', "ALTER TABLE inbound_orders ADD COLUMN purchase_order_id INTEGER REFERENCES purchase_orders(id);");
    checkAndAddCol('production_orders', 'material_ready', "ALTER TABLE production_orders ADD COLUMN material_ready INTEGER DEFAULT 0;");
    checkAndAddCol('products', 'material_category_id', "ALTER TABLE products ADD COLUMN material_category_id INTEGER REFERENCES material_categories(id);");
    
    // 调拨功能：出库单增加目标仓库字段
    checkAndAddCol('outbound_orders', 'target_warehouse_id', "ALTER TABLE outbound_orders ADD COLUMN target_warehouse_id INTEGER REFERENCES warehouses(id);");
    
    // 报工联动半成品：工序输出产物
    checkAndAddCol('product_processes', 'output_product_id', "ALTER TABLE product_processes ADD COLUMN output_product_id INTEGER REFERENCES products(id);");
    
    // 公差参数（上偏差）
    checkAndAddCol('products', 'tolerance_od', "ALTER TABLE products ADD COLUMN tolerance_od REAL;");
    checkAndAddCol('products', 'tolerance_id', "ALTER TABLE products ADD COLUMN tolerance_id REAL;");
    checkAndAddCol('products', 'tolerance_wt', "ALTER TABLE products ADD COLUMN tolerance_wt REAL;");
    checkAndAddCol('products', 'tolerance_len', "ALTER TABLE products ADD COLUMN tolerance_len REAL;");
    // 公差参数（下偏差，不填则与上偏差相同）
    checkAndAddCol('products', 'tolerance_od_lower', "ALTER TABLE products ADD COLUMN tolerance_od_lower REAL;");
    checkAndAddCol('products', 'tolerance_id_lower', "ALTER TABLE products ADD COLUMN tolerance_id_lower REAL;");
    checkAndAddCol('products', 'tolerance_wt_lower', "ALTER TABLE products ADD COLUMN tolerance_wt_lower REAL;");
    checkAndAddCol('products', 'tolerance_len_lower', "ALTER TABLE products ADD COLUMN tolerance_len_lower REAL;");
    
    // v1.7.0：领料单增加类型字段（pick=领料, return=退料）
    checkAndAddCol('pick_orders', 'type', "ALTER TABLE pick_orders ADD COLUMN type TEXT DEFAULT 'pick';");

    // v1.7.1：入库明细增加供应商批号和炉号（可选追溯字段）
    checkAndAddCol('inbound_items', 'supplier_batch_no', "ALTER TABLE inbound_items ADD COLUMN supplier_batch_no TEXT;");
    checkAndAddCol('inbound_items', 'heat_no', "ALTER TABLE inbound_items ADD COLUMN heat_no TEXT;");
    // 库存表也记录供应商批号和炉号，便于全链路追踪
    checkAndAddCol('inventory', 'supplier_batch_no', "ALTER TABLE inventory ADD COLUMN supplier_batch_no TEXT;");
    checkAndAddCol('inventory', 'heat_no', "ALTER TABLE inventory ADD COLUMN heat_no TEXT;");
    // 领料明细也继承追溯字段（领料时从库存自动带入）
    checkAndAddCol('pick_items', 'supplier_batch_no', "ALTER TABLE pick_items ADD COLUMN supplier_batch_no TEXT;");
    checkAndAddCol('pick_items', 'heat_no', "ALTER TABLE pick_items ADD COLUMN heat_no TEXT;");
    // 生产材料消耗记录补充追溯字段（报工扣料时记录来源批次的炉号/供应商批号）
    checkAndAddCol('production_material_consumption', 'supplier_batch_no', "ALTER TABLE production_material_consumption ADD COLUMN supplier_batch_no TEXT;");
    checkAndAddCol('production_material_consumption', 'heat_no', "ALTER TABLE production_material_consumption ADD COLUMN heat_no TEXT;");
    checkAndAddCol('production_material_consumption', 'batch_no', "ALTER TABLE production_material_consumption ADD COLUMN batch_no TEXT;");
    
  } catch (e) {
    console.log('字段添加跳过（可能已存在）:', e.message);
  }
  
  createIndexesIfNotExist(db);
}

// 创建索引（如果不存在）
function createIndexesIfNotExist(db) {
  const indexes = [
    // 订单相关索引
    { name: 'idx_orders_status', sql: 'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)' },
    { name: 'idx_orders_created', sql: 'CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)' },
    { name: 'idx_orders_customer', sql: 'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)' },
    { name: 'idx_orders_order_no', sql: 'CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no)' },
    { name: 'idx_orders_customer_name', sql: 'CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name)' },
    
    // 生产工单索引
    { name: 'idx_production_status', sql: 'CREATE INDEX IF NOT EXISTS idx_production_status ON production_orders(status)' },
    { name: 'idx_production_order', sql: 'CREATE INDEX IF NOT EXISTS idx_production_order ON production_orders(order_id)' },
    { name: 'idx_production_product', sql: 'CREATE INDEX IF NOT EXISTS idx_production_product ON production_orders(product_id)' },
    { name: 'idx_production_process', sql: 'CREATE INDEX IF NOT EXISTS idx_production_process ON production_orders(current_process)' },
    
    // 库存索引
    { name: 'idx_inventory_warehouse', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id)' },
    { name: 'idx_inventory_product', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id)' },
    
    // 入库单索引
    { name: 'idx_inbound_status', sql: 'CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_orders(status)' },
    { name: 'idx_inbound_warehouse', sql: 'CREATE INDEX IF NOT EXISTS idx_inbound_warehouse ON inbound_orders(warehouse_id)' },
    { name: 'idx_inbound_created', sql: 'CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_orders(created_at DESC)' },
    
    // 出库单索引
    { name: 'idx_outbound_status', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_orders(status)' },
    { name: 'idx_outbound_warehouse', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_warehouse ON outbound_orders(warehouse_id)' },
    { name: 'idx_outbound_order', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_order ON outbound_orders(order_id)' },
    
    // 采购单索引
    { name: 'idx_purchase_status', sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase_orders(status)' },
    { name: 'idx_purchase_supplier', sql: 'CREATE INDEX IF NOT EXISTS idx_purchase_supplier ON purchase_orders(supplier_id)' },
    
    // 委外加工单索引
    { name: 'idx_outsourcing_status', sql: 'CREATE INDEX IF NOT EXISTS idx_outsourcing_status ON outsourcing_orders(status)' },
    { name: 'idx_outsourcing_production', sql: 'CREATE INDEX IF NOT EXISTS idx_outsourcing_production ON outsourcing_orders(production_order_id)' },
    
    // 领料单索引
    { name: 'idx_pick_status', sql: 'CREATE INDEX IF NOT EXISTS idx_pick_status ON pick_orders(status)' },
    { name: 'idx_pick_order', sql: 'CREATE INDEX IF NOT EXISTS idx_pick_order ON pick_orders(order_id)' },
    
    // 工序记录索引
    { name: 'idx_process_records_production', sql: 'CREATE INDEX IF NOT EXISTS idx_process_records_production ON production_process_records(production_order_id)' },
    { name: 'idx_process_records_status', sql: 'CREATE INDEX IF NOT EXISTS idx_process_records_status ON production_process_records(status)' },
    
    // 检验索引
    { name: 'idx_final_inspection_result', sql: 'CREATE INDEX IF NOT EXISTS idx_final_inspection_result ON final_inspections(result)' },
    { name: 'idx_final_inspection_order', sql: 'CREATE INDEX IF NOT EXISTS idx_final_inspection_order ON final_inspections(order_id)' },
    // v1.7.0 索引
    { name: 'idx_pick_type', sql: 'CREATE INDEX IF NOT EXISTS idx_pick_type ON pick_orders(type)' },
    { name: 'idx_stocktake_status', sql: 'CREATE INDEX IF NOT EXISTS idx_stocktake_status ON stocktake_orders(status)' },
    { name: 'idx_notifications_user', sql: 'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)' },
    { name: 'idx_payables_status', sql: 'CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status)' },
    { name: 'idx_receivables_status', sql: 'CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(status)' },
    // 补充缺失索引
    { name: 'idx_inventory_updated', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at DESC)' },
    { name: 'idx_outbound_type', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_type ON outbound_orders(type)' },
    { name: 'idx_outbound_created', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_created ON outbound_orders(created_at DESC)' },
    { name: 'idx_outbound_target_warehouse', sql: 'CREATE INDEX IF NOT EXISTS idx_outbound_target_warehouse ON outbound_orders(target_warehouse_id)' },
    { name: 'idx_inbound_order_no', sql: 'CREATE INDEX IF NOT EXISTS idx_inbound_order_no ON inbound_orders(order_no)' },
    { name: 'idx_inventory_batch', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_batch ON inventory(batch_no)' },
  ];
  
  indexes.forEach(idx => {
    try {
      db.run(idx.sql);
    } catch (err) {
      console.error(`建表失败 (${idx.name}):`, err.message);
    }
  });

  // 批次管控系统（Batch Tracking）数据结构强迁移逻辑 
  try {
    const hasBatch = db.prepare("PRAGMA table_info(inventory)").all().some(c => c.name === 'batch_no');
    if (!hasBatch) {
      console.log('检测到旧版库存聚合模型，正在执行 [批次化全维度生命周期] 数据热迁移...');
      db.transaction(() => {
        // 核心库存表重建并保留数据
        db.exec(`CREATE TABLE inventory_new (id INTEGER PRIMARY KEY AUTOINCREMENT, warehouse_id INTEGER NOT NULL, product_id INTEGER NOT NULL, batch_no TEXT DEFAULT 'DEFAULT_BATCH', quantity INTEGER DEFAULT 0, locked_quantity INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (warehouse_id) REFERENCES warehouses(id), FOREIGN KEY (product_id) REFERENCES products(id), UNIQUE(warehouse_id, product_id, batch_no))`);
        db.exec(`INSERT INTO inventory_new (id, warehouse_id, product_id, quantity, locked_quantity, updated_at) SELECT id, warehouse_id, product_id, quantity, locked_quantity, updated_at FROM inventory`);
        db.exec(`DROP TABLE inventory`);
        db.exec(`ALTER TABLE inventory_new RENAME TO inventory`);
        
        // 周边单流表无缝增补字段
        db.exec(`ALTER TABLE inbound_items ADD COLUMN batch_no TEXT DEFAULT 'DEFAULT_BATCH'`);
        db.exec(`ALTER TABLE outbound_items ADD COLUMN batch_no TEXT DEFAULT 'DEFAULT_BATCH'`);
        db.exec(`ALTER TABLE pick_items ADD COLUMN batch_no TEXT DEFAULT 'DEFAULT_BATCH'`);
        db.exec(`ALTER TABLE production_orders ADD COLUMN batch_no TEXT`);
        
        // 构建加速检索索引
        db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_batch ON inventory(batch_no)`);
      })();
      console.log('数据热迁移完成：库存已从 [SKU/库] 聚合升级为 [SKU/库/批] 追溯模型！');
    }
  } catch (e) {
    console.error('批次管控结构热迁移遇到致命错误:', e.message);
  }

  // 产品-供应商绑定迁移
  try {
    const hasSupplierId = db.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'supplier_id');
    if (!hasSupplierId) {
      console.log('正在为 products 表添加 supplier_id 字段...');
      db.exec('ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)');
      console.log('supplier_id 字段添加完成');
    }
  } catch (e) {
    console.warn('products.supplier_id 迁移:', e.message);
  }

  console.log('数据库索引检查完成！');
}



function insertInitialData(db) {
  // ==================== 基础数据 ====================
  
  // 检查是否已有数据
  const deptCount = db.prepare("SELECT COUNT(*) as count FROM departments").get();
  if (deptCount && deptCount.count > 0) {
    console.log('初始数据已存在，跳过初始化');
    return;
  }
  
  // 默认部门
  db.run("INSERT INTO departments (name, description) VALUES ('生产部', '负责生产制造')");
  db.run("INSERT INTO departments (name, description) VALUES ('质检部', '负责质量检验')");
  db.run("INSERT INTO departments (name, description) VALUES ('仓库部', '负责仓储管理')");
  db.run("INSERT INTO departments (name, description) VALUES ('采购部', '负责采购业务')");
  db.run("INSERT INTO departments (name, description) VALUES ('销售部', '负责销售业务')");

  // 默认角色
  db.run("INSERT INTO roles (name, code, description) VALUES ('系统管理员', 'admin', '系统最高权限管理员')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('生产主管', 'production_manager', '生产部门主管')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('质检员', 'inspector', '质量检验人员')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('仓库管理员', 'warehouse_manager', '仓库管理人员')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('采购员', 'purchaser', '采购人员')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('销售员', 'salesman', '销售人员')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('供应商用户', 'supplier_user', '供应商外部用户')");
  db.run("INSERT INTO roles (name, code, description) VALUES ('客户用户', 'customer_user', '客户外部用户')");

  // 默认权限 - 扩展为操作级别权限
  const permissions = [
    // 仓库管理模块
    { name: '仓库管理-查看', code: 'warehouse_view', module: '仓库管理' },
    { name: '仓库管理-新增', code: 'warehouse_create', module: '仓库管理' },
    { name: '仓库管理-编辑', code: 'warehouse_edit', module: '仓库管理' },
    { name: '仓库管理-删除', code: 'warehouse_delete', module: '仓库管理' },
    // 订单管理模块
    { name: '订单管理-查看', code: 'order_view', module: '订单管理' },
    { name: '订单管理-新增', code: 'order_create', module: '订单管理' },
    { name: '订单管理-编辑', code: 'order_edit', module: '订单管理' },
    { name: '订单管理-删除', code: 'order_delete', module: '订单管理' },
    // 生产管理模块
    { name: '生产管理-查看', code: 'production_view', module: '生产管理' },
    { name: '生产管理-新增', code: 'production_create', module: '生产管理' },
    { name: '生产管理-编辑', code: 'production_edit', module: '生产管理' },
    { name: '生产管理-删除', code: 'production_delete', module: '生产管理' },
    // 质量检验模块
    { name: '质量检验-查看', code: 'inspection_view', module: '质量检验' },
    { name: '质量检验-新增', code: 'inspection_create', module: '质量检验' },
    { name: '质量检验-编辑', code: 'inspection_edit', module: '质量检验' },
    { name: '质量检验-删除', code: 'inspection_delete', module: '质量检验' },
    // 采购管理模块
    { name: '采购管理-查看', code: 'purchase_view', module: '采购管理' },
    { name: '采购管理-新增', code: 'purchase_create', module: '采购管理' },
    { name: '采购管理-编辑', code: 'purchase_edit', module: '采购管理' },
    { name: '采购管理-删除', code: 'purchase_delete', module: '采购管理' },
    // 委外加工模块
    { name: '委外加工-查看', code: 'outsourcing_view', module: '委外加工' },
    { name: '委外加工-新增', code: 'outsourcing_create', module: '委外加工' },
    { name: '委外加工-编辑', code: 'outsourcing_edit', module: '委外加工' },
    { name: '委外加工-删除', code: 'outsourcing_delete', module: '委外加工' },
    // 基础数据模块
    { name: '基础数据-查看', code: 'basic_data_view', module: '基础数据' },
    { name: '基础数据-新增', code: 'basic_data_create', module: '基础数据' },
    { name: '基础数据-编辑', code: 'basic_data_edit', module: '基础数据' },
    { name: '基础数据-删除', code: 'basic_data_delete', module: '基础数据' },
    // 仪表盘模块
    { name: '仪表盘-查看', code: 'dashboard_view', module: '仪表盘' }
  ];
  
  permissions.forEach(p => {
    db.run(`INSERT INTO permissions (name, code, module, description) VALUES (?, ?, ?, ?)`, 
      [p.name, p.code, p.module, p.name + '权限']);
  });

  // 给管理员角色分配所有权限
  for (let i = 1; i <= permissions.length; i++) {
    db.run(`INSERT INTO role_permissions (role_id, permission_id) VALUES (1, ?)`, [i]);
  }

  // 默认用户（密码使用 bcrypt 加密存储）
  const bcrypt = require('bcryptjs');
  const { BCRYPT_ROUNDS } = require('./config/security');
  const adminHash = bcrypt.hashSync('admin123', BCRYPT_ROUNDS);
  const userHash = bcrypt.hashSync('123456', BCRYPT_ROUNDS);
  db.run("INSERT INTO users (username, password, real_name, user_type, department_id, role_id, status) VALUES ('admin', ?, '系统管理员', 'internal', 1, 1, 1)", [adminHash]);
  db.run("INSERT INTO users (username, password, real_name, user_type, department_id, role_id, status) VALUES ('operator', ?, '操作员', 'internal', 1, 2, 1)", [userHash]);
  db.run("INSERT INTO users (username, password, real_name, user_type, department_id, role_id, status) VALUES ('inspector', ?, '质检员张三', 'internal', 2, 3, 1)", [userHash]);

  // 默认客户
  db.run("INSERT INTO customers (name, code, contact_person, phone, email, address, credit_level) VALUES ('客户A', 'C001', '张经理', '13900000001', 'a@customer.com', '上海市浦东新区', 'A')");
  db.run("INSERT INTO customers (name, code, contact_person, phone, email, address, credit_level) VALUES ('客户B', 'C002', '李经理', '13900000002', 'b@customer.com', '北京市朝阳区', 'B')");

  // 默认供应商
  db.run("INSERT INTO suppliers (name, code, contact_person, phone, email) VALUES ('供应商A', 'S001', '联系人A', '13800000001', 'a@supplier.com')");
  db.run("INSERT INTO suppliers (name, code, contact_person, phone, email) VALUES ('供应商B', 'S002', '联系人B', '13800000002', 'b@supplier.com')");

  // 默认仓库
  db.run("INSERT INTO warehouses (name, code, type, location, manager) VALUES ('原材料仓库', 'WH001', 'raw', 'A区', '张三')");
  db.run("INSERT INTO warehouses (name, code, type, location, manager) VALUES ('半成品仓库', 'WH002', 'semi', 'B区', '李四')");
  db.run("INSERT INTO warehouses (name, code, type, location, manager) VALUES ('成品仓库', 'WH003', 'finished', 'C区', '王五')");

  // 默认工序
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('轧机', 'ROLLING', 1, '轧机加工工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('校直', 'STRAIGHTENING', 2, '校直工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('抛光', 'POLISHING', 3, '抛光工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('矫直', 'CORRECTING', 4, '矫直工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('切割', 'CUTTING', 5, '切割工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('拉拔', 'DRAWING', 6, '拉拔工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('清洗', 'CLEANING', 7, '清洗工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('线切割', 'WIRE_CUTTING', 8, '线切割工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('激光切割', 'LASER_CUTTING', 9, '激光切割工序')");
  db.run("INSERT INTO processes (name, code, sequence, description) VALUES ('热处理', 'HEAT_TREATMENT', 10, '热处理工序')");

  // 默认材质分类
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('不锈钢', NULL, 1, '不锈钢系列材料')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('304', 1, 1, '304不锈钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('304L', 1, 2, '304L不锈钢（低碳）')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('316', 1, 3, '316不锈钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('316L', 1, 4, '316L不锈钢（低碳）')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('铜材', NULL, 2, '铜及铜合金材料')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('T2 紫铜', 6, 1, 'T2紫铜')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('H62 黄铜', 6, 2, 'H62黄铜')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('磷铜', 6, 3, '磷青铜')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('铝材', NULL, 3, '铝及铝合金材料')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('6061 铝合金', 10, 1, '6061铝合金')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('6063 铝合金', 10, 2, '6063铝合金')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('碳钢', NULL, 4, '碳素结构钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('45# 碳钢', 13, 1, '45号碳钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('Q235 碳钢', 13, 2, 'Q235碳钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('合金钢', NULL, 5, '合金钢材料')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('40Cr', 16, 1, '40Cr合金钢')");
  db.run("INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES ('其他辅料', NULL, 6, '辅助材料')");

  // 示例产品
  db.run("INSERT INTO products (code, name, specification, unit, category, unit_price) VALUES ('P001', '成品A', '规格A', '件', '成品', 100)");
  db.run("INSERT INTO products (code, name, specification, unit, category, unit_price) VALUES ('P002', '成品B', '规格B', '件', '成品', 150)");
  db.run("INSERT INTO products (code, name, specification, unit, category, unit_price) VALUES ('M001', '原材料X', '规格X', 'kg', '原材料', 50)");
  db.run("INSERT INTO products (code, name, specification, unit, category, unit_price) VALUES ('M002', '原材料Y', '规格Y', 'kg', '原材料', 80)");
  db.run("INSERT INTO products (code, name, specification, unit, category, unit_price) VALUES ('S001', '半成品A', '规格SA', '件', '半成品', 70)");
}

// 权限补充迁移：确保新增权限在现有数据库中也存在
function ensurePermissionExists(db) {
  const required = [
    { name: '仪表盘-查看', code: 'dashboard_view', module: '仪表盘' },
    { name: '财务-查看', code: 'finance_view', module: '财务管理' },
    { name: '财务-编辑', code: 'finance_edit', module: '财务管理' }
  ];
  // 获取 admin 角色 ID（通常为 1）
  const adminRole = db.prepare("SELECT id FROM roles WHERE code = 'admin'").get();
  required.forEach(p => {
    const exists = db.prepare('SELECT id FROM permissions WHERE code = ?').get(p.code);
    if (!exists) {
      const result = db.run('INSERT INTO permissions (name, code, module, description) VALUES (?, ?, ?, ?)',
        [p.name, p.code, p.module, p.name + '权限']);
      console.log(`[迁移] 添加权限: ${p.code}`);
      // 自动将新权限分配给 admin 角色
      if (adminRole) {
        const alreadyAssigned = db.prepare('SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ?')
          .get(adminRole.id, result.lastInsertRowid);
        if (!alreadyAssigned) {
          db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [adminRole.id, result.lastInsertRowid]);
          console.log(`[迁移] 已将 ${p.code} 分配给管理员角色`);
        }
      }
    }
  });
}

// 供热更新注入默认打印模板
function ensurePrintTemplates(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM print_templates').get().c;
  if (count === 0) {
    console.log('[迁移] 发现 print_templates 为空，正在灌入高级默认模板...');
    const defaultTemplates = [
      {
        type: 'inbound',
        name: '标准A4采购入库单',
        is_default: 1,
        content: `<!-- 
  =============================================
  标准采购入库单 HTML 打印模板 (A4 横向设计)
  使用说明：
  1. 所有嵌套在 {{大括号}} 里面的部分会被系统自动替换为真实出入库数据。
  2. <style> 标签里定义了打印格式，非专业前端请勿随意更改 @media print 的部分！
  3. 如需修改公司名，请直接将下方的 "铭晟管理系统专用" 替换成您的公司名。
  =============================================
-->
<style>
  /* 全局基础字体和边距设置 */
  .print-container { font-family: "Microsoft YaHei", "SimHei", sans-serif; color: #111; padding: 20px; font-size: 14px; }
  /* 单据主标题的大字号剧中 */
  .doc-title { text-align: center; font-size: 26px; font-weight: bold; margin-bottom: 20px; letter-spacing: 2px; }
  /* 表头与单据信息分两栏（如单号、日期在左，供应商在右） */
  .meta-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; }
  /* 定义商品明细表格的边框线和留白 */
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .data-table th, .data-table td { border: 1px solid #333; padding: 8px 12px; text-align: left; }
  .data-table th { background-color: #f3f4f6; font-weight: bold; }
  /* 底部签字区的留白排版 */
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
  
  /* 专用于物理打印机的核心排版控制 */
  @media print {
    @page { size: A4 portrait; margin: 10mm; } /* 定义为 A4 纵向，四边留白 10 毫米 */
    body { -webkit-print-color-adjust: exact; margin: 0; }
  }
</style>

<div class="print-container">
  <!-- 此处为您公司的固定抬头 -->
  <div class="doc-title">铭晟管理系统 · 采购入库单</div>

  <!-- 单据的动态核心基础信息 -->
  <div class="meta-info">
    <div>
      <p><strong>单据编号：</strong> {{order_no}}</p>
      <p><strong>入库仓库：</strong> {{warehouse_name}}</p>
    </div>
    <div style="text-align: right;">
      <p><strong>供应商名称：</strong> {{supplier_name}}</p>
      <p><strong>入库时间：</strong> {{created_at}}</p>
    </div>
  </div>

  <!-- 用以展现具体出库/入库几件商品的表格 -->
  <table class="data-table">
    <thead>
      <tr>
        <th width="5%">序号</th>
        <th width="15%">物料编码</th>
        <th width="30%">物料名称与规格</th>
        <th width="15%">入库批次</th>
        <th width="15%">数量</th>
        <th width="20%">备注信息</th>
      </tr>
    </thead>
    <tbody>
      <!-- 【注意：这段注释内是循环渲染区，不要改这里的 HTML 标签层级】 -->
      <!-- LOOP_ITEMS_START -->
      <tr>
        <td>{{index}}</td>
        <td>{{product_code}}</td>
        <td>{{product_name}} ({{specification}})</td>
        <td>{{batch_no}}</td>
        <td><strong>{{quantity}}</strong> {{unit}}</td>
        <td>{{remark}}</td>
      </tr>
      <!-- LOOP_ITEMS_END -->
    </tbody>
  </table>

  <!-- 底部固定签字区 -->
  <div class="signatures">
    <div>仓管员签字：_____________________</div>
    <div>交货人签字：_____________________</div>
    <div>财务复核：_____________________</div>
  </div>
</div>`
      },
      {
        type: 'outbound',
        name: '标准A4销售出库单',
        is_default: 1,
        content: `<!-- =================销售发货专用模板================= -->
<style>
  .print-container { font-family: sans-serif; padding: 20px; color: #000; }
  .header { text-align: center; margin-bottom: 30px; position: relative; }
  .title { font-size: 28px; font-weight: bold; }
  .subtitle { font-size: 16px; color: #555; margin-top: 5px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th, td { border: 1px solid #111; padding: 10px; text-align: left; }
  th { background: #eee; }
  .footer-meta { font-size: 14px; display: flex; justify-content: space-between; margin-top: 40px; }
  @media print { @page { size: A4 landscape; margin: 15mm; } }
</style>
<div class="print-container">
  <div class="header">
    <div class="title">出库/发货送货单</div>
    <div class="subtitle">发至客户，请妥善保管并签字后随车带回</div>
  </div>
  <div class="meta">
    <div><strong>单号：</strong> {{order_no}}</div>
    <div><strong>出库仓：</strong> {{warehouse_name}}</div>
    <div><strong>日期：</strong> {{created_at}}</div>
    <div><strong>对应的销售单号：</strong> {{ref_order_no}}</div>
    <div><strong>客户名称：</strong> {{customer_name}}</div>
  </div>
  <table>
    <thead><tr>
      <th width="5%">序号</th><th>料号</th><th>品名规格</th><th>出库批次</th><th>发货数量</th>
    </tr></thead>
    <tbody>
      <!-- LOOP_ITEMS_START -->
      <tr>
        <td>{{index}}</td><td>{{product_code}}</td><td>{{product_name}} / {{specification}}</td>
        <td>{{batch_no}}</td><td style="font-weight:bold;font-size:16px;">{{quantity}} {{unit}}</td>
      </tr>
      <!-- LOOP_ITEMS_END -->
    </tbody>
  </table>
  <div class="footer-meta">
    <span>司机/承运人签字：______________</span>
    <span>收货方当面盖章签收：______________</span>
  </div>
</div>`
      },
      {
        type: 'production',
        name: '标准车间生产工单排产卡',
        is_default: 1,
        content: `<!-- =================车间用于派工和领班的任务单排版================= -->
<style>
  .card-container { font-family: "Microsoft YaHei", sans-serif; box-sizing: border-box; }
  .task-header { display: flex; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 20px; }
  .task-qr { width: 100px; height: 100px; background: #eee; flex-shrink: 0; display:flex; align-items:center; justify-content:center; border: 1px dashed #999; }
  .task-title { flex: 1; text-align: center; }
  .task-title h1 { margin:0; font-size:32px; letter-spacing:4px;}
  .task-title p { margin: 5px 0 0; font-size:18px;}
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align:center;}
  th, td { border: 2px solid #000; padding: 12px 8px; font-size: 16px; }
  th { background: #f0f0f0; width: 15%; }
  td { width: 35%; }
  .process-list { width:100%; }
  .process-list th { background: #fff; border: 1px solid #333; }
  .process-list td { border: 1px solid #333; height: 60px; /* 留出供工人手写打钩的空间 */ }
  @media print { @page { size: A4 portrait; margin: 10mm; } }
</style>
<div class="card-container">
  <div class="task-header">
    <div class="task-title">
      <h1>生产流转派工单 (工卡)</h1>
      <p>订单需求号：{{ref_order_no}}</p>
    </div>
    <!-- 这里可由外部二维码引擎渲染替换 -->
    <div class="task-qr">工单条码区<br/>{{order_no}}</div>
  </div>
  
  <table>
    <tr>
      <th>工单流水号</th><td style="font-weight:bold;">{{order_no}}</td>
      <th>下达日期</th><td>{{created_at}}</td>
    </tr>
    <tr>
      <th>生产成品</th><td colspan="3" style="font-size:20px;font-weight:bold;">{{product_name}} ({{specification}})</td>
    </tr>
    <tr>
      <th>总派工数量</th><td style="font-size:24px;font-weight:bold;">{{quantity}} {{unit}}</td>
      <th>生产批号</th><td style="font-size:18px;">{{batch_no}}</td>
    </tr>
  </table>

  <h3 style="margin-top:30px;border-left:4px solid #000;padding-left:10px;">工艺路线及工人报工背书栏</h3>
  <table class="process-list">
    <thead>
      <tr><th>工序排序</th><th>工序名称</th><th>加工要求与说明</th><th>操作工签字</th><th>完成数量</th><th>检验员签字</th></tr>
    </thead>
    <tbody>
      <!-- LOOP_PROCESSES_START -->
      <tr>
        <td>{{sequence}}</td><td><strong>{{process_name}}</strong></td>
        <td style="text-align:left;font-size:14px;">{{remark}}</td>
        <td></td><td></td><td></td>
      </tr>
      <!-- LOOP_PROCESSES_END -->
    </tbody>
  </table>
</div>`
      }
    ];

    const insertStmt = db.prepare('INSERT INTO print_templates (type, name, content, is_default) VALUES (?, ?, ?, ?)');
    db.transaction(() => {
      defaultTemplates.forEach(t => insertStmt.run(t.type, t.name, t.content, t.is_default));
    })();
    console.log('[迁移] 成功灌入 3 套核心业务打印模板！');
  }
}

// 导出初始化函数
module.exports = { initDatabase };
