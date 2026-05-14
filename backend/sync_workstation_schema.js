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

async function sync() {
  try {
    // 1. 确保表存在
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workstations (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 2. 检查并添加各种可能的遗漏字段
    const columnsToAdd = [
      { name: 'process_id', type: 'INTEGER' },
      { name: 'process_name', type: 'VARCHAR(100)' },
      { name: 'remark', type: 'TEXT' },
      { name: 'type', type: 'VARCHAR(50)' },
      { name: 'lines_count', type: 'INTEGER DEFAULT 1' },
      { name: 'schema_config', type: "JSONB DEFAULT '{}'" },
      { name: 'bound_operator', type: 'VARCHAR(100)' }
    ];

    for (const col of columnsToAdd) {
      const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='workstations' AND column_name=$1;
      `, [col.name]);
      
      if (res.rows.length === 0) {
        await pool.query(`ALTER TABLE workstations ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ 已补充字段: ${col.name}`);
      } else {
        console.log(`ℹ️  字段已存在: ${col.name}`);
      }
    }

    console.log('🎉 Workstations 表结构同步完成！');
  } catch (err) {
    console.error('❌ 同步失败:', err);
  } finally {
    pool.end();
  }
}

sync();