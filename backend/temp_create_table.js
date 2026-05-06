require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 54321,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'sqm17709021',
  database: process.env.DB_NAME || 'msgy-erp'
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL,
        wechat_webhook TEXT,
        is_active INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if we need to migrate existing data
    const res = await pool.query("SELECT * FROM ai_models LIMIT 1");
    if (res.rowCount === 0) {
      // Try to get data from system_settings if it exists
      try {
        const sysRes = await pool.query("SELECT value FROM system_settings WHERE key = 'ai_config'");
        if (sysRes.rowCount > 0) {
          const config = JSON.parse(sysRes.rows[0].value);
          if (config.apiKey) {
            await pool.query(`
              INSERT INTO ai_models (name, base_url, api_key, model, wechat_webhook, is_active)
              VALUES ($1, $2, $3, $4, $5, 1)
            `, ['默认模型配置 (已迁移)', config.baseUrl, config.apiKey, config.model, config.wechatWebhook || '']);
            console.log('Migrated existing configuration to ai_models.');
          }
        }
      } catch (e) {
        // system_settings might not exist, ignore
      }
    }
    
    console.log('Table ai_models created successfully');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
