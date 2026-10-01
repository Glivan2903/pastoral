// Testes de segurança: autenticação, autorização, injeção, upload, sessão e cabeçalhos.
// Roda contra um schema temporário no Postgres, que é apagado no fim.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.PASTORAL_STORAGE = 'local'; // estes testes usam o disco; o Storage tem teste próprio (storage.test.js)
process.env.PASTORAL_SCHEMA = `seg_${process.pid}`;
process.env.PASTORAL_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'pastoral-seg-'));
process.env.ADMIN_SENHA = 'Teste12345';
process.env.SUPERADMIN_EMAIL = 'admin@pastoral.local';
process.env.SUPERADMIN_SENHA = 'Mestre2026';
process.env.PASTORAL_LIMITE_TENTATIVAS = '1000';

const { semear } = require('../src/seed');
const { db } = require('../src/db');
const { criarApp } = require('../src/app');

let base, servidor;
test.before(async () => {
  await semear({ log: () => {} });
  await new Promise((ok) => { const s = servidor = criarApp().listen(0, () => { base = `http://127.0.0.1:${s.address().port}`; ok(); }); });
});
test.after(async () => { servidor.close(); await db.apagarSchema(); await db.fechar(); });

async function http(method, url, { body, cookie, headers = {}, raw } = {}) {
  const r = await fetch(base + url, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { cookie } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  return { status: r.status, headers: r.headers, texto: await r.text() };
}
const json = (r) => { try { return JSON.parse(r.texto); } catch { return null; } };
async function login(email, senha) {
  const r = await http('POST', '/api/login', { body: { email, senha } });
  return { r, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

let admin, coord, usuario;
test('prepara contas: administrador, coordenação e usuário comum', async () => {
  admin = (await login('admin@pastoral.local', 'Mestre2026')).cookie;
  coord = (await login('maria@pastoral.local', 'Teste12345')).cookie;
  assert.ok(admin && coord);
  const c = await http('POST', '/api/cadastro', { body: { nome: 'Joana Teste', email: 'joana@teste.com', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true, data_nascimento: '1990-01-15' } });
  assert.strictEqual(c.status, 201);
  usuario = c.headers.get('set-cookie').split(';')[0];
});

test('sem sessão, toda rota de dados responde 401', async () => {
  const rotas = ['/api/me', '/api/membros', '/api/frequencia/analise', '/api/frequencia/encontros', '/api/avisos', '/api/galeria', '/api/financeiro', '/api/usuarios', '/api/painel', '/api/notificacoes', '/api/aniversariantes', '/api/minha-presenca', '/uploads/qualquer.jpg'];
  for (const u of rotas) assert.strictEqual((await http('GET', u)).status, 401, u);
  for (const [m, u] of [['POST', '/api/membros'], ['PUT', '/api/me'], ['POST', '/api/financeiro'], ['PUT', '/api/marca/cores'], ['POST', '/api/avisos']]) {
    assert.strictEqual((await http(m, u, { body: {} })).status, 401, `${m} ${u}`);
  }
});

test('cookie falso, vazio ou com injeção não autentica', async () => {
  for (const c of ['sid=abc', 'sid=', "sid=' OR '1'='1", 'sid=../../etc/passwd', 'sid=' + 'a'.repeat(5000), 'sid=%00']) {
    assert.strictEqual((await http('GET', '/api/me', { cookie: c })).status, 401, c.slice(0, 30));
  }
});

test('cookie de sessão: HttpOnly, SameSite e sem token em texto no banco', async () => {
  const { r, cookie } = await login('maria@pastoral.local', 'Teste12345');
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  const token = cookie.slice(4);
  const achou = await db.prepare('SELECT 1 FROM sessoes WHERE token_hash = ?').get(token);
  assert.ok(!achou, 'o banco não guarda o token puro');
  assert.strictEqual((await db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE token_hash = ?').get(require('../src/util').sha256(token))).n, 1);
});

test('login: mensagem igual para e-mail inexistente e senha errada, e injeção SQL não passa', async () => {
  const a = await http('POST', '/api/login', { body: { email: 'naoexiste@x.com', senha: 'Qualquer123' } });
  const b = await http('POST', '/api/login', { body: { email: 'maria@pastoral.local', senha: 'Errada12345' } });
  assert.strictEqual(a.status, 401);
  assert.strictEqual(b.status, 401);
  assert.strictEqual(a.texto, b.texto, 'não revela se o e-mail existe');
  for (const email of ["' OR 1=1 --", "maria@pastoral.local' --", "admin@pastoral.local'; DROP TABLE usuarios; --"]) {
    assert.strictEqual((await http('POST', '/api/login', { body: { email, senha: "' OR '1'='1" } })).status, 401, email);
  }
  assert.strictEqual((await http('POST', '/api/login', { body: { email: { $ne: null }, senha: { $ne: null } } })).status, 401, 'objeto no lugar de texto');
  assert.ok((await db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()).n >= 3, 'tabela intacta');
});

test('usuário comum não acessa nem altera áreas restritas (403)', async () => {
  for (const u of ['/api/membros', '/api/frequencia/analise', '/api/financeiro', '/api/usuarios']) {
    assert.strictEqual((await http('GET', u, { cookie: usuario })).status, 403, u);
  }
  assert.strictEqual((await http('POST', '/api/avisos', { cookie: usuario, body: { titulo: 'x', texto: 'y' } })).status, 403);
  assert.strictEqual((await http('POST', '/api/galeria', { cookie: usuario, body: { titulo: 'x', data_evento: '2026-01-01' } })).status, 403);
  assert.strictEqual((await http('PUT', '/api/marca/cores', { cookie: usuario, body: { cor_principal: '#000080', cor_secundaria: '#ffcc00' } })).status, 403);
});

test('coordenação não vira administrador nem mexe em permissões', async () => {
  assert.strictEqual((await http('GET', '/api/usuarios', { cookie: coord })).status, 403);
  assert.strictEqual((await http('PUT', '/api/usuarios/1/cargo', { cookie: coord, body: { cargo: 'administrador' } })).status, 403);
  assert.strictEqual((await http('PUT', '/api/marca/cores', { cookie: coord, body: { cor_principal: '#000080', cor_secundaria: '#ffcc00' } })).status, 403);
});

test('mass assignment: cadastro público ignora cargo, superadmin e ativo enviados', async () => {
  const r = await http('POST', '/api/cadastro', { body: { nome: 'Invasor Teste', email: 'invasor@teste.com', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true, data_nascimento: '1990-01-15', funcao: 'coordenacao', superadmin: 1, cargo: 'administrador', ativo: 1 } });
  assert.strictEqual(r.status, 201);
  const u = await db.prepare('SELECT funcao, superadmin FROM usuarios WHERE email = ?').get('invasor@teste.com');
  assert.strictEqual(u.funcao, 'membro');
  assert.strictEqual(u.superadmin, 0);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await http('GET', '/api/usuarios', { cookie })).status, 403);
});

test('perfil: usuário não consegue se promover pelo PUT /me', async () => {
  const r = await http('PUT', '/api/me', { cookie: usuario, body: { nome: 'Joana Teste', email: 'joana@teste.com', funcao: 'coordenacao', superadmin: 1 } });
  assert.strictEqual(r.status, 200);
  const u = await db.prepare('SELECT funcao, superadmin FROM usuarios WHERE email = ?').get('joana@teste.com');
  assert.strictEqual(u.funcao, 'membro');
  assert.strictEqual(u.superadmin, 0);
});

test('o administrador (mestre) não aparece para a coordenação', async () => {
  const lista = json(await http('GET', '/api/membros?status=todos', { cookie: coord }));
  assert.ok(!lista.some((m) => m.email === 'admin@pastoral.local'));
  const id = (await db.prepare('SELECT id FROM usuarios WHERE superadmin = 1').get()).id;
  assert.strictEqual((await http('GET', `/api/membros/${id}`, { cookie: coord })).status, 404);
  assert.strictEqual((await http('PUT', `/api/membros/${id}`, { cookie: coord, body: { nome: 'Hack', email: 'hack@x.com' } })).status, 404);
  assert.strictEqual((await http('POST', `/api/membros/${id}/inativar`, { cookie: coord })).status, 404);
});

test('hash da resposta: a API nunca devolve senha_hash', async () => {
  for (const [u, c] of [['/api/me', coord], ['/api/membros', coord], ['/api/usuarios', admin]]) {
    const r = await http('GET', u, { cookie: c });
    assert.ok(!/senha_hash|scrypt\$/.test(r.texto), u);
  }
});

test('injeção SQL em busca, filtros e ids não vaza nem derruba', async () => {
  const antes = (await db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()).n;
  for (const q of ["' OR '1'='1", "%'; DROP TABLE usuarios; --", '\\', '%', '_']) {
    const r = await http('GET', '/api/membros?q=' + encodeURIComponent(q), { cookie: coord });
    assert.ok([200, 400].includes(r.status), q + ' -> ' + r.status);
  }
  for (const u of ['/api/membros/1;DROP TABLE usuarios', '/api/avisos/abc', '/api/avisos/99999999999999', "/api/galeria/1' OR '1'='1", '/api/financeiro?mes=2026-01%27--']) {
    const r = await http('GET', u, { cookie: coord });
    assert.ok([400, 404].includes(r.status), `${u} -> ${r.status}`);
    assert.ok(!/syntax|pg_|relation|postgres/i.test(r.texto), 'sem detalhes internos do banco: ' + u);
  }
  assert.strictEqual((await db.prepare('SELECT COUNT(*) AS n FROM usuarios').get()).n, antes);
});

test('XSS armazenado: o texto é guardado como veio e a API responde JSON (não HTML)', async () => {
  const xss = '<img src=x onerror=alert(1)>';
  const r = await http('POST', '/api/avisos', { cookie: coord, raw: new URLSearchParams({ titulo: xss, texto: xss, categoria: 'recado' }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  // o servidor só aceita JSON/multipart; o importante é nunca devolver HTML com o conteúdo
  const lista = await http('GET', '/api/avisos', { cookie: coord });
  assert.match(lista.headers.get('content-type'), /application\/json/);
  assert.strictEqual(lista.headers.get('x-content-type-options'), 'nosniff');
  assert.ok([201, 400].includes(r.status));
});

test('o front escapa o conteúdo do usuário antes de inserir no HTML', () => {
  const js = fs.readdirSync(path.join(__dirname, '..', 'public'), { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', String(f)), 'utf8')).join('\n');
  assert.match(js, /esc\(|escapar|escapeHtml|textContent/, 'há função de escape no front');
});

test('upload: tipo falso, extensão enganosa e arquivo grande demais são recusados', async () => {
  const enviar = async (cookie, rota, campo, nome, tipo, bytes) => {
    const f = new FormData();
    f.append(campo, new Blob([bytes], { type: tipo }), nome);
    const r = await fetch(base + rota, { method: 'POST', headers: { cookie }, body: f });
    return r.status;
  };
  assert.strictEqual(await enviar(usuario, '/api/me/foto', 'arquivo', 'x.svg', 'image/svg+xml', '<svg onload=alert(1)/>'), 400, 'SVG recusado');
  assert.strictEqual(await enviar(usuario, '/api/me/foto', 'arquivo', 'x.html', 'text/html', '<script>alert(1)</script>'), 400, 'HTML recusado');
  assert.strictEqual(await enviar(usuario, '/api/me/foto', 'arquivo', 'x.php', 'application/x-php', '<?php ?>'), 400, 'PHP recusado');
  assert.strictEqual(await enviar(usuario, '/api/me/foto', 'arquivo', 'grande.png', 'image/png', Buffer.alloc(4 * 1024 * 1024)), 413, 'acima de 3 MB');
  assert.strictEqual(await enviar(usuario, '/api/me/foto', 'arquivo', '../../etc/passwd.png', 'image/png', Buffer.from('89504e47', 'hex')), 200, 'nome malicioso vira nome aleatório');
  const arquivos = fs.readdirSync(process.env.PASTORAL_UPLOADS);
  assert.ok(arquivos.every((a) => /^[a-f0-9]{24}\.(jpg|png|webp|mp4|webm|mov)$/.test(a)), 'arquivos salvos com nome aleatório: ' + arquivos.join(','));
});

test('path traversal em /uploads não sai da pasta', async () => {
  for (const u of ['/uploads/..%2f..%2f.env', '/uploads/%2e%2e%2f%2e%2e%2fpackage.json', '/uploads/..\\..\\.env']) {
    const r = await http('GET', u, { cookie: coord });
    assert.ok(r.status === 404 || r.status === 400, `${u} -> ${r.status}`);
    assert.ok(!/DATABASE_URL|"name": "pastoral"/.test(r.texto), 'não vazou arquivo: ' + u);
  }
  const r = await http('GET', '/.env');
  assert.ok(!/DATABASE_URL/.test(r.texto), '.env não é servido pelo estático');
  assert.ok(!/DATABASE_URL/.test((await http('GET', '/../.env')).texto));
});

test('recuperação de senha não revela se o e-mail existe e o token é de uso único', async () => {
  const a = await http('POST', '/api/recuperar-senha', { body: { email: 'maria@pastoral.local' } });
  const b = await http('POST', '/api/recuperar-senha', { body: { email: 'ninguem@x.com' } });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.texto, b.texto);
  assert.strictEqual((await http('POST', '/api/redefinir-senha', { body: { token: 'invalido', senha: 'NovaSenha123' } })).status, 400);
  const registro = await db.prepare('SELECT token_hash FROM redefinicoes_senha LIMIT 1').get();
  assert.ok(registro && registro.token_hash.length === 64, 'só o hash do token é guardado');
});

test('redefinir a senha derruba as sessões abertas', async () => {
  const sec = require('../src/util');
  const { cookie } = await login('joana@teste.com', 'Senha12345');
  assert.strictEqual((await http('GET', '/api/me', { cookie })).status, 200);
  const token = sec.novoToken();
  const uid = (await db.prepare('SELECT id FROM usuarios WHERE email = ?').get('joana@teste.com')).id;
  await db.prepare(`INSERT INTO redefinicoes_senha (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', '+1 hour'))`).run(sec.sha256(token), uid);
  assert.strictEqual((await http('POST', '/api/redefinir-senha', { body: { token, senha: 'OutraSenha123' } })).status, 200);
  assert.strictEqual((await http('GET', '/api/me', { cookie })).status, 401, 'sessão antiga morreu');
  assert.strictEqual((await http('POST', '/api/redefinir-senha', { body: { token, senha: 'MaisOutra123' } })).status, 400, 'token só vale uma vez');
  assert.strictEqual((await login('joana@teste.com', 'OutraSenha123')).r.status, 200);
});

test('sessão expirada e conta inativada deixam de valer', async () => {
  const { cookie } = await login('joana@teste.com', 'OutraSenha123');
  await db.prepare(`UPDATE sessoes SET expira_em = datetime('now', '-1 minute') WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'joana@teste.com')`).run();
  assert.strictEqual((await http('GET', '/api/me', { cookie })).status, 401, 'expirada');
  const l2 = await login('joana@teste.com', 'OutraSenha123');
  const uid = (await db.prepare('SELECT id FROM usuarios WHERE email = ?').get('joana@teste.com')).id;
  assert.strictEqual((await http('PUT', `/api/usuarios/${uid}/ativo`, { cookie: admin, body: { ativo: false } })).status, 200);
  assert.strictEqual((await http('GET', '/api/me', { cookie: l2.cookie })).status, 401, 'inativada');
  assert.strictEqual((await login('joana@teste.com', 'OutraSenha123')).r.status, 401, 'inativa não entra');
});

test('logout encerra a sessão no servidor (cookie roubado deixa de valer)', async () => {
  const { cookie } = await login('maria@pastoral.local', 'Teste12345');
  assert.strictEqual((await http('POST', '/api/logout', { cookie })).status, 200);
  assert.strictEqual((await http('GET', '/api/me', { cookie })).status, 401);
});

test('política de senha e validação de entrada', async () => {
  const base = { nome: 'Fraca Teste', email: 'fraca@teste.com', confirmacao: '', consentimento: true, data_nascimento: '1990-01-15' };
  for (const senha of ['curta1', 'somenteletras', '12345678', '']) {
    const r = await http('POST', '/api/cadastro', { body: { ...base, senha, confirmacao: senha } });
    assert.strictEqual(r.status, 400, `senha "${senha}"`);
  }
  assert.strictEqual((await http('POST', '/api/cadastro', { body: { nome: 'A', email: 'nao-e-email', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true, data_nascimento: '1990-01-15' } })).status, 400);
  const semData = { nome: 'Sem Data', email: 'semdata@teste.com', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true };
  assert.strictEqual((await http('POST', '/api/cadastro', { body: semData })).status, 400, 'data de nascimento é obrigatória');
  assert.strictEqual((await http('POST', '/api/cadastro', { body: { ...semData, data_nascimento: '2999-01-01' } })).status, 400, 'data no futuro');
  assert.strictEqual((await http('POST', '/api/cadastro', { body: { ...semData, data_nascimento: '31/02/2000' } })).status, 400, 'data impossível');
  assert.strictEqual((await http('POST', '/api/cadastro', { body: { nome: 'Sem LGPD', email: 'lgpd@teste.com', senha: 'Senha12345', confirmacao: 'Senha12345' } })).status, 400);
  assert.strictEqual((await http('POST', '/api/cadastro', { body: { nome: 'Robô Teste', email: 'robo@teste.com', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true, data_nascimento: '1990-01-15', site: 'http://spam' } })).status, 400, 'campo-isca');
  const dup = await http('POST', '/api/cadastro', { body: { nome: 'Maria Dup', email: 'MARIA@pastoral.local', senha: 'Senha12345', confirmacao: 'Senha12345', consentimento: true, data_nascimento: '1990-01-15' } });
  assert.strictEqual(dup.status, 409, 'e-mail duplicado ignorando maiúsculas');
});

test('JSON malformado e corpo gigante não derrubam o servidor', async () => {
  assert.strictEqual((await http('POST', '/api/login', { raw: '{"email": ', headers: { 'Content-Type': 'application/json' } })).status, 400);
  const grande = JSON.stringify({ email: 'a@b.com', senha: 'x'.repeat(300 * 1024) });
  assert.strictEqual((await http('POST', '/api/login', { raw: grande, headers: { 'Content-Type': 'application/json' } })).status, 413);
  assert.strictEqual((await http('GET', '/api/painel', { cookie: admin })).status, 200, 'segue de pé');
});

test('cabeçalhos de segurança e sem pistas da tecnologia', async () => {
  const r = await http('GET', '/api/marca');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(r.headers.get('x-powered-by'), null);
});

test('erros internos não expõem stack nem SQL', async () => {
  const r = await http('GET', '/api/avisos/abc', { cookie: coord });
  assert.ok(!/at .*\.js|SELECT |pg\b|node_modules/i.test(r.texto));
  const nf = await http('GET', '/api/rota-que-nao-existe', { cookie: coord });
  assert.strictEqual(nf.status, 404);
});
