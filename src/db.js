const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DB_FILE = process.env.PASTORAL_DB || path.join(ROOT, 'data', 'pastoral.db');
const UPLOAD_DIR = process.env.PASTORAL_UPLOADS || path.join(ROOT, 'data', 'uploads');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = { db, ROOT, DB_FILE, UPLOAD_DIR };
