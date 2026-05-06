require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 54321,
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_NAME || 'msgy-erp',
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workstations (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        process_name VARCHAR(100) NOT NULL,
        lines_count INTEGER DEFAULT 1,
        schema_config JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Check if products table has density column
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' and column_name='density';
    `);
    
    if (res.rows.length === 0) {
      await pool.query(`
        ALTER TABLE products ADD COLUMN density NUMERIC(10,5) DEFAULT 0.02491;
      `);
      console.log('Added density column to products.');
    }
    
    // Adding workstation and line references to production_process_records
    const res2 = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='production_process_records' and column_name='workstation_id';
    `);
    
    if (res2.rows.length === 0) {
      await pool.query(`
        ALTER TABLE production_process_records 
        ADD COLUMN workstation_id INTEGER,
        ADD COLUMN line_no INTEGER,
        ADD COLUMN parameter_data JSONB DEFAULT '{}';
      `);
      console.log('Added workstation_id, line_no, parameter_data to production_process_records.');
    }

    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
