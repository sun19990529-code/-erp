require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'msgy-erp',
});

async function run() {
  try {
    await pool.query('ALTER TABLE production_orders ADD COLUMN scrap_value REAL DEFAULT 0');
    console.log('Successfully added scrap_value to production_orders');
  } catch (e) {
    if (e.code === '42701') {
      console.log('Column scrap_value already exists');
    } else {
      console.error(e);
    }
  } finally {
    pool.end();
  }
}
run();
