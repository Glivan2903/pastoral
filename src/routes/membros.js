const express = require('express');
const fs = require('fs');
const { db } = require('../db');
const { auditar, usuarioPublico, nivelCoordenacao } = require('../auth');
const {
  ErroValidacao, normalizarNome, normalizarTelefone, normalizarData, normalizarEmail,
  validarSenha, hashSenha,
} = require('../util');
const { caminho } = require('../upload');

const r = express.Router(); // montado com exigirLogin + exigirGuia('membros')

// Quem tem só a guia Membros (sem ser Coordenação) não mexe em contas de Coordenação nem muda funções.
// O usuário mestre é invisível para todos, menos para ele mesmo.
async function alvo(req, id) {
  const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u || (u.superadmin && !req.usuario.superadmin)) throw new ErroValidacao('Membro não encontrado.', 404);
  if (u.funcao === 'coordenacao' && !nivelCoordenacao(req.usuario)) throw new ErroValidacao('Apenas a Coordenação altera contas da Coordenação.', 403);
  return u;
}

const colunas = 'id, nome, telefone, data_nascimento, email, funcao, superadmin, ativo, consentimento_lgpd_em, criado_em';

async function dadosDoCorpo(b, existente, ator) {
  let funcao = nivelCoordenacao(ator) ? (b.funcao === 'coordenacao' ? 'coordenacao' : 'membro') : (existente?.funcao ?? 'membro');
  if (existente?.superadmin) funcao = 'coordenacao';
  const email = normalizarEmail(b.email);
  if (email) {
    const outro = await db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, existente ? existente.id : 0);
    if (outro) throw new ErroValidacao('Este e-mail já está em uso.');
  }
  if (b.senha) validarSenha(b.senha);
  if ((b.senha || funcao === 'coordenacao') && !email) throw new ErroValidacao('Quem acessa o sistema precisa de e-mail.');
  return {
    nome: normalizarNome(b.nome),
    telefone: normalizarTelefone(b.telefone),
    data_nascimento: normalizarData(b.data_nascimento, 'Data de nascimento'),
    email,
    funcao,
    senha_hash: b.senha ? hashSenha(b.senha) : null,
  };
}

r.get('/', async (req, res) => {
  const { q = '', status = 'ativos' } = req.query;
  const filtros = req.usuario.superadmin ? [] : ['superadmin = 0'];
  const params = [];
  if (status === 'ativos') filtros.push('ativo = 1');
  if (status === 'inativos') filtros.push('ativo = 0');
  if (q) {
    filtros.push('(nome LIKE ? OR telefone LIKE ?)');
    params.push(`%${q}%`, `%${String(q).replace(/\D/g, '') || q}%`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  res.json(await db.prepare(`SELECT ${colunas} FROM usuarios ${where} ORDER BY nome COLLATE NOCASE`).all(...params));
});

r.get('/:id', async (req, res) => {
  const u = await alvo(req, req.params.id);
  res.json(await db.prepare(`SELECT ${colunas} FROM usuarios WHERE id = ?`).get(u.id));
});

r.post('/', async (req, res) => {
  const d = await dadosDoCorpo(req.body, null, req.usuario);
  const info = await db
    .prepare(
      `INSERT INTO usuarios (nome, telefone, data_nascimento, email, funcao, senha_hash, consentimento_lgpd_em)
       VALUES (@nome, @telefone, @data_nascimento, @email, @funcao, @senha_hash, ${req.body.consentimento ? "datetime('now')" : 'NULL'})`
    )
    .run(d);
  await auditar(req, 'criar', 'usuario', info.lastInsertRowid);
  res.status(201).json(await db.prepare(`SELECT ${colunas} FROM usuarios WHERE id = ?`).get(info.lastInsertRowid));
});

r.put('/:id', async (req, res) => {
  const atual = await alvo(req, req.params.id);
  const d = await dadosDoCorpo(req.body, atual, req.usuario);
  if (atual.id === req.usuario.id && d.funcao !== 'coordenacao') throw new ErroValidacao('Você não pode remover a própria função de Coordenação.');
  await db.prepare(
    `UPDATE usuarios SET nome = @nome, telefone = @telefone, data_nascimento = @data_nascimento, email = @email,
       funcao = @funcao, senha_hash = COALESCE(@senha_hash, senha_hash),
       consentimento_lgpd_em = CASE WHEN @consentimento = 1 AND consentimento_lgpd_em IS NULL THEN datetime('now') ELSE consentimento_lgpd_em END,
       atualizado_em = datetime('now')
     WHERE id = @id`
  ).run({ ...d, consentimento: req.body.consentimento ? 1 : 0, id: atual.id });
  await auditar(req, 'editar', 'usuario', atual.id);
  res.json(await db.prepare(`SELECT ${colunas} FROM usuarios WHERE id = ?`).get(atual.id));
});

function alterarAtivo(ativo) {
  return async (req, res) => {
    if (!ativo && Number(req.params.id) === req.usuario.id) throw new ErroValidacao('Você não pode inativar a si mesma(o).');
    await alvo(req, req.params.id);
    await db.prepare(`UPDATE usuarios SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?`).run(ativo, req.params.id);
    if (!ativo) await db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(req.params.id);
    await auditar(req, ativo ? 'reativar' : 'inativar', 'usuario', Number(req.params.id));
    res.json({ ok: true });
  };
}
r.post('/:id/inativar', alterarAtivo(0));
r.post('/:id/reativar', alterarAtivo(1));

// LGPD: apaga os dados pessoais e mantém só o histórico de frequência, sem identificação.
r.post('/:id/anonimizar', async (req, res) => {
  const u = await alvo(req, req.params.id);
  if (u.id === req.usuario.id) throw new ErroValidacao('Você não pode anonimizar a si mesma(o).');
  if (u.foto) fs.rm(caminho(u.foto), { force: true }, () => {});
  await db.transaction(async () => {
    await db.prepare(
      `UPDATE usuarios SET nome = 'Membro removido', telefone = NULL, data_nascimento = NULL, email = NULL, foto = NULL,
         senha_hash = NULL, ativo = 0, funcao = 'membro', atualizado_em = datetime('now') WHERE id = ?`
    ).run(u.id);
    await db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
  })();
  await auditar(req, 'anonimizar', 'usuario', u.id);
  res.json({ ok: true });
});

// LGPD: exporta tudo o que o sistema guarda sobre a pessoa.
r.get('/:id/exportar', async (req, res) => {
  const u = await alvo(req, req.params.id);
  const presencas = await db
    .prepare(
      `SELECT e.data, e.tipo, e.titulo, p.situacao, p.observacao FROM presencas p
       JOIN encontros e ON e.id = p.encontro_id WHERE p.usuario_id = ? ORDER BY e.data`
    )
    .all(u.id);
  res.setHeader('Content-Disposition', `attachment; filename="dados-membro-${u.id}.json"`);
  res.json({ dados_pessoais: { ...(await usuarioPublico(u)), consentimento_lgpd_em: u.consentimento_lgpd_em, criado_em: u.criado_em }, presencas });
});

module.exports = r;
