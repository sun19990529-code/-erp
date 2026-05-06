const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'erp_mes'
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('正在添加拆批引擎所需字段...');
    
    // Add columns if they don't exist
    await client.query(`
      ALTER TABLE production_orders 
      ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES production_orders(id),
      ADD COLUMN IF NOT EXISTS split_reason TEXT,
      ADD COLUMN IF NOT EXISTS original_quantity INTEGER;
    `);
    console.log('✅ production_orders 字段添加成功');

    // Check if scrap warehouse exists
    const res = await client.query(`SELECT id FROM warehouses WHERE code = 'WH-SCRAP'`);
    if (res.rows.length === 0) {
      await client.query(`
        INSERT INTO warehouses (name, code, type, location, manager, status) 
        VALUES ('废品回收仓', 'WH-SCRAP', 'scrap', '废品区', '系统自动', 1)
      `);
      console.log('✅ 废品仓 (WH-SCRAP) 初始化成功');
    } else {
      console.log('✅ 废品仓已存在');
    }

    await client.query('COMMIT');
    console.log('🎉 数据库结构改造完成！');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败:', error);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
