// Runner de migrations: migrations/NNN_nome.sql, seção de rollback após "-- @down".
const fs = require('fs');
const path = require('path');
const { db, ROOT } = require('./db');

const DIR = path.join(ROOT, 'migrations');
const TRAVA = 727001; // advisory lock: duas instâncias subindo juntas não migram ao mesmo tempo

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

async function garantirTabela() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nome TEXT PRIMARY KEY,
    lote INTEGER NOT NULL,
    aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

const aplicadas = async () => new Set((await db.prepare('SELECT nome FROM schema_migrations').all()).map((r) => r.nome));

// Executa fn dentro de uma transação que segura a trava de migração.
const comTrava = (fn) => db.transaction(async () => {
  await db.prepare('SELECT pg_advisory_xact_lock(?)').get(TRAVA);
  return fn();
})();

async function up() {
  await db.iniciar();
  await garantirTabela();
  return comTrava(async () => {
    const feitas = await aplicadas();
    const pendentes = carregar().filter((m) => !feitas.has(m.nome));
    if (!pendentes.length) return console.log('Nada a migrar.');
    const lote = (await db.prepare('SELECT COALESCE(MAX(lote), 0) AS l FROM schema_migrations').get()).l + 1;
    for (const m of pendentes) {
      await db.exec(m.up);
      await db.prepare('INSERT INTO schema_migrations (nome, lote) VALUES (?, ?)').run(m.nome, lote);
      console.log(`↑ ${m.nome}`);
    }
  });
}

async function down() {
  await garantirTabela();
  return comTrava(async () => {
    const lote = (await db.prepare('SELECT MAX(lote) AS l FROM schema_migrations').get()).l;
    if (!lote) return console.log('Nada a reverter.');
    const nomes = await db.prepare('SELECT nome FROM schema_migrations WHERE lote = ? ORDER BY nome DESC').all(lote);
    const todas = new Map(carregar().map((m) => [m.nome, m]));
    for (const { nome } of nomes) {
      await db.exec(todas.get(nome).down);
      await db.prepare('DELETE FROM schema_migrations WHERE nome = ?').run(nome);
      console.log(`↓ ${nome}`);
    }
  });
}

async function status() {
  await db.iniciar();
  await garantirTabela();
  const feitas = await aplicadas();
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
  acoes[cmd]().then(() => db.fechar(), (e) => { console.error(e.message); process.exit(1); });
}
