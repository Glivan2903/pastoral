const express = require('express');
const { db } = require('../db');
const { ErroValidacao } = require('../util');
const { listar, visiveis } = require('../notificacoes');

const r = express.Router(); // montado com exigirLogin; cada pessoa só vê o que as guias dela permitem

r.get('/', (req, res) => {
  const { visiveis: _v, ...saida } = listar(req.usuario, req.guias);
  res.json(saida);
});

r.put('/:id/lida', (req, res) => {
  if (typeof req.body.lida !== 'boolean') throw new ErroValidacao('Informe lida como verdadeiro ou falso.');
  const v = visiveis(req.usuario, req.guias);
  if (!db.prepare(`SELECT 1 FROM notificacoes n WHERE n.id = ? AND ${v.sql}`).get(req.params.id, ...v.params)) throw new ErroValidacao('Notificação não encontrada.', 404);
  if (req.body.lida) db.prepare('INSERT OR IGNORE INTO notificacoes_leituras (notificacao_id, usuario_id) VALUES (?, ?)').run(req.params.id, req.usuario.id);
  else db.prepare('DELETE FROM notificacoes_leituras WHERE notificacao_id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ ok: true, nao_lidas: listar(req.usuario, req.guias, 1).nao_lidas });
});

r.post('/marcar-todas', (req, res) => {
  const v = visiveis(req.usuario, req.guias);
  db.prepare(`INSERT OR IGNORE INTO notificacoes_leituras (notificacao_id, usuario_id) SELECT n.id, ? FROM notificacoes n WHERE ${v.sql}`).run(req.usuario.id, ...v.params);
  res.json({ ok: true, nao_lidas: 0 });
});

module.exports = r;
