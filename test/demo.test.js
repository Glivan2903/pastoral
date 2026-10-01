// Modo demonstração (PASTORAL_DEMO=1): a sessão é um cookie assinado e precisa valer em qualquer instância.
// As duas instâncias dividem um schema temporário do Postgres.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pastoral-demo-'));
const filhos = [];
process.env.PASTORAL_STORAGE = 'local'; // estes testes usam o disco; o Storage tem teste próprio (storage.test.js)
const SCHEMA = `demo_${process.pid}`;

function subirInstancia(nome, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const f = spawn(process.execPath, ['-e', `
      const http = require('http');
      require('./src/seed').semear({ demo: 'completo', log: () => {} }).then(() => {
        const s = http.createServer(require('./src/app').criarApp()).listen(0, () => console.log('PORTA=' + s.address().port));
      });
    `], { cwd: raiz, env: { ...process.env, PASTORAL_DEMO: '1', PASTORAL_SCHEMA: SCHEMA, ADMIN_SENHA: 'Pastoral2026', SUPERADMIN_EMAIL: 'admin@pastoral.local', SUPERADMIN_SENHA: 'Mestre2026', PASTORAL_UPLOADS: path.join(tmp, nome), PASTORAL_LIMITE_TENTATIVAS: '500', ...extraEnv } });
    filhos.push(f);
    f.stdout.on('data', (d) => { const m = /PORTA=(\d+)/.exec(String(d)); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    f.on('error', reject);
    setTimeout(() => reject(new Error('instância não subiu')), 60000);
  });
}

test.after(async () => {
  filhos.forEach((f) => f.kill());
  process.env.PASTORAL_SCHEMA = SCHEMA;
  const { db } = require('../src/db');
  await db.apagarSchema();
  await db.fechar();
});

test('demo: sessão criada numa instância vale em outra (bancos separados)', async () => {
  const A = await subirInstancia('a');
  const B = await subirInstancia('b');
  const login = await fetch(`${A}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'maria@pastoral.local', senha: 'Pastoral2026' }) });
  assert.strictEqual(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^sid=[\w-]+\.[\w-]+$/, 'cookie assinado, não um token de banco');

  for (const base of [A, B]) {
    const me = await fetch(`${base}/api/me`, { headers: { cookie } });
    assert.strictEqual(me.status, 200, base);
    assert.strictEqual((await me.json()).email, 'maria@pastoral.local');
    assert.strictEqual((await fetch(`${base}/api/painel`, { headers: { cookie } })).status, 200);
    assert.strictEqual((await fetch(`${base}/api/notificacoes`, { headers: { cookie } })).status, 200);
  }
  assert.strictEqual((await (await fetch(`${B}/api/marca`)).json()).demo, true);
});

test('demo: cookie adulterado, de outro segredo ou vencido é recusado', async () => {
  const A = await subirInstancia('c');
  const login = await fetch(`${A}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@pastoral.local', senha: 'Mestre2026' }) });
  const valor = login.headers.get('set-cookie').split(';')[0].slice(4);
  const [payload, sig] = valor.split('.');
  const chamar = (v) => fetch(`${A}/api/me`, { headers: { cookie: `sid=${v}` } }).then((r) => r.status);
  assert.strictEqual(await chamar(valor), 200);
  const outro = Buffer.from(JSON.stringify({ u: 1, e: Date.now() + 1e9 })).toString('base64url'); // tenta virar o usuário 1
  assert.strictEqual(await chamar(`${outro}.${sig}`), 401, 'payload trocado com a assinatura antiga');
  assert.strictEqual(await chamar(`${payload}.${sig.slice(0, -2)}xx`), 401, 'assinatura adulterada');
  assert.strictEqual(await chamar('lixo'), 401);
  const vencido = Buffer.from(JSON.stringify({ u: 1, e: Date.now() - 1000 })).toString('base64url');
  const crypto = require('crypto');
  const assin = crypto.createHmac('sha256', 'pastoral-demo-sessao-publica').update(vencido).digest('base64url');
  assert.strictEqual(await chamar(`${vencido}.${assin}`), 401, 'sessão vencida mesmo com assinatura válida');
  const segredoOutro = crypto.createHmac('sha256', 'outro-segredo').update(payload).digest('base64url');
  assert.strictEqual(await chamar(`${payload}.${segredoOutro}`), 401, 'assinatura de outro segredo');
});
