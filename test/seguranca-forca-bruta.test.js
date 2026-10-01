// Força bruta: depois de N tentativas o login responde 429. Arquivo à parte porque o contador é por processo.
const test = require('node:test');
const assert = require('node:assert');

process.env.PASTORAL_STORAGE = 'local'; // estes testes usam o disco; o Storage tem teste próprio (storage.test.js)
process.env.PASTORAL_SCHEMA = `bruta_${process.pid}`;
process.env.PASTORAL_LIMITE_TENTATIVAS = '8';
process.env.ADMIN_SENHA = 'Teste12345';
process.env.SUPERADMIN_EMAIL = 'admin@pastoral.local';
process.env.SUPERADMIN_SENHA = 'Mestre2026';

const { semear } = require('../src/seed');
const { db } = require('../src/db');
const { criarApp } = require('../src/app');

let servidor, base;
test.before(async () => {
  await semear({ log: () => {} });
  await new Promise((ok) => { const s = servidor = criarApp().listen(0, () => { base = `http://127.0.0.1:${s.address().port}`; ok(); }); });
});
test.after(async () => { servidor.close(); await db.apagarSchema(); await db.fechar(); });

test('limite de tentativas: força bruta no login leva a 429, mesmo com a senha certa depois', async () => {
  const tentar = (senha) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'maria@pastoral.local', senha }) }).then((r) => r.status);
  const respostas = [];
  for (let i = 0; i < 8; i++) respostas.push(await tentar('Errada' + i));
  assert.ok(respostas.every((s) => s === 401));
  assert.strictEqual(await tentar('Errada9'), 429);
  assert.strictEqual(await tentar('Teste12345'), 429, 'bloqueado inclusive com a senha certa');
});
