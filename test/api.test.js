const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pastoral-'));
process.env.PASTORAL_STORAGE = 'local'; // estes testes usam o disco; o Storage tem teste próprio (storage.test.js)
process.env.PASTORAL_SCHEMA = `teste_${process.pid}`; // schema próprio no Postgres; é apagado no fim
process.env.PASTORAL_UPLOADS = path.join(tmp, 'uploads');
process.env.ADMIN_SENHA = 'Teste12345';
process.env.SUPERADMIN_EMAIL = 'admin@pastoral.local';
process.env.SUPERADMIN_SENHA = 'Mestre2026';
process.env.PASTORAL_LIMITE_TENTATIVAS = '500';

const { semear } = require('../src/seed');
const { db } = require('../src/db');
const { criarApp } = require('../src/app');

let base, cookie = '', servidor;
test.before(async () => {
  await semear({ log: () => {} }); // migra e cria a coordenadora e o mestre
  await new Promise((ok) => { const s = servidor = criarApp().listen(0, () => { base = `http://127.0.0.1:${s.address().port}`; ok(); }); });
});

async function req(method, url, body, semCookie) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(semCookie ? {} : { cookie }) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc && sc.startsWith('sid=') && !sc.includes('Max-Age=0')) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null) };
}

test('rotas protegidas exigem login', async () => {
  assert.strictEqual((await req('GET', '/api/membros', null, true)).status, 401);
});

