const { Pool } = require('pg');
require('dotenv').config();

// 读取通用配置，适配本地/生产环境
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'sqm17709021',
  database: process.env.DB_NAME || 'msgy-erp'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('====== 开始执行 PostgreSQL 迁移 (委外模块 v2.2) ======');
    
    const checkSql1 = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'production_order_id'`;
    const res1 = await client.query(checkSql1);
    if (res1.rows.length === 0) {
      console.log('➡️ 添加 production_order_id 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN production_order_id INTEGER REFERENCES production_orders(id) ON DELETE SET NULL;');
    } else {
      console.log('✅ production_order_id 字段已存在');
    }
    
    const checkSql2 = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'process_id'`;
    const res2 = await client.query(checkSql2);
    if (res2.rows.length === 0) {
      console.log('➡️ 添加 process_id 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL;');
    } else {
      console.log('✅ process_id 字段已存在');
    }

    const checkSql3 = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'received_quantity'`;
    const res3 = await client.query(checkSql3);
    if (res3.rows.length === 0) {
      console.log('➡️ 添加 received_quantity 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN received_quantity INTEGER DEFAULT 0;');
    } else {
      console.log('✅ received_quantity 字段已存在');
    }
    
    console.log('====== 迁移完成！ ======');
  } catch (err) {
    console.error('❌ 升级失败:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
