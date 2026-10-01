// Upload de imagens no Supabase Storage (bucket real, com prefixo temporário que é apagado no fim).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.PASTORAL_SCHEMA = `sto_${process.pid}`;
process.env.PASTORAL_STORAGE_PREFIX = `teste-${process.pid}/`;
process.env.PASTORAL_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'pastoral-sto-')); // não deve receber nada
process.env.ADMIN_SENHA = 'Teste12345';
process.env.SUPERADMIN_EMAIL = 'admin@pastoral.local';
process.env.SUPERADMIN_SENHA = 'Mestre2026';
process.env.PASTORAL_LIMITE_TENTATIVAS = '1000';
delete process.env.PASTORAL_STORAGE;

const { semear } = require('../src/seed');
const { db } = require('../src/db');
const arm = require('../src/armazenamento');
const { criarApp } = require('../src/app');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let base, servidor, cookie = '';
const criados = new Set();

test.before(async () => {
  if (!arm.USA_STORAGE) throw new Error('SUPABASE_SERVICE_KEY/SUPABASE_URL não configurados no .env');
  await semear({ log: () => {} });
  await arm.garantirBucket();
  await new Promise((ok) => { const s = servidor = criarApp().listen(0, () => { base = `http://127.0.0.1:${s.address().port}`; ok(); }); });
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'maria@pastoral.local', senha: 'Teste12345' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
test.after(async () => {
  servidor.close();
  for (const nome of criados) await arm.remover(nome);
  await db.apagarSchema(); await db.fechar();
});

const chamar = (m, u, corpo) => fetch(base + u, { method: m, headers: { cookie, ...(corpo instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: corpo instanceof FormData ? corpo : corpo ? JSON.stringify(corpo) : undefined });
const formFotos = (nomes) => { const f = new FormData(); for (const n of nomes) f.append('fotos', new Blob([PNG], { type: 'image/png' }), n); return f; };

test('o bucket existe e é privado', async () => {
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/${arm.BUCKET}`, { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } });
  const b = await r.json();
  assert.strictEqual(b.public, false);
});

test('galeria: foto vai para o Storage (não para o disco), é servida só com login e some ao excluir', async () => {
  const ev = await (await chamar('POST', '/api/galeria', { titulo: 'Evento Storage', data_evento: '2026-05-01' })).json();
  const up = await chamar('POST', `/api/galeria/${ev.id}/fotos`, formFotos(['a.png', 'b.png']));
  assert.strictEqual(up.status, 201);
  const det = await (await chamar('GET', `/api/galeria/${ev.id}`)).json();
  assert.strictEqual(det.fotos.length, 2);
  det.fotos.forEach((f) => criados.add(f.arquivo));
  assert.deepStrictEqual(fs.readdirSync(process.env.PASTORAL_UPLOADS), [], 'nada gravado em disco');
  for (const f of det.fotos) assert.match(f.arquivo, /^[a-f0-9]{24}\.png$/);

  const img = await fetch(`${base}/uploads/${det.fotos[0].arquivo}`, { headers: { cookie } });
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
  assert.ok(Buffer.from(await img.arrayBuffer()).equals(PNG), 'bytes idênticos aos enviados');
  assert.strictEqual((await fetch(`${base}/uploads/${det.fotos[0].arquivo}`)).status, 401, 'sem login não serve');

  // acesso direto ao bucket sem a chave não funciona (privado)
  const direto = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/${arm.BUCKET}/${process.env.PASTORAL_STORAGE_PREFIX}${det.fotos[0].arquivo}`);
  assert.notStrictEqual(direto.status, 200, 'URL pública não funciona');

  const dl = await chamar('GET', `/api/galeria/fotos/${det.fotos[0].id}/download`);
  assert.strictEqual(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const zip = await chamar('GET', `/api/galeria/${ev.id}/download`);
  assert.strictEqual(zip.status, 200);
  const z = Buffer.from(await zip.arrayBuffer());
  assert.strictEqual(z.readUInt32LE(0), 0x04034b50, 'zip válido');
  assert.strictEqual(z.readUInt16LE(z.length - 12), 2, 'duas fotos no zip');

  assert.strictEqual((await chamar('DELETE', `/api/galeria/fotos/${det.fotos[0].id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual((await fetch(`${base}/uploads/${det.fotos[0].arquivo}`, { headers: { cookie } })).status, 404, 'arquivo removido do Storage');
  assert.strictEqual((await chamar('DELETE', `/api/galeria/${ev.id}`)).status, 200);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual((await fetch(`${base}/uploads/${det.fotos[1].arquivo}`, { headers: { cookie } })).status, 404, 'excluir o evento limpa as fotos');
});

test('validações continuam valendo: SVG recusado e arquivo grande demais não sobem', async () => {
  const f = new FormData(); f.append('arquivo', new Blob(['<svg onload=alert(1)/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.strictEqual((await chamar('POST', '/api/me/foto', f)).status, 400);
  const g = new FormData(); g.append('arquivo', new Blob([Buffer.alloc(4 * 1024 * 1024)], { type: 'image/png' }), 'grande.png');
  assert.strictEqual((await chamar('POST', '/api/me/foto', g)).status, 413);
  const listado = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/list/${arm.BUCKET}`, { method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: process.env.PASTORAL_STORAGE_PREFIX.replace(/\/$/, ''), limit: 100 }) });
  assert.deepStrictEqual((await listado.json()).filter((o) => o.name), [], 'nada ficou no bucket');
});

test('foto de perfil e logotipo: sobem, trocam (a antiga é apagada) e são servidos', async () => {
  const subir = async (rota, campo, nome) => { const f = new FormData(); f.append(campo, new Blob([PNG], { type: 'image/png' }), nome); return chamar('POST', rota, f); };
  assert.strictEqual((await subir('/api/me/foto', 'arquivo', 'eu.png')).status, 200);
  const eu1 = (await (await chamar('GET', '/api/me')).json()).foto;
  criados.add(eu1);
  assert.strictEqual((await fetch(`${base}/uploads/${eu1}`, { headers: { cookie } })).status, 200);
  assert.strictEqual((await subir('/api/me/foto', 'arquivo', 'eu2.png')).status, 200);
  const eu2 = (await (await chamar('GET', '/api/me')).json()).foto;
  criados.add(eu2);
  assert.notStrictEqual(eu1, eu2);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual((await fetch(`${base}/uploads/${eu1}`, { headers: { cookie } })).status, 404, 'foto antiga apagada');

  // logotipo (administrador)
  const lg = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@pastoral.local', senha: 'Mestre2026' }) });
  const adm = lg.headers.get('set-cookie').split(';')[0];
  const f = new FormData(); f.append('arquivo', new Blob([PNG], { type: 'image/png' }), 'logo.png');
  const up = await fetch(`${base}/api/marca/logo`, { method: 'POST', headers: { cookie: adm }, body: f });
  assert.strictEqual(up.status, 201);
  const logo = await fetch(`${base}/api/marca/logo`);
  assert.strictEqual(logo.status, 200);
  assert.ok(Buffer.from(await logo.arrayBuffer()).equals(PNG));
  const rem = await fetch(`${base}/api/marca/logo`, { method: 'DELETE', headers: { cookie: adm } });
  assert.strictEqual((await rem.json()).logo, null);
  assert.strictEqual((await fetch(`${base}/api/marca/logo`)).status, 404);
});

test('mídia de aviso (imagem) no Storage', async () => {
  const f = new FormData();
  f.append('titulo', 'Aviso com imagem'); f.append('texto', 'Texto'); f.append('categoria', 'recado');
  f.append('arquivo', new Blob([PNG], { type: 'image/png' }), 'aviso.png');
  const r = await chamar('POST', '/api/avisos', f);
  assert.strictEqual(r.status, 201);
  const a = await r.json();
  criados.add(a.midia);
  assert.strictEqual(a.midia_tipo, 'imagem');
  assert.strictEqual((await fetch(`${base}/uploads/${a.midia}`, { headers: { cookie } })).status, 200);
  assert.strictEqual((await chamar('DELETE', `/api/avisos/${a.id}`)).status, 200);
  await new Promise((r2) => setTimeout(r2, 500));
  assert.strictEqual((await fetch(`${base}/uploads/${a.midia}`, { headers: { cookie } })).status, 404);
});