test('login errado falha e certo entra', async () => {
  assert.strictEqual((await req('POST', '/api/login', { email: 'maria@pastoral.local', senha: 'errada' })).status, 401);
  const r = await req('POST', '/api/login', { email: 'maria@pastoral.local', senha: 'Teste12345' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.funcao, 'coordenacao');
});

let ids = [];
test('cadastro normaliza nome e telefone e rejeita telefone inválido', async () => {
  const a = await req('POST', '/api/membros', { nome: 'ana clara DA silva', telefone: '(47) 99999-1111', data_nascimento: '15/03/1980' });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(a.json.nome, 'Ana Clara da Silva');
  assert.strictEqual(a.json.telefone, '47999991111');
  assert.strictEqual(a.json.data_nascimento, '1980-03-15');
  const b = await req('POST', '/api/membros', { nome: 'Bruno Costa' });
  ids = [a.json.id, b.json.id];
  assert.strictEqual((await req('POST', '/api/membros', { nome: 'X Y', telefone: '123' })).status, 400);
});

test('chamada grava, é idempotente e alimenta o alerta', async () => {
  for (const data of ['2026-09-01', '2026-09-08', '2026-09-15']) {
    const r = await req('POST', '/api/frequencia/chamada', { data, tipo: 'reuniao', registros: [{ usuario_id: ids[0], situacao: 'ausente' }, { usuario_id: ids[1], situacao: 'presente' }] });
    assert.strictEqual(r.status, 200);
  }
  await req('POST', '/api/frequencia/chamada', { data: '2026-09-15', tipo: 'reuniao', registros: [{ usuario_id: ids[0], situacao: 'ausente' }] }); // repetida
  const a = (await req('GET', '/api/frequencia/analise')).json;
  const ana = a.membros.find((m) => m.id === ids[0]);
  assert.strictEqual(ana.faltas, 3);
  assert.strictEqual(ana.em_alerta, true);
  assert.strictEqual(a.membros.find((m) => m.id === ids[1]).em_alerta, false);
});

test('inativar preserva histórico e tira da chamada', async () => {
  await req('POST', `/api/membros/${ids[0]}/inativar`);
  const c = (await req('GET', '/api/frequencia/chamada?data=2026-09-15')).json;
  assert.ok(!c.membros.some((m) => m.id === ids[0]));
  assert.strictEqual((await req('GET', '/api/membros?status=inativos')).json.length, 1);
});

test('membro comum não acessa áreas da coordenação', async () => {
  await req('PUT', `/api/membros/${ids[1]}`, { nome: 'Bruno Costa', email: 'bruno@x.com', senha: 'Senha12345' });
  const coord = cookie;
  cookie = '';
  assert.strictEqual((await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' })).status, 200);
  assert.strictEqual((await req('GET', '/api/membros')).status, 403);
  assert.strictEqual((await req('POST', '/api/avisos', { titulo: 'a', texto: 'b' })).status, 403);
  assert.strictEqual((await req('GET', '/api/avisos')).status, 200);
  cookie = coord;
});

test('limite de faltas valida e persiste', async () => {
  assert.strictEqual((await req('PUT', '/api/frequencia/limite', { limite_faltas: 0 })).status, 400);
  assert.strictEqual((await req('PUT', '/api/frequencia/limite', { limite_faltas: 5, criterio_alerta: 'consecutivas' })).json.limite_faltas, 5);
});

test('troca de senha exige confirmação', async () => {
  assert.strictEqual((await req('PUT', '/api/me/senha', { senha_atual: 'Teste12345', nova_senha: 'Nova12345', confirmacao: 'outra' })).status, 400);
  assert.strictEqual((await req('PUT', '/api/me/senha', { senha_atual: 'Teste12345', nova_senha: 'Nova12345', confirmacao: 'Nova12345' })).status, 200);
});

test('financeiro: valores em formato BR, resumo, validação e permissão', async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  const a = await req('POST', '/api/financeiro', { tipo: 'entrada', categoria: 'oferta', descricao: 'Oferta da missa', valor: '1.234,56', data: hoje });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(a.json.valor_centavos, 123456);
  await req('POST', '/api/financeiro', { tipo: 'saida', categoria: 'compras', descricao: 'Velas', valor: 200, data: hoje });
  for (const ruim of ['abc', '0', '-5', '12,345']) {
    assert.strictEqual((await req('POST', '/api/financeiro', { tipo: 'saida', descricao: 'x', valor: ruim, data: hoje })).status, 400, `valor ${ruim}`);
  }
  assert.strictEqual((await req('POST', '/api/financeiro', { tipo: 'outro', descricao: 'x', valor: '1', data: hoje })).status, 400);
  const f = (await req('GET', `/api/financeiro?mes=${mes}`)).json;
  assert.deepStrictEqual(f.resumo, { entradas: 123456, saidas: 20000, saldo: 103456 });
  assert.strictEqual(f.saldo_caixa, 103456);
  assert.strictEqual(f.serie.length, 6);
  assert.strictEqual(f.serie[5].mes, mes);
  const filtrado = (await req('GET', `/api/financeiro?mes=${mes}&tipo=saida`)).json;
  assert.strictEqual(filtrado.lancamentos.length, 1);
  assert.strictEqual((await req('DELETE', `/api/financeiro/${a.json.id}`)).status, 200);
  assert.strictEqual((await req('GET', `/api/financeiro?mes=${mes}`)).json.resumo.entradas, 0);
  assert.strictEqual((await req('GET', '/api/financeiro?mes=2026-13')).status, 400);
  const coord = cookie; cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  assert.strictEqual((await req('GET', `/api/financeiro?mes=${mes}`)).status, 403);
  cookie = coord;
});

test('permissões: só o administrador configura; guia liberada/bloqueada vale no servidor', async () => {
  const coord = cookie;
  assert.strictEqual((await req('GET', '/api/usuarios')).status, 403); // Coordenação não administra acessos
  const eu = (await req('GET', '/api/me')).json;
  assert.strictEqual(eu.superadmin, false);
  assert.ok(eu.guias.includes('financeiro') && eu.guias.includes('membros') && !eu.guias.includes('usuarios'));

  cookie = '';
  assert.strictEqual((await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' })).json.superadmin, true);
  const admin = cookie;
  const p = (await req('GET', '/api/usuarios')).json;
  assert.strictEqual(p.usuarios.find((u) => u.email === 'admin@pastoral.local').cargo, 'administrador');
  const bruno = p.usuarios.find((u) => u.nome === 'Bruno Costa');
  const maria = p.usuarios.find((u) => u.nome === 'Maria');
  assert.strictEqual(bruno.cargo, 'membro');
  assert.strictEqual(bruno.guias.frequencia.liberado, false);

  // o administrador não entra na chamada nem na lista de membros
  cookie = coord;
  assert.ok(!(await req('GET', '/api/membros?status=todos')).json.some((m) => m.email === 'admin@pastoral.local'));
  assert.ok(!(await req('GET', '/api/frequencia/chamada')).json.membros.some((m) => m.nome === 'Administrador'));

  cookie = admin;
  assert.strictEqual((await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'frequencia', liberado: true })).json.guias.frequencia.liberado, true);
  assert.strictEqual((await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'painel', liberado: false })).status, 400);
  assert.strictEqual((await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'usuarios', liberado: true })).status, 400); // guia só do administrador
  assert.strictEqual((await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'membros', liberado: 'sim' })).status, 400);
  await req('PUT', `/api/usuarios/${maria.id}/guias`, { guia: 'financeiro', liberado: false });

  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  assert.ok((await req('GET', '/api/me')).json.guias.includes('frequencia'));
  assert.strictEqual((await req('GET', '/api/frequencia/chamada')).status, 200);
  assert.strictEqual((await req('GET', '/api/membros')).status, 403);
  assert.strictEqual((await req('GET', '/api/usuarios')).status, 403);

  cookie = coord; // Maria perdeu só o Financeiro
  assert.strictEqual((await req('GET', '/api/financeiro')).status, 403);
  assert.strictEqual((await req('GET', '/api/membros')).status, 200);

  // quem tem só a guia Membros não promove ninguém nem edita a Coordenação
  cookie = admin;
  await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'membros', liberado: true });
  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  const novo = await req('POST', '/api/membros', { nome: 'Carla Dias', funcao: 'coordenacao' });
  assert.strictEqual(novo.json.funcao, 'membro');
  assert.strictEqual((await req('PUT', `/api/membros/${maria.id}`, { nome: 'Maria', email: 'maria@pastoral.local' })).status, 403);

  cookie = admin;
  const r1 = await req('POST', `/api/usuarios/${bruno.id}/restaurar`);
  assert.strictEqual(r1.json.guias.frequencia.liberado, false);
  assert.strictEqual(r1.json.guias.membros.personalizado, false);
  await req('POST', `/api/usuarios/${maria.id}/restaurar`);
  cookie = coord;
  assert.strictEqual((await req('GET', '/api/financeiro')).status, 200);
});

