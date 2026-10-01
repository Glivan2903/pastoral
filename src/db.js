// Acesso ao Postgres (Supabase). Mantém a interface db.prepare(sql).get/all/run e db.transaction(fn),
// agora assíncrona, e traduz os poucos idiomas de SQLite que o resto do código ainda usa.
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = process.env.PASTORAL_UPLOADS || path.join(ROOT, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.DATABASE_URL && fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL (connection string do Postgres do Supabase) no .env.');

types.setTypeParser(20, Number); // COUNT/SUM chegam como bigint; os valores do sistema cabem em Number

const SCHEMA = process.env.PASTORAL_SCHEMA || null; // testes usam um schema próprio
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || (process.env.VERCEL ? 2 : 5),
});
pool.on('error', (e) => console.error('[pg]', e.message));
if (SCHEMA) pool.on('connect', (c) => c.query(`SET search_path TO "${SCHEMA}", public`));

const als = new AsyncLocalStorage();
const exec = () => als.getStore() || pool;

const COM_ID = /^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(usuarios|encontros|presencas|avisos|auditoria|lancamentos|eventos|fotos|notificacoes)\b/i;
const cache = new Map();

function traduzir(sql) {
  let s = sql
    .replace(/datetime\('now'\s*,\s*/gi, "agora(")
    .replace(/datetime\('now'\)/gi, 'agora()')
    .replace(/\bstrftime\('%d',\s*(\w+)\)/gi, "to_char($1::date, 'DD')")
    .replace(/\bstrftime\('%m',\s*(\w+)\)/gi, "to_char($1::date, 'MM')")
    .replace(/([\w.]+)\s+COLLATE\s+NOCASE/gi, 'LOWER($1)')
    .replace(/\bLIKE\b/g, 'ILIKE');
  if (/^\s*INSERT\s+OR\s+IGNORE/i.test(s)) s = s.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
  if (COM_ID.test(s) && !/\bRETURNING\b/i.test(s)) s += ' RETURNING id';
  return s;
}

function preparar(sql, args) {
  const chave = sql;
  let t = cache.get(chave);
  if (!t) cache.set(chave, (t = traduzir(sql)));
  const nomeado = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Date);
  const valores = [];
  if (nomeado) {
    const idx = new Map();
    const text = t.replace(/@(\w+)/g, (_, n) => {
      if (!idx.has(n)) { valores.push(args[0][n] === undefined ? null : args[0][n]); idx.set(n, valores.length); }
      return `$${idx.get(n)}`;
    });
    return { text, valores };
  }
  let i = 0;
  const text = t.replace(/\?/g, () => `$${++i}`);
  return { text, valores: args.map((v) => (v === undefined ? null : v)) };
}

const db = {
  prepare(sql) {
    return {
      get: async (...args) => { const q = preparar(sql, args); return (await exec().query(q.text, q.valores)).rows[0]; },
      all: async (...args) => { const q = preparar(sql, args); return (await exec().query(q.text, q.valores)).rows; },
      run: async (...args) => {
        const q = preparar(sql, args);
        const r = await exec().query(q.text, q.valores);
        return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
      },
    };
  },
  exec: (sql) => exec().query(sql),
  // SQL já em Postgres ($1, $2...), na conexão da transação em curso quando houver.
  pool: { query: (text, valores) => exec().query(text, valores) },
  // Devolve uma função assíncrona; chamadas de db dentro dela usam a mesma conexão (e o mesmo BEGIN/COMMIT).
  transaction: (fn) => async (...args) => {
    if (als.getStore()) return fn(...args); // já está numa transação
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await als.run(client, () => fn(...args));
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
  async iniciar() {
    if (SCHEMA) await pool.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
  },
  async apagarSchema() {
    if (SCHEMA) await pool.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  },
  fechar: () => pool.end(),
};

module.exports = { db, ROOT, UPLOAD_DIR, SCHEMA };
