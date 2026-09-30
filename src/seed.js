// Cria a coordenadora inicial. Com --demo, adiciona também membros de exemplo.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const { db } = require('./db');
const { up } = require('./migrate');
const { hashSenha, normalizarNome, hojeISO } = require('./util');

up();
const email = (process.env.ADMIN_EMAIL || 'maria@pastoral.local').toLowerCase();
const senha = process.env.ADMIN_SENHA || 'Pastoral2026';

if (!db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
  db.prepare(`INSERT INTO usuarios (nome, email, funcao, senha_hash, consentimento_lgpd_em) VALUES (?, ?, 'coordenacao', ?, datetime('now'))`).run(
    'Maria', email, hashSenha(senha)
  );
  console.log(`Coordenação criada: ${email} / ${senha}  (troque a senha em Configurações)`);
} else console.log('Coordenação já existe.');

// Usuário mestre: único que configura permissões de guias.
const mestreEmail = (process.env.SUPERADMIN_EMAIL || 'admin@pastoral.local').toLowerCase();
const mestreSenha = process.env.SUPERADMIN_SENHA || 'Mestre2026';
if (!db.prepare('SELECT 1 FROM usuarios WHERE superadmin = 1').get()) {
  db.prepare(`INSERT INTO usuarios (nome, email, funcao, superadmin, senha_hash, consentimento_lgpd_em) VALUES ('Administrador', ?, 'coordenacao', 1, ?, datetime('now'))`).run(mestreEmail, hashSenha(mestreSenha));
  console.log(`Usuário mestre criado: ${mestreEmail} / ${mestreSenha}  (troque a senha em Configurações)`);
} else console.log('Usuário mestre já existe.');

if (process.argv.includes('--demo')) {
  const ins = db.prepare('INSERT INTO usuarios (nome, telefone, data_nascimento) VALUES (?, ?, ?)');
  const [a, m] = hojeISO().split('-');
  const nomes = ['ana clara souza', 'JOÃO PEDRO LIMA', 'Teresa de Oliveira', 'Marta Schmitt', 'josé carlos dos santos', 'Lúcia Fernandes'];
  nomes.forEach((n, i) => ins.run(normalizarNome(n), `47 9${String(9000 + i).padStart(4, '0')}-00${i}0`.replace(/\D/g, ''), `${1970 + i * 7}-${m}-${String(3 + i * 4).padStart(2, '0')}`));
  console.log(`${nomes.length} membros de exemplo criados (aniversários em ${m}/${a}).`);
}
