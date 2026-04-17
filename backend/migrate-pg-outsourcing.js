const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'sqm17709021',
  database: process.env.DB_NAME || 'msgy-erp'
});

async function run() {
  const client = await pool.connect();
  try {
    const checkSql = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'production_order_id'`;
    const res = await client.query(checkSql);
    if (res.rows.length === 0) {
      console.log('添加 production_order_id 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN production_order_id INTEGER REFERENCES production_orders(id) ON DELETE SET NULL;');
    }
    
    const checkSql2 = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'process_id'`;
    const res2 = await client.query(checkSql2);
    if (res2.rows.length === 0) {
      console.log('添加 process_id 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL;');
    }

    const checkSql3 = `SELECT column_name FROM information_schema.columns WHERE table_name = 'outsourcing_items' AND column_name = 'received_quantity'`;
    const res3 = await client.query(checkSql3);
    if (res3.rows.length === 0) {
      console.log('添加 received_quantity 字段...');
      await client.query('ALTER TABLE outsourcing_items ADD COLUMN received_quantity INTEGER DEFAULT 0;');
    }
    console.log('字段升级完成！');
  } catch (err) {
    console.error('升级失败:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
