const express = require('express');
const { db } = require('../db');
const { auditar } = require('../auth');
const { ErroValidacao } = require('../util');
const { config } = require('../analise');
const { GUIAS, EDITAVEIS, PADRAO, excecoes, guiasDoUsuario } = require('../permissoes');

const r = express.Router(); // montado com exigirLogin + exigirGuia('usuarios') (só administrador)
const CARGOS = { membro: 'Usuário', coordenacao: 'Coordenação', administrador: 'Administrador' };
const cargoDe = (u) => (u.superadmin ? 'administrador' : u.funcao);

function visao(u, euId) {
  const ex = excecoes(u.id);
  const padrao = PADRAO[u.funcao] || PADRAO.membro;
  const efetivas = new Set(guiasDoUsuario(u));
  return {
    id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, criado_em: u.criado_em,
    cargo: cargoDe(u), ativo: u.ativo === 1, eu: u.id === euId,
    guias: Object.fromEntries(EDITAVEIS.map((g) => [g, { liberado: efetivas.has(g), padrao: padrao.includes(g), personalizado: ex.has(g) }])),
  };
}

function alvo(id) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) throw new ErroValidacao('Usuário não encontrado.', 404);
  return u;
}

r.get('/', (req, res) => {
  const usuarios = db.prepare('SELECT * FROM usuarios ORDER BY ativo DESC, superadmin DESC, nome COLLATE NOCASE').all();
  res.json({
    guias: GUIAS.filter((g) => EDITAVEIS.includes(g.id)),
    fixas: GUIAS.filter((g) => g.fixa),
    padroes: PADRAO,
    cargos: CARGOS,
    cadastro_aberto: config('cadastro_aberto') !== '0',
    usuarios: usuarios.map((u) => visao(u, req.usuario.id)),
  });
});

r.put('/cadastro', (req, res) => {
  const aberto = req.body.aberto === true;
  db.prepare(`INSERT INTO configuracoes (chave, valor) VALUES ('cadastro_aberto', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`).run(aberto ? '1' : '0');
  auditar(req, aberto ? 'abrir_cadastro' : 'fechar_cadastro', 'configuracao', null);
  res.json({ cadastro_aberto: aberto });
});

// Mudar o cargo volta as guias ao padrão do novo cargo (as exceções antigas deixam de fazer sentido).
r.put('/:id/cargo', (req, res) => {
  const u = alvo(req.params.id);
  const cargo = req.body.cargo;
  if (!CARGOS[cargo]) throw new ErroValidacao('Cargo inválido.');
  if (u.id === req.usuario.id) throw new ErroValidacao('Você não pode mudar o seu próprio cargo.');
  db.transaction(() => {
    db.prepare(`UPDATE usuarios SET funcao = ?, superadmin = ?, atualizado_em = datetime('now') WHERE id = ?`).run(cargo === 'membro' ? 'membro' : 'coordenacao', cargo === 'administrador' ? 1 : 0, u.id);
    db.prepare('DELETE FROM usuario_guias WHERE usuario_id = ?').run(u.id);
  })();
  auditar(req, 'alterar_cargo', 'usuario', u.id, { de: cargoDe(u), para: cargo });
  res.json(visao(alvo(u.id), req.usuario.id));
});

// liberado: true | false define exceção; null volta ao padrão do cargo para aquela guia.
r.put('/:id/guias', (req, res) => {
  const u = alvo(req.params.id);
  const { guia, liberado } = req.body;
  if (u.superadmin) throw new ErroValidacao('Administradores têm todas as guias.');
  if (!EDITAVEIS.includes(guia)) throw new ErroValidacao('Guia inválida.');
  if (liberado !== null && typeof liberado !== 'boolean') throw new ErroValidacao('Informe liberado como verdadeiro ou falso.');
  const padrao = (PADRAO[u.funcao] || PADRAO.membro).includes(guia);
  if (liberado === null || liberado === padrao) db.prepare('DELETE FROM usuario_guias WHERE usuario_id = ? AND guia = ?').run(u.id, guia);
  else {
    db.prepare(
      `INSERT INTO usuario_guias (usuario_id, guia, liberado, atualizado_por) VALUES (?, ?, ?, ?)
       ON CONFLICT (usuario_id, guia) DO UPDATE SET liberado = excluded.liberado, atualizado_por = excluded.atualizado_por, atualizado_em = datetime('now')`
    ).run(u.id, guia, liberado ? 1 : 0, req.usuario.id);
  }
  auditar(req, 'alterar_permissao', 'usuario', u.id, { guia, liberado });
  res.json(visao(u, req.usuario.id));
});

r.post('/:id/restaurar', (req, res) => {
  const u = alvo(req.params.id);
  db.prepare('DELETE FROM usuario_guias WHERE usuario_id = ?').run(u.id);
  auditar(req, 'restaurar_permissoes', 'usuario', u.id);
  res.json(visao(u, req.usuario.id));
});

r.put('/:id/ativo', (req, res) => {
  const u = alvo(req.params.id);
  if (u.id === req.usuario.id) throw new ErroValidacao('Você não pode desativar a própria conta.');
  const ativo = req.body.ativo === true ? 1 : 0;
  db.prepare(`UPDATE usuarios SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`).run(ativo, u.id);
  if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
  auditar(req, ativo ? 'reativar' : 'inativar', 'usuario', u.id);
  res.json(visao(alvo(u.id), req.usuario.id));
});

module.exports = r;
