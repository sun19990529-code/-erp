/**
 * 迁移脚本：给 workstations 表添加 bound_operator 字段
 * 用于存储绑定的操作员姓名（一个工位绑定一个操作员，一人可绑定多台机器）
 * 
 * 执行: node migrate_workstation_operator.js
 */
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
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='workstations' AND column_name='bound_operator';
    `);

    if (res.rows.length === 0) {
      await pool.query(`
        ALTER TABLE workstations 
        ADD COLUMN bound_operator VARCHAR(100) DEFAULT NULL;
      `);
      console.log('✅ 已为 workstations 表添加 bound_operator 字段');
    } else {
      console.log('ℹ️  bound_operator 字段已存在，跳过');
    }

    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
