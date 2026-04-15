const sqlite3 = require('better-sqlite3');
const path = require('path');

const db = new sqlite3(path.join(__dirname, 'database.sqlite'));

try {
  db.exec("ALTER TABLE production_orders ADD COLUMN scrap_value REAL DEFAULT 0;");
  console.log("Migration successful: Added scrap_value to production_orders.");
} catch (e) {
  console.log("Skipped or error (maybe already exists): " + e.message);
}

db.close();
