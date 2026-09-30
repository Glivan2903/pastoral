const express = require('express');
const fs = require('fs');
const { db } = require('../db');
const { exigirCoordenacao, auditar } = require('../auth');
const { ErroValidacao, normalizarData } = require('../util');
const { uploadMidia, tipoMidia, caminho } = require('../upload');
const { criar: notificar, excluirDe, marcarLidas } = require('../notificacoes');

const r = express.Router(); // montado com exigirLogin
const naoLidos = (usuarioId) => db.prepare('SELECT COUNT(*) AS n FROM avisos a WHERE NOT EXISTS (SELECT 1 FROM avisos_leituras l WHERE l.aviso_id = a.id AND l.usuario_id = ?)').get(usuarioId).n;
const CATEGORIAS = ['recado', 'encontro', 'escala', 'evento'];

const selecao = `SELECT a.*, u.nome AS autor_nome,
    EXISTS (SELECT 1 FROM avisos_leituras l WHERE l.aviso_id = a.id AND l.usuario_id = ?) AS lido,
    (SELECT COUNT(*) FROM avisos_leituras l WHERE l.aviso_id = a.id) AS leituras
  FROM avisos a LEFT JOIN usuarios u ON u.id = a.autor_id`;

r.get('/', (req, res) => {
  res.json(db.prepare(`${selecao} ORDER BY a.fixado DESC, a.criado_em DESC, a.id DESC`).all(req.usuario.id));
});

r.get('/nao-lidos/total', (req, res) => res.json({ total: naoLidos(req.usuario.id) }));

r.get('/:id', (req, res) => {
  const a = db.prepare(`${selecao} WHERE a.id = ?`).get(req.usuario.id, req.params.id);
  if (!a) throw new ErroValidacao('Aviso não encontrado.', 404);
  res.json(a);
});

function campos(b) {
  const titulo = String(b.titulo || '').trim();
  const texto = String(b.texto || '').trim();
  if (!titulo) throw new ErroValidacao('Informe o título do aviso.');
  if (!texto) throw new ErroValidacao('Escreva o texto do aviso.');
  const categoria = b.categoria || 'recado';
  if (!CATEGORIAS.includes(categoria)) throw new ErroValidacao('Categoria inválida.');
  return {
    titulo: titulo.slice(0, 150),
    texto,
    categoria,
    data_evento: normalizarData(b.data_evento, 'Data do evento'),
    fixado: b.fixado === 'true' || b.fixado === true || b.fixado === '1' ? 1 : 0,
  };
}

function comUpload(req, res, next) {
  uploadMidia(req, res, (err) => next(err));
}

r.post('/', exigirCoordenacao, comUpload, (req, res) => {
  try {
    const c = campos(req.body);
    const info = db
      .prepare(
        `INSERT INTO avisos (titulo, texto, categoria, data_evento, fixado, midia, midia_tipo, autor_id)
         VALUES (@titulo, @texto, @categoria, @data_evento, @fixado, @midia, @midia_tipo, @autor)`
      )
      .run({ ...c, midia: req.file?.filename ?? null, midia_tipo: req.file ? tipoMidia(req.file.mimetype) : null, autor: req.usuario.id });
    auditar(req, 'criar', 'aviso', info.lastInsertRowid);
    notificar({ tipo: 'aviso', referenciaId: info.lastInsertRowid, titulo: `Novo aviso: ${c.titulo}`, mensagem: c.texto.replace(/\s+/g, ' ').slice(0, 110), link: `#/avisos/${info.lastInsertRowid}`, porId: req.usuario.id });
    res.status(201).json(db.prepare(`${selecao} WHERE a.id = ?`).get(req.usuario.id, info.lastInsertRowid));
  } catch (e) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw e;
  }
});

r.put('/:id', exigirCoordenacao, comUpload, (req, res) => {
  try {
    const atual = db.prepare('SELECT * FROM avisos WHERE id = ?').get(req.params.id);
    if (!atual) throw new ErroValidacao('Aviso não encontrado.', 404);
    const c = campos(req.body);
    let { midia, midia_tipo } = atual;
    if (req.file || req.body.remover_midia === 'true') {
      if (midia) fs.rm(caminho(midia), { force: true }, () => {});
      midia = req.file ? req.file.filename : null;
      midia_tipo = req.file ? tipoMidia(req.file.mimetype) : null;
    }
    db.prepare(
      `UPDATE avisos SET titulo = @titulo, texto = @texto, categoria = @categoria, data_evento = @data_evento, fixado = @fixado,
         midia = @midia, midia_tipo = @midia_tipo, atualizado_em = datetime('now') WHERE id = @id`
    ).run({ ...c, midia, midia_tipo, id: atual.id });
    auditar(req, 'editar', 'aviso', atual.id);
    res.json(db.prepare(`${selecao} WHERE a.id = ?`).get(req.usuario.id, atual.id));
  } catch (e) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw e;
  }
});

r.delete('/:id', exigirCoordenacao, (req, res) => {
  const a = db.prepare('SELECT * FROM avisos WHERE id = ?').get(req.params.id);
  if (!a) throw new ErroValidacao('Aviso não encontrado.', 404);
  db.prepare('DELETE FROM avisos WHERE id = ?').run(a.id);
  excluirDe(['aviso'], a.id);
  if (a.midia) fs.rm(caminho(a.midia), { force: true }, () => {});
  auditar(req, 'excluir', 'aviso', a.id, { titulo: a.titulo });
  res.json({ ok: true });
});

// Flag de leitura da própria pessoa: lido = true marca como lido, false volta para "não lido".
r.put('/:id/lido', (req, res) => {
  if (typeof req.body.lido !== 'boolean') throw new ErroValidacao('Informe lido como verdadeiro ou falso.');
  if (!db.prepare('SELECT 1 FROM avisos WHERE id = ?').get(req.params.id)) throw new ErroValidacao('Aviso não encontrado.', 404);
  if (req.body.lido) {
    db.prepare('INSERT OR IGNORE INTO avisos_leituras (aviso_id, usuario_id) VALUES (?, ?)').run(req.params.id, req.usuario.id);
    marcarLidas(req.usuario.id, ['aviso'], Number(req.params.id)); // leu o aviso, a notificação dele também sai do sino
  }
  else db.prepare('DELETE FROM avisos_leituras WHERE aviso_id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  res.json({ ok: true, lido: req.body.lido, nao_lidos: naoLidos(req.usuario.id) });
});

r.post('/marcar-todos-lidos', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO avisos_leituras (aviso_id, usuario_id) SELECT id, ? FROM avisos').run(req.usuario.id);
  marcarLidas(req.usuario.id, ['aviso']);
  res.json({ ok: true, nao_lidos: 0 });
});

r.get('/:id/leituras', exigirCoordenacao, (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT u.id, u.nome, l.lido_em FROM usuarios u
         LEFT JOIN avisos_leituras l ON l.usuario_id = u.id AND l.aviso_id = ?
         WHERE u.ativo = 1 AND u.superadmin = 0 ORDER BY u.nome COLLATE NOCASE`
      )
      .all(req.params.id)
  );
});

module.exports = r;
