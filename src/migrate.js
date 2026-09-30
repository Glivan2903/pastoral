// Runner de migrations: migrations/NNN_nome.sql, seção de rollback após "-- @down".
const fs = require('fs');
const path = require('path');
const { db, ROOT } = require('./db');

const DIR = path.join(ROOT, 'migrations');

function carregar() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((nome) => {
      const [up, down = ''] = fs.readFileSync(path.join(DIR, nome), 'utf8').split(/^-- @down\s*$/m);
      return { nome, up, down };
    });
}

function garantirTabela() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nome TEXT PRIMARY KEY,
    lote INTEGER NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

const aplicadas = () => new Set(db.prepare('SELECT nome FROM schema_migrations').all().map((r) => r.nome));

function up() {
  garantirTabela();
  const feitas = aplicadas();
  const pendentes = carregar().filter((m) => !feitas.has(m.nome));
  if (!pendentes.length) return console.log('Nada a migrar.');
  const lote = (db.prepare('SELECT COALESCE(MAX(lote), 0) AS l FROM schema_migrations').get().l) + 1;
  for (const m of pendentes) {
    db.transaction(() => {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_migrations (nome, lote) VALUES (?, ?)').run(m.nome, lote);
    })();
    console.log(`↑ ${m.nome}`);
  }
}

function down() {
  garantirTabela();
  const lote = db.prepare('SELECT MAX(lote) AS l FROM schema_migrations').get().l;
  if (!lote) return console.log('Nada a reverter.');
  const nomes = db.prepare('SELECT nome FROM schema_migrations WHERE lote = ? ORDER BY nome DESC').all(lote);
  const todas = new Map(carregar().map((m) => [m.nome, m]));
  for (const { nome } of nomes) {
    db.transaction(() => {
      db.exec(todas.get(nome).down);
      db.prepare('DELETE FROM schema_migrations WHERE nome = ?').run(nome);
    })();
    console.log(`↓ ${nome}`);
  }
}

function status() {
  garantirTabela();
  const feitas = aplicadas();
  for (const m of carregar()) console.log(`${feitas.has(m.nome) ? '[x]' : '[ ]'} ${m.nome}`);
}

module.exports = { up, down, status };

if (require.main === module) {
  const cmd = process.argv[2] || 'up';
  const acoes = { up, down, status };
  if (!acoes[cmd]) {
    console.error('Uso: node src/migrate.js [up|down|status]');
    process.exit(1);
  }
  acoes[cmd]();
}
