const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 54321,
  user: 'postgres',
  password: 'sqm17709021',
  database: 'msgy-erp'
});

pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position`)
  .then(r => {
    r.rows.forEach(x => console.log(x.column_name));
    pool.end();
  })
  .catch(e => {
    console.error(e.message);
    pool.end();
  });
