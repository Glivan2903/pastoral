const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const { exigirCoordenacao, auditar } = require('../auth');
const { ErroValidacao, normalizarData } = require('../util');
const { uploadFotos, caminho } = require('../upload');
const { escreverZip } = require('../zip');
const { criar: notificar, excluirDe, notificarFotos, marcarLidas } = require('../notificacoes');

const r = express.Router(); // montado com exigirLogin + exigirGuia('galeria'); escrita exige Coordenação/Administrador

const slug = (t) =>
  String(t || 'foto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'foto';

const apagarArquivo = (f) => f && fs.rm(caminho(f), { force: true }, () => {});

async function evento(id) {
  const e = await db.prepare('SELECT * FROM eventos WHERE id = ?').get(id);
  if (!e) throw new ErroValidacao('Evento não encontrado.', 404);
  return e;
}

async function foto(id) {
  const f = await db.prepare('SELECT * FROM fotos WHERE id = ?').get(id);
  if (!f) throw new ErroValidacao('Foto não encontrada.', 404);
  return f;
}

function camposEvento(b) {
  const titulo = String(b.titulo || '').trim();
  if (!titulo) throw new ErroValidacao('Informe o título do evento.');
  const data = normalizarData(b.data_evento, 'Data do evento');
  if (!data) throw new ErroValidacao('Informe a data do evento.');
  return { titulo: titulo.slice(0, 150), descricao: String(b.descricao || '').trim().slice(0, 1000) || null, data_evento: data };
}

const listagem = `SELECT e.*, (SELECT COUNT(*) FROM fotos f WHERE f.evento_id = e.id) AS total_fotos,
    COALESCE((SELECT arquivo FROM fotos f WHERE f.id = e.capa_foto_id AND f.evento_id = e.id),
             (SELECT arquivo FROM fotos f WHERE f.evento_id = e.id ORDER BY f.id LIMIT 1)) AS capa
  FROM eventos e`;

r.get('/', async (req, res) => {
  res.json(await db.prepare(`${listagem} ORDER BY e.data_evento DESC, e.id DESC`).all());
});

r.get('/:id', async (req, res) => {
  await evento(req.params.id);
  await marcarLidas(req.usuario.id, ['evento', 'fotos'], Number(req.params.id)); // abriu o evento: sai do sino
  const e = await db.prepare(`${listagem} WHERE e.id = ?`).get(req.params.id);
  res.json({ ...e, fotos: await db.prepare('SELECT id, arquivo, titulo, criado_em FROM fotos WHERE evento_id = ? ORDER BY id').all(e.id) });
});

r.post('/', exigirCoordenacao, async (req, res) => {
  const c = camposEvento(req.body);
  const info = await db.prepare('INSERT INTO eventos (titulo, descricao, data_evento, criado_por) VALUES (@titulo, @descricao, @data_evento, @por)').run({ ...c, por: req.usuario.id });
  await auditar(req, 'criar', 'evento', info.lastInsertRowid, { titulo: c.titulo });
  await notificar({ tipo: 'evento', referenciaId: info.lastInsertRowid, titulo: `Novo evento na galeria: ${c.titulo}`, mensagem: 'Em breve, as fotos', link: `#/galeria/${info.lastInsertRowid}`, porId: req.usuario.id });
  res.status(201).json(await db.prepare(`${listagem} WHERE e.id = ?`).get(info.lastInsertRowid));
});

r.put('/:id', exigirCoordenacao, async (req, res) => {
  const e = await evento(req.params.id);
  const c = camposEvento(req.body);
  await db.prepare(`UPDATE eventos SET titulo = @titulo, descricao = @descricao, data_evento = @data_evento, atualizado_em = datetime('now') WHERE id = @id`).run({ ...c, id: e.id });
  await auditar(req, 'editar', 'evento', e.id);
  res.json(await db.prepare(`${listagem} WHERE e.id = ?`).get(e.id));
});

r.delete('/:id', exigirCoordenacao, async (req, res) => {
  const e = await evento(req.params.id);
  const arquivos = await db.prepare('SELECT arquivo FROM fotos WHERE evento_id = ?').all(e.id);
  await db.prepare('DELETE FROM eventos WHERE id = ?').run(e.id); // fotos saem em cascata
  await excluirDe(['evento', 'fotos'], e.id);
  arquivos.forEach((f) => apagarArquivo(f.arquivo));
  await auditar(req, 'excluir', 'evento', e.id, { titulo: e.titulo, fotos: arquivos.length });
  res.json({ ok: true });
});

// Envio de várias fotos de uma vez; "titulos" (JSON) opcional, na mesma ordem dos arquivos.
r.post('/:id/fotos', exigirCoordenacao, async (req, res, next) => {
  uploadFotos(req, res, async (err) => {
    const arquivos = req.files || [];
    const limpar = () => arquivos.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    if (err) { limpar(); return next(err); }
    try {
      const e = await evento(req.params.id);
      if (!arquivos.length) throw new ErroValidacao('Escolha ao menos uma foto.');
      let titulos = [];
      try { titulos = JSON.parse(req.body.titulos || '[]'); } catch { /* sem títulos */ }
      const ins = db.prepare('INSERT INTO fotos (evento_id, arquivo, titulo, criado_por) VALUES (?, ?, ?, ?)');
      await db.transaction(async () => {
        for (const [i, f] of arquivos.entries()) {
          const t = String(titulos[i] ?? '').trim() || path.parse(Buffer.from(f.originalname, 'latin1').toString('utf8')).name;
          await ins.run(e.id, f.filename, t.slice(0, 120), req.usuario.id);
        }
      })();
      await auditar(req, 'adicionar_fotos', 'evento', e.id, { quantidade: arquivos.length });
      await notificarFotos(e, arquivos.length, (await db.prepare('SELECT COUNT(*) AS n FROM fotos WHERE evento_id = ?').get(e.id)).n, req.usuario.id);
      res.status(201).json({ ok: true, adicionadas: arquivos.length });
    } catch (e) { limpar(); next(e); }
  });
});

r.put('/:id/capa', exigirCoordenacao, async (req, res) => {
  const e = await evento(req.params.id);
  const f = await db.prepare('SELECT id FROM fotos WHERE id = ? AND evento_id = ?').get(req.body.foto_id, e.id);
  if (!f) throw new ErroValidacao('A foto precisa ser deste evento.');
  await db.prepare(`UPDATE eventos SET capa_foto_id = ?, atualizado_em = datetime('now') WHERE id = ?`).run(f.id, e.id);
  await auditar(req, 'definir_capa', 'evento', e.id, { foto_id: f.id });
  res.json({ ok: true });
});

r.put('/fotos/:fotoId', exigirCoordenacao, async (req, res) => {
  const f = await foto(req.params.fotoId);
  const titulo = String(req.body.titulo || '').trim().slice(0, 120);
  if (!titulo) throw new ErroValidacao('Informe o título da foto.');
  await db.prepare('UPDATE fotos SET titulo = ? WHERE id = ?').run(titulo, f.id);
  await auditar(req, 'editar', 'foto', f.id);
  res.json({ id: f.id, titulo });
});

r.delete('/fotos/:fotoId', exigirCoordenacao, async (req, res) => {
  const f = await foto(req.params.fotoId);
  await db.prepare('UPDATE eventos SET capa_foto_id = NULL WHERE capa_foto_id = ?').run(f.id);
  await db.prepare('DELETE FROM fotos WHERE id = ?').run(f.id);
  apagarArquivo(f.arquivo);
  await auditar(req, 'excluir', 'foto', f.id, { evento_id: f.evento_id });
  res.json({ ok: true });
});

r.get('/fotos/:fotoId/download', async (req, res) => {
  const f = await foto(req.params.fotoId);
  res.download(caminho(f.arquivo), `${slug(f.titulo)}${path.extname(f.arquivo)}`);
});

r.get('/:id/download', async (req, res) => {
  const e = await evento(req.params.id);
  const fotos = await db.prepare('SELECT * FROM fotos WHERE evento_id = ? ORDER BY id').all(e.id);
  if (!fotos.length) throw new ErroValidacao('Este evento ainda não tem fotos.');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slug(e.titulo)}.zip"`);
  escreverZip(res, fotos.map((f, i) => ({ nome: `${String(i + 1).padStart(2, '0')}-${slug(f.titulo)}${path.extname(f.arquivo)}`, caminho: caminho(f.arquivo) })));
});

module.exports = r;