test('cadastro público entra como Usuário e o administrador ajusta o cargo', async () => {
  const coord = cookie;
  cookie = '';
  assert.strictEqual((await req('GET', '/api/cadastro/status', null, true)).json.aberto, true);
  const ok = { nome: 'paula  NOVA dos santos', email: 'Paula@Teste.com', telefone: '(47) 98888-1234', data_nascimento: '1990-05-17', senha: 'Paula12345', confirmacao: 'Paula12345', consentimento: true };
  assert.strictEqual((await req('POST', '/api/cadastro', { ...ok, senha: 'curta', confirmacao: 'curta' }, true)).status, 400);
  assert.strictEqual((await req('POST', '/api/cadastro', { ...ok, confirmacao: 'Outra12345' }, true)).status, 400);
  assert.strictEqual((await req('POST', '/api/cadastro', { ...ok, consentimento: false }, true)).status, 400);
  assert.strictEqual((await req('POST', '/api/cadastro', { ...ok, site: 'http://spam' }, true)).status, 400);
  const r = await req('POST', '/api/cadastro', ok, true);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.nome, 'Paula Nova dos Santos');
  assert.strictEqual(r.json.email, 'paula@teste.com');
  assert.strictEqual(r.json.funcao, 'membro');
  assert.strictEqual(r.json.superadmin, false);
  assert.deepStrictEqual(r.json.guias.sort(), ['avisos', 'configuracoes', 'galeria', 'minha-presenca', 'painel']); // só o básico
  assert.strictEqual((await req('POST', '/api/cadastro', ok, true)).status, 409); // e-mail repetido
  // quem tenta se cadastrar com outro cargo continua sendo Usuário comum
  const cookiePaula = cookie;
  cookie = '';
  const esperto = await req('POST', '/api/cadastro', { ...ok, email: 'esperto@teste.com', funcao: 'coordenacao', superadmin: 1, cargo: 'administrador', guias: ['financeiro'] }, true);
  assert.strictEqual(esperto.status, 201);
  assert.strictEqual(esperto.json.funcao, 'membro');
  assert.strictEqual(esperto.json.superadmin, false);
  assert.ok(!esperto.json.guias.includes('financeiro') && !esperto.json.guias.includes('usuarios'));
  assert.strictEqual((await req('GET', '/api/financeiro')).status, 403);
  cookie = cookiePaula;
  // já logada como Usuário: sem acesso às áreas restritas
  for (const url of ['/api/membros', '/api/financeiro', '/api/frequencia/chamada', '/api/usuarios', '/api/aniversariantes']) assert.strictEqual((await req('GET', url)).status, 403, url);
  const paula = cookie;

  cookie = '';
  await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' });
  const admin = cookie;
  const lista = (await req('GET', '/api/usuarios')).json.usuarios;
  const id = lista.find((u) => u.email === 'paula@teste.com').id;
  const adminId = lista.find((u) => u.email === 'admin@pastoral.local').id;
  assert.strictEqual((await req('PUT', `/api/usuarios/${adminId}/cargo`, { cargo: 'membro' })).status, 400); // não muda o próprio cargo
  assert.strictEqual((await req('PUT', `/api/usuarios/${id}/cargo`, { cargo: 'rei' })).status, 400);
  await req('PUT', `/api/usuarios/${id}/guias`, { guia: 'frequencia', liberado: true });
  const c = await req('PUT', `/api/usuarios/${id}/cargo`, { cargo: 'coordenacao' });
  assert.strictEqual(c.json.cargo, 'coordenacao');
  assert.strictEqual(c.json.guias.frequencia.personalizado, false, 'trocar o cargo zera as exceções');
  cookie = paula;
  assert.strictEqual((await req('GET', '/api/financeiro')).status, 200); // agora é Coordenação
  assert.strictEqual((await req('GET', '/api/usuarios')).status, 403); // mas não administra acessos

  // cadastro fechado
  cookie = admin;
  assert.strictEqual((await req('PUT', '/api/usuarios/cadastro', { aberto: false })).json.cadastro_aberto, false);
  cookie = '';
  assert.strictEqual((await req('GET', '/api/cadastro/status', null, true)).json.aberto, false);
  assert.strictEqual((await req('POST', '/api/cadastro', { ...ok, email: 'outra@teste.com' }, true)).status, 403);
  cookie = admin;
  await req('PUT', '/api/usuarios/cadastro', { aberto: true });

  // conta desativada não entra mais
  await req('PUT', `/api/usuarios/${id}/ativo`, { ativo: false });
  cookie = '';
  assert.strictEqual((await req('POST', '/api/login', { email: 'paula@teste.com', senha: 'Paula12345' })).status, 401);
  cookie = coord;
});

