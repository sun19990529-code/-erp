require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 54321,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : '',
      database: process.env.DB_NAME || 'msgy-erp',
    };

const pool = new Pool(poolConfig);

async function syncAll() {
  try {
    const columnsToAdd = [
      // inbound_items
      { table: 'inbound_items', name: 'input_quantity', type: 'REAL' },
      { table: 'inbound_items', name: 'input_unit', type: "VARCHAR(50) DEFAULT '公斤'" },
      { table: 'inbound_items', name: 'supplier_batch_no', type: 'VARCHAR(100)' },
      { table: 'inbound_items', name: 'heat_no', type: 'VARCHAR(100)' },
      { table: 'inbound_items', name: 'theoretical_weight', type: 'REAL' },
      { table: 'inbound_items', name: 'actual_weight', type: 'REAL' },
      
      // outbound_items
      { table: 'outbound_items', name: 'input_quantity', type: 'REAL' },
      { table: 'outbound_items', name: 'input_unit', type: "VARCHAR(50) DEFAULT '公斤'" },
      { table: 'outbound_items', name: 'theoretical_weight', type: 'REAL' },
      { table: 'outbound_items', name: 'actual_weight', type: 'REAL' },
      
      // outsourcing_items
      { table: 'outsourcing_items', name: 'pricing_unit', type: "VARCHAR(50) DEFAULT '公斤'" },
      { table: 'outsourcing_items', name: 'pricing_quantity', type: 'REAL DEFAULT 0' },
      
      // pick_items
      { table: 'pick_items', name: 'input_quantity', type: 'REAL' },
      { table: 'pick_items', name: 'input_unit', type: "VARCHAR(50) DEFAULT '公斤'" },
      { table: 'pick_items', name: 'supplier_batch_no', type: 'VARCHAR(100)' },
      { table: 'pick_items', name: 'heat_no', type: 'VARCHAR(100)' },
      
      // products
      { table: 'products', name: 'outer_diameter', type: 'REAL' },
      { table: 'products', name: 'inner_diameter', type: 'REAL' },
      { table: 'products', name: 'wall_thickness', type: 'REAL' },
      { table: 'products', name: 'length', type: 'REAL' },
      { table: 'products', name: 'min_stock', type: 'INTEGER DEFAULT 0' },
      { table: 'products', name: 'max_stock', type: 'INTEGER DEFAULT 0' },
      { table: 'products', name: 'material_category_id', type: 'INTEGER' },
      { table: 'products', name: 'tolerance_od', type: 'REAL' },
      { table: 'products', name: 'tolerance_id', type: 'REAL' },
      { table: 'products', name: 'tolerance_wt', type: 'REAL' },
      { table: 'products', name: 'tolerance_len', type: 'REAL' },
      { table: 'products', name: 'tolerance_od_lower', type: 'REAL' },
      { table: 'products', name: 'tolerance_id_lower', type: 'REAL' },
      { table: 'products', name: 'tolerance_wt_lower', type: 'REAL' },
      { table: 'products', name: 'tolerance_len_lower', type: 'REAL' },
      
      // inbound_orders
      { table: 'inbound_orders', name: 'production_order_id', type: 'INTEGER' },
      { table: 'inbound_orders', name: 'purchase_order_id', type: 'INTEGER' },
      
      // production_orders
      { table: 'production_orders', name: 'material_ready', type: 'INTEGER DEFAULT 0' },
      
      // outbound_orders
      { table: 'outbound_orders', name: 'target_warehouse_id', type: 'INTEGER' },
      
      // product_processes
      { table: 'product_processes', name: 'output_product_id', type: 'INTEGER' },
      
      // pick_orders
      { table: 'pick_orders', name: 'type', type: "VARCHAR(50) DEFAULT 'pick'" },
      
      // order_items
      { table: 'order_items', name: 'shipped_quantity', type: 'INTEGER DEFAULT 0' },
      
      // inventory
      { table: 'inventory', name: 'supplier_batch_no', type: 'VARCHAR(100)' },
      { table: 'inventory', name: 'heat_no', type: 'VARCHAR(100)' },
      
      // production_material_consumption
      { table: 'production_material_consumption', name: 'supplier_batch_no', type: 'VARCHAR(100)' },
      { table: 'production_material_consumption', name: 'heat_no', type: 'VARCHAR(100)' },
      { table: 'production_material_consumption', name: 'batch_no', type: 'VARCHAR(100)' }
    ];

    for (const col of columnsToAdd) {
      const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name=$1 AND column_name=$2;
      `, [col.table, col.name]);
      
      if (res.rows.length === 0) {
        await pool.query(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ [${col.table}] 已补充缺失字段: ${col.name}`);
      } else {
        // console.log(`ℹ️  [${col.table}] 字段已存在: ${col.name}`);
      }
    }

    console.log('🎉 所有表结构同步检查完成！');
  } catch (err) {
    console.error('❌ 同步失败:', err);
  } finally {
    pool.end();
  }
}

syncAll();