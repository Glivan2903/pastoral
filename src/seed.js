// Cria a coordenadora e o usuário mestre. --demo inclui membros de exemplo; --demo-completo, também
// chamadas, avisos e lançamentos (usado na versão de demonstração da Vercel).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const { db } = require('./db');
const { up } = require('./migrate');
const { hashSenha, normalizarNome, hojeISO } = require('./util');

function semearDemo(log, completo) {
  if (db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE funcao = 'membro'").get().n > 0) return; // idempotente
  const mes = hojeISO().slice(0, 7);
  const ins = db.prepare('INSERT INTO usuarios (nome, telefone, data_nascimento) VALUES (?, ?, ?)');
  const nomes = ['ana clara souza', 'JOÃO PEDRO LIMA', 'Teresa de Oliveira', 'Marta Schmitt', 'josé carlos dos santos', 'Lúcia Fernandes'];
  const ids = nomes.map((n, i) => ins.run(normalizarNome(n), `479${String(9000 + i).padStart(4, '0')}00${i}0`, `${1970 + i * 7}-${mes.slice(5)}-${String(3 + i * 4).padStart(2, '0')}`).lastInsertRowid);
  if (!completo) { log(`${nomes.length} membros de exemplo criados.`); return; }
  const enc = db.prepare('INSERT INTO encontros (data, tipo, titulo) VALUES (?, ?, ?)');
  const pres = db.prepare('INSERT INTO presencas (encontro_id, usuario_id, situacao) VALUES (?, ?, ?)');
  [['reuniao', 21, 'Reunião da pastoral'], ['missa', 14, 'Missa de domingo'], ['reuniao', 7, 'Reunião da pastoral']].forEach(([tipo, dias, titulo]) => {
    const d = new Date(); d.setDate(d.getDate() - dias);
    const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const eid = enc.run(data, tipo, titulo).lastInsertRowid;
    ids.forEach((id, i) => pres.run(eid, id, i === 0 ? 'ausente' : i === 1 && dias === 14 ? 'justificado' : 'presente'));
  });
  const av = db.prepare('INSERT INTO avisos (titulo, texto, categoria, data_evento, fixado) VALUES (?, ?, ?, ?, ?)');
  av.run('Novena de Nossa Senhora Aparecida', 'Todas as noites, às 19h, na Matriz. Convidamos toda a equipe da pastoral.', 'evento', `${mes}-28`, 1);
  av.run('Escala do acolhimento', 'A escala do próximo mês está disponível com a coordenação.', 'escala', null, 0);
  const lan = db.prepare('INSERT INTO lancamentos (tipo, categoria, descricao, valor_centavos, data) VALUES (?, ?, ?, ?, ?)');
  lan.run('entrada', 'oferta', 'Oferta da missa de domingo', 185050, `${mes}-02`);
  lan.run('entrada', 'doacao', 'Doação para a festa', 50000, `${mes}-05`);
  lan.run('saida', 'compras', 'Velas e flores', 32025, `${mes}-06`);
  log(`${nomes.length} membros e dados de exemplo criados.`);
}

function semear({ demo = false, log = console.log } = {}) {
  up();
  const email = (process.env.ADMIN_EMAIL || 'maria@pastoral.local').toLowerCase();
  const senha = process.env.ADMIN_SENHA || 'Pastoral2026';
  if (!db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
    db.prepare(`INSERT INTO usuarios (nome, email, funcao, senha_hash, consentimento_lgpd_em) VALUES (?, ?, 'coordenacao', ?, datetime('now'))`).run('Maria', email, hashSenha(senha));
    log(`Coordenação criada: ${email} / ${senha}  (troque a senha em Configurações)`);
  } else log('Coordenação já existe.');

  // Usuário mestre: único que configura permissões de guias e a aparência.
  const mestreEmail = (process.env.SUPERADMIN_EMAIL || 'admin@pastoral.local').toLowerCase();
  const mestreSenha = process.env.SUPERADMIN_SENHA || 'Mestre2026';
  if (!db.prepare('SELECT 1 FROM usuarios WHERE superadmin = 1').get()) {
    db.prepare(`INSERT INTO usuarios (nome, email, funcao, superadmin, senha_hash, consentimento_lgpd_em) VALUES ('Administrador', ?, 'coordenacao', 1, ?, datetime('now'))`).run(mestreEmail, hashSenha(mestreSenha));
    log(`Usuário mestre criado: ${mestreEmail} / ${mestreSenha}  (troque a senha em Configurações)`);
  } else log('Usuário mestre já existe.');

  if (demo) semearDemo(log, demo === 'completo');
}

module.exports = { semear };
if (require.main === module) semear({ demo: process.argv.includes('--demo-completo') ? 'completo' : process.argv.includes('--demo') });