test('minha presença: cada pessoa vê só os próprios registros', async () => {
  const coord = cookie;
  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  const b = (await req('GET', '/api/minha-presenca')).json;
  assert.strictEqual(b.presencas, 3);
  assert.strictEqual(b.faltas, 0);
  assert.strictEqual(b.percentual, 100);
  assert.strictEqual(b.em_alerta, false);
  assert.strictEqual(b.historico.length, 3);
  assert.ok(b.historico.every((h) => h.situacao === 'presente'));
  assert.ok(b.historico[0].data >= b.historico[2].data, 'mais recente primeiro');
  const painel = (await req('GET', '/api/painel')).json;
  assert.strictEqual(painel.minha_presenca.presencas, 3);
  assert.strictEqual(painel.frequencia, undefined);
  // sem a guia, nada de presença alheia nem da própria
  cookie = coord;
  assert.strictEqual((await req('GET', '/api/minha-presenca')).status, 200);
  cookie = '';
  await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' });
  const adm = cookie;
  const lista = (await req('GET', '/api/usuarios')).json.usuarios;
  const bruno = lista.find((u) => u.nome === 'Bruno Costa');
  await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'minha-presenca', liberado: false });
  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  assert.strictEqual((await req('GET', '/api/minha-presenca')).status, 403);
  assert.strictEqual((await req('GET', '/api/painel')).json.minha_presenca, undefined);
  cookie = adm;
  await req('POST', `/api/usuarios/${bruno.id}/restaurar`);
  cookie = coord;
});

async function reqForm(method, url, form) {
  const r = await fetch(base + url, { method, headers: { cookie }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fotoForm = (nomes, extra = {}) => {
  const f = new FormData();
  nomes.forEach((n) => f.append('fotos', new Blob([PNG], { type: n.endsWith('.txt') ? 'text/plain' : 'image/png' }), n));
  Object.entries(extra).forEach(([k, v]) => f.append(k, v));
  return f;
};

test('galeria: coordenação cria evento e fotos; usuário comum só vê e baixa', async () => {
  const coord = cookie;
  const ev = await req('POST', '/api/galeria', { titulo: 'Festa de Aparecida', data_evento: '2026-10-12', descricao: 'Missa e quermesse' });
  assert.strictEqual(ev.status, 201);
  assert.strictEqual((await req('POST', '/api/galeria', { titulo: '', data_evento: '2026-10-12' })).status, 400);
  assert.strictEqual((await req('POST', '/api/galeria', { titulo: 'x', data_evento: 'ontem' })).status, 400);
  const id = ev.json.id;

  // só imagens; nada é gravado quando o lote tem arquivo inválido
  assert.strictEqual((await reqForm('POST', `/api/galeria/${id}/fotos`, fotoForm(['a.png', 'b.txt']))).status, 400);
  assert.strictEqual((await reqForm('POST', `/api/galeria/${id}/fotos`, new FormData())).status, 400);
  assert.strictEqual((await reqForm('POST', '/api/galeria/9999/fotos', fotoForm(['a.png']))).status, 404);
  const up = await reqForm('POST', `/api/galeria/${id}/fotos`, fotoForm(['Benção da Imagem.png', 'procissão.png'], { titulos: JSON.stringify(['Benção da imagem', '']) }));
  assert.strictEqual(up.status, 201);
  assert.strictEqual(up.json.adicionadas, 2);

  let det = (await req('GET', `/api/galeria/${id}`)).json;
  assert.strictEqual(det.fotos.length, 2);
  assert.strictEqual(det.total_fotos, 2);
  assert.strictEqual(det.fotos[0].titulo, 'Benção da imagem');
  assert.ok(det.fotos[1].titulo.length > 0, 'título padrão vem do nome do arquivo');
  assert.strictEqual(det.capa, det.fotos[0].arquivo, 'capa padrão = primeira foto');
  const [f1, f2] = det.fotos;

  // capa, título e exclusão de uma foto específica
  assert.strictEqual((await req('PUT', `/api/galeria/${id}/capa`, { foto_id: f2.id })).status, 200);
  assert.strictEqual((await req('GET', `/api/galeria/${id}`)).json.capa, f2.arquivo);
  assert.strictEqual((await req('PUT', `/api/galeria/fotos/${f1.id}`, { titulo: 'Bênção' })).status, 200);
  assert.strictEqual((await req('PUT', `/api/galeria/fotos/${f1.id}`, { titulo: '  ' })).status, 400);

  // usuário comum (Bruno): visualiza e baixa, não edita nada
  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  const lista = (await req('GET', '/api/galeria')).json;
  assert.strictEqual(lista.find((e) => e.id === id).total_fotos, 2);
  assert.strictEqual((await req('GET', `/api/galeria/${id}`)).json.fotos.length, 2);
  assert.strictEqual((await req('POST', '/api/galeria', { titulo: 'x', data_evento: '2026-01-01' })).status, 403);
  assert.strictEqual((await req('PUT', `/api/galeria/${id}`, { titulo: 'x', data_evento: '2026-01-01' })).status, 403);
  assert.strictEqual((await req('DELETE', `/api/galeria/${id}`)).status, 403);
  assert.strictEqual((await req('PUT', `/api/galeria/fotos/${f1.id}`, { titulo: 'x' })).status, 403);
  assert.strictEqual((await req('DELETE', `/api/galeria/fotos/${f1.id}`)).status, 403);
  assert.strictEqual((await req('PUT', `/api/galeria/${id}/capa`, { foto_id: f1.id })).status, 403);
  assert.strictEqual((await reqForm('POST', `/api/galeria/${id}/fotos`, fotoForm(['c.png']))).status, 403);

  const dl = await fetch(`${base}/api/galeria/fotos/${f1.id}/download`, { headers: { cookie } });
  assert.strictEqual(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="?benc/);
  assert.deepStrictEqual(Buffer.from(await dl.arrayBuffer()), PNG, 'download devolve a foto original');
  const zip = await fetch(`${base}/api/galeria/${id}/download`, { headers: { cookie } });
  assert.strictEqual(zip.headers.get('content-type'), 'application/zip');
  const zb = Buffer.from(await zip.arrayBuffer());
  assert.strictEqual(zb.readUInt32LE(0), 0x04034b50, 'assinatura de ZIP');
  assert.strictEqual(zb.readUInt16LE(zb.length - 22 + 10), 2, 'duas fotos no ZIP');
  assert.strictEqual((await fetch(`${base}/uploads/${f1.arquivo}`, { headers: { cookie } })).status, 200);
  assert.strictEqual((await fetch(`${base}/api/galeria/${id}`)).status, 401);

  // sem a guia, nada de galeria (nem para ver)
  cookie = '';
  await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' });
  const adm = cookie;
  const bruno = (await req('GET', '/api/usuarios')).json.usuarios.find((u) => u.nome === 'Bruno Costa');
  await req('PUT', `/api/usuarios/${bruno.id}/guias`, { guia: 'galeria', liberado: false });
  cookie = '';
  await req('POST', '/api/login', { email: 'bruno@x.com', senha: 'Senha12345' });
  assert.strictEqual((await req('GET', '/api/galeria')).status, 403);
  cookie = adm;
  await req('POST', `/api/usuarios/${bruno.id}/restaurar`);

  // excluir foto e excluir evento (arquivos saem do disco)
  cookie = coord;
  assert.strictEqual((await req('DELETE', `/api/galeria/fotos/${f2.id}`)).status, 200);
  det = (await req('GET', `/api/galeria/${id}`)).json;
  assert.strictEqual(det.fotos.length, 1);
  assert.strictEqual(det.capa, f1.arquivo, 'sem a capa escolhida, volta à primeira foto');
  assert.strictEqual((await req('DELETE', `/api/galeria/${id}`)).status, 200);
  assert.strictEqual((await req('GET', `/api/galeria/${id}`)).status, 404);
  assert.strictEqual((await req('GET', `/api/galeria/fotos/${f1.id}/download`)).status, 404);
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual((await fetch(`${base}/uploads/${f1.arquivo}`, { headers: { cookie } })).status, 404);
});

test('avisos: flag de lido/não lido por pessoa e notificações de novidades', async () => {
  const coord = cookie;
  const login = async (email, senha) => { cookie = ''; await req('POST', '/api/login', { email, senha }); return cookie; };
  const bruno = await login('bruno@x.com', 'Senha12345');
  cookie = coord;

  // aviso novo => notificação para quem acessa Avisos (menos para quem publicou)
  const av = await req('POST', '/api/avisos', { titulo: 'Reunião geral', texto: 'Sábado às 19h no salão paroquial.', categoria: 'encontro' });
  assert.strictEqual(av.status, 201);
  const avId = av.json.id;
  assert.strictEqual((await req('GET', '/api/notificacoes')).json.nao_lidas, 0, 'quem publicou não se notifica');
  cookie = bruno;
  let n = (await req('GET', '/api/notificacoes')).json;
  assert.strictEqual(n.nao_lidas, 1);
  assert.strictEqual(n.itens[0].titulo, 'Novo aviso: Reunião geral');
  assert.strictEqual(n.itens[0].link, `#/avisos/${avId}`);
  assert.strictEqual((await req('GET', '/api/me')).json.avisos_nao_lidos, 1);

  // flag: ler marca o aviso e a notificação; dá para voltar a "não lido"
  assert.strictEqual((await req('GET', `/api/avisos/${avId}`)).json.lido, 0);
  assert.strictEqual((await req('PUT', `/api/avisos/${avId}/lido`, { lido: 'sim' })).status, 400);
  assert.strictEqual((await req('PUT', '/api/avisos/9999/lido', { lido: true })).status, 404);
  assert.strictEqual((await req('PUT', `/api/avisos/${avId}/lido`, { lido: true })).json.nao_lidos, 0);
  assert.strictEqual((await req('GET', `/api/avisos/${avId}`)).json.lido, 1);
  assert.strictEqual((await req('GET', '/api/notificacoes')).json.nao_lidas, 0);
  assert.strictEqual((await req('PUT', `/api/avisos/${avId}/lido`, { lido: false })).json.nao_lidos, 1);
  assert.strictEqual((await req('GET', '/api/me')).json.avisos_nao_lidos, 1);
  cookie = coord; // a flag é de cada pessoa
  assert.strictEqual((await req('GET', `/api/avisos/${avId}`)).json.lido, 0);

  // evento novo na galeria; fotos logo depois entram na mesma notificação e voltam a "não lida"
  const ev = await req('POST', '/api/galeria', { titulo: 'Quermesse', data_evento: '2026-11-01' });
  cookie = bruno;
  n = (await req('GET', '/api/notificacoes')).json;
  assert.strictEqual(n.nao_lidas, 1, 'só o evento; o aviso já foi lido (voltar a "não lido" não recria a notificação)');
  const notEvento = n.itens.find((i) => i.tipo === 'evento');
  assert.strictEqual(notEvento.link, `#/galeria/${ev.json.id}`);
  assert.strictEqual((await req('PUT', `/api/notificacoes/${notEvento.id}/lida`, { lida: true })).json.nao_lidas, 0);
  cookie = coord;
  await reqForm('POST', `/api/galeria/${ev.json.id}/fotos`, fotoForm(['a.png', 'b.png']));
  cookie = bruno;
  n = (await req('GET', '/api/notificacoes')).json;
  assert.strictEqual(n.itens.filter((i) => i.referencia_id === ev.json.id).length, 1, 'uma só notificação por evento recente');
  const agrupada = n.itens.find((i) => i.referencia_id === ev.json.id);
  assert.strictEqual(agrupada.id, notEvento.id);
  assert.match(agrupada.mensagem, /2 fotos/);
  assert.strictEqual(agrupada.lida, 0);
  await req('GET', `/api/galeria/${ev.json.id}`); // abrir o evento tira do sino
  assert.strictEqual((await req('GET', '/api/notificacoes')).json.nao_lidas, 0);
  assert.strictEqual((await req('PUT', '/api/notificacoes/999999/lida', { lida: true })).status, 404);

  // sem a guia Galeria, não recebe a notificação do evento (nem consegue mexer nela)
  cookie = '';
  await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' });
  const adm = cookie;
  const b = (await req('GET', '/api/usuarios')).json.usuarios.find((u) => u.nome === 'Bruno Costa');
  await req('PUT', `/api/usuarios/${b.id}/guias`, { guia: 'galeria', liberado: false });
  cookie = bruno;
  n = (await req('GET', '/api/notificacoes')).json;
  assert.ok(n.itens.every((i) => i.tipo === 'aviso'));
  assert.strictEqual((await req('PUT', `/api/notificacoes/${notEvento.id}/lida`, { lida: false })).status, 404);
  cookie = adm;
  await req('POST', `/api/usuarios/${b.id}/restaurar`);

  // quem se cadastra depois não recebe o que já passou
  await new Promise((r) => setTimeout(r, 1100));
  cookie = '';
  await req('POST', '/api/cadastro', { nome: 'Recém Chegado', email: 'novo@teste.com', data_nascimento: '1992-02-02', senha: 'Novo12345', confirmacao: 'Novo12345', consentimento: true }, true);
  assert.strictEqual((await req('GET', '/api/notificacoes')).json.itens.length, 0);

  // marcar todas e limpeza ao excluir
  cookie = bruno;
  await req('PUT', `/api/notificacoes/${notEvento.id}/lida`, { lida: false });
  await req('PUT', `/api/avisos/${avId}/lido`, { lido: false });
  assert.ok((await req('GET', '/api/notificacoes')).json.nao_lidas >= 1);
  assert.strictEqual((await req('POST', '/api/notificacoes/marcar-todas')).json.nao_lidas, 0);
  assert.strictEqual((await req('POST', '/api/avisos/marcar-todos-lidos')).json.nao_lidos, 0);
  cookie = coord;
  await req('DELETE', `/api/galeria/${ev.json.id}`);
  await req('DELETE', `/api/avisos/${avId}`);
  cookie = bruno;
  assert.strictEqual((await req('GET', '/api/notificacoes')).json.itens.length, 0, 'excluir aviso/evento limpa o sino');
  cookie = coord;
});

test('marca: cores e logotipo só o administrador altera; leitura pública; contraste validado', async () => {
  const coord = cookie;
  const pub = await fetch(`${base}/api/marca`).then((r) => r.json());
  assert.strictEqual(pub.cor_principal, '#1d3766');
  assert.strictEqual(pub.cor_secundaria, '#c8962c');
  assert.strictEqual(pub.logo, null);
  assert.strictEqual((await fetch(`${base}/api/marca/logo`)).status, 404);

  // Coordenação não personaliza
  assert.strictEqual((await req('PUT', '/api/marca/cores', { cor_principal: '#0b5d3b', cor_secundaria: '#f2c14e' })).status, 403);
  assert.strictEqual((await reqForm('POST', '/api/marca/logo', fotoForm(['logo.png'], {}))).status, 403);
  assert.strictEqual((await req('POST', '/api/marca/restaurar')).status, 403);

  cookie = '';
  await req('POST', '/api/login', { email: 'admin@pastoral.local', senha: 'Mestre2026' });
  const adm = cookie;
  assert.strictEqual((await req('PUT', '/api/marca/cores', { cor_principal: 'verde', cor_secundaria: '#f2c14e' })).status, 400);
  assert.strictEqual((await req('PUT', '/api/marca/cores', { cor_principal: '#ffe680', cor_secundaria: '#f2c14e' })).status, 400, 'principal clara demais');
  assert.strictEqual((await req('PUT', '/api/marca/cores', { cor_principal: '#0b5d3b', cor_secundaria: '#1a1a1a' })).status, 400, 'secundária escura demais');
  const ok = await req('PUT', '/api/marca/cores', { cor_principal: '#0B5D3B', cor_secundaria: '#F2C14E' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.cor_principal, '#0b5d3b');

  // logotipo: só PNG/JPG/WebP (nada de SVG, que executaria script)
  const svg = new FormData();
  svg.append('arquivo', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }), 'logo.svg');
  assert.strictEqual((await reqForm('POST', '/api/marca/logo', svg)).status, 400);
  const f = new FormData();
  f.append('arquivo', new Blob([PNG], { type: 'image/png' }), 'logo.png');
  const up = await reqForm('POST', '/api/marca/logo', f);
  assert.strictEqual(up.status, 201);
  assert.match(up.json.logo, /^\/api\/marca\/logo\?v=\d+$/);

  // leitura pública (sem login) das cores e do arquivo
  const pub2 = await fetch(`${base}/api/marca`).then((r) => r.json());
  assert.strictEqual(pub2.cor_principal, '#0b5d3b');
  const img = await fetch(`${base}${pub2.logo}`);
  assert.strictEqual(img.status, 200);
  assert.deepStrictEqual(Buffer.from(await img.arrayBuffer()), PNG);

  // trocar o logotipo apaga o arquivo antigo e muda a versão da URL
  const f2 = new FormData();
  f2.append('arquivo', new Blob([PNG], { type: 'image/png' }), 'logo2.png');
  await new Promise((r) => setTimeout(r, 5));
  const up2 = await reqForm('POST', '/api/marca/logo', f2);
  assert.notStrictEqual(up2.json.logo, up.json.logo);
  assert.strictEqual((await req('DELETE', '/api/marca/logo')).json.logo, null);
  assert.strictEqual((await fetch(`${base}/api/marca/logo`)).status, 404);

  const rest = await req('POST', '/api/marca/restaurar');
  assert.strictEqual(rest.json.cor_principal, '#1d3766');
  assert.strictEqual(rest.json.cor_secundaria, '#c8962c');
  cookie = coord;
});

test.after(async () => { servidor.close(); await db.apagarSchema(); await db.fechar(); });
