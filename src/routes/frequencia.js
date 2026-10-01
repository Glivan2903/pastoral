const express = require('express');
const { db } = require('../db');
const { auditar } = require('../auth');
const { ErroValidacao, normalizarData, hojeISO, formatarTelefone } = require('../util');
const { analisar } = require('../analise');

const r = express.Router(); // montado com exigirLogin + exigirCoordenacao
const TIPOS = ['reuniao', 'missa', 'escala', 'evento'];
const SITUACOES = ['presente', 'ausente', 'justificado'];

function paramsChamada(src) {
  const data = normalizarData(src.data, 'Data do encontro') || hojeISO();
  const tipo = src.tipo || 'reuniao';
  if (!TIPOS.includes(tipo)) throw new ErroValidacao('Tipo de encontro inválido.');
  return { data, tipo };
}

r.get('/chamada', async (req, res) => {
  const { data, tipo } = paramsChamada(req.query);
  const encontro = await db.prepare('SELECT * FROM encontros WHERE data = ? AND tipo = ?').get(data, tipo) || null;
  const membros = await db
    .prepare(
      `SELECT u.id, u.nome, u.telefone, p.situacao, p.observacao FROM usuarios u
       LEFT JOIN presencas p ON p.usuario_id = u.id AND p.encontro_id = ?
       WHERE u.ativo = 1 AND u.superadmin = 0 ORDER BY u.nome COLLATE NOCASE`
    )
    .all(encontro ? encontro.id : -1);
  res.json({ data, tipo, encontro, membros });
});

r.post('/chamada', async (req, res) => {
  const { data, tipo } = paramsChamada(req.body);
  const registros = Array.isArray(req.body.registros) ? req.body.registros : [];
  for (const g of registros) {
    if (g.situacao !== null && !SITUACOES.includes(g.situacao)) throw new ErroValidacao('Situação de presença inválida.');
  }
  const titulo = String(req.body.titulo || '').trim().slice(0, 120) || null;
  const contaAlerta = req.body.conta_alerta === false || req.body.conta_alerta === 0 ? 0 : 1;

  const salvar = db.transaction(async () => {
    await db.prepare(
      `INSERT INTO encontros (data, tipo, titulo, conta_alerta) VALUES (?, ?, ?, ?)
       ON CONFLICT (data, tipo) DO UPDATE SET titulo = excluded.titulo, conta_alerta = excluded.conta_alerta`
    ).run(data, tipo, titulo, contaAlerta);
    const { id: encontroId } = await db.prepare('SELECT id FROM encontros WHERE data = ? AND tipo = ?').get(data, tipo);
    // Em lote: poucas idas ao banco, mesmo com a lista inteira de membros.
    const ids = [...new Set(registros.map((g) => Number(g.usuario_id)))];
    if (ids.some((i) => !Number.isInteger(i))) throw new ErroValidacao('Membro inexistente na chamada.');
    const existentes = ids.length ? await db.prepare('SELECT id FROM usuarios WHERE id = ANY(?::int[])').all(ids) : [];
    if (existentes.length !== ids.length) throw new ErroValidacao('Membro inexistente na chamada.');
    const apagar = registros.filter((g) => g.situacao === null).map((g) => Number(g.usuario_id));
    const gravar = registros.filter((g) => g.situacao !== null);
    if (apagar.length) await db.prepare('DELETE FROM presencas WHERE encontro_id = ? AND usuario_id = ANY(?::int[])').run(encontroId, apagar);
    if (gravar.length) {
      const params = [encontroId, req.usuario.id];
      const valores = gravar.map((g) => {
        params.push(Number(g.usuario_id), g.situacao, String(g.observacao || '').trim().slice(0, 300) || null);
        return `($1, $${params.length - 2}, $${params.length - 1}, $${params.length}, $2)`;
      });
      await db.pool.query(
        `INSERT INTO presencas (encontro_id, usuario_id, situacao, observacao, registrado_por) VALUES ${valores.join(', ')}
         ON CONFLICT (encontro_id, usuario_id) DO UPDATE SET situacao = excluded.situacao, observacao = excluded.observacao,
           registrado_por = excluded.registrado_por, atualizado_em = agora()`,
        params
      );
    }
    const gravados = gravar.length;
    return { encontroId, gravados };
  });
  const { encontroId, gravados } = await salvar();
  await auditar(req, 'salvar_chamada', 'encontro', encontroId, { data, tipo, gravados });
  res.json({ ok: true, encontro_id: encontroId, gravados });
});

r.get('/analise', async (req, res) => {
  res.json(await analisar(normalizarData(req.query.de) || undefined, normalizarData(req.query.ate) || undefined));
});

r.get('/encontros', async (req, res) => {
  res.json(
    await db
      .prepare(
        `SELECT e.*, COALESCE(SUM((p.situacao = 'presente')::int), 0) AS presentes, COALESCE(SUM((p.situacao = 'ausente')::int), 0) AS ausentes,
           COALESCE(SUM((p.situacao = 'justificado')::int), 0) AS justificados
         FROM encontros e LEFT JOIN presencas p ON p.encontro_id = e.id
         GROUP BY e.id ORDER BY e.data DESC, e.id DESC LIMIT 100`
      )
      .all()
  );
});

r.put('/limite', async (req, res) => {
  const limite = Number(req.body.limite_faltas);
  if (!Number.isInteger(limite) || limite < 1 || limite > 99) throw new ErroValidacao('O limite precisa ser um número entre 1 e 99.');
  const criterio = req.body.criterio_alerta === 'consecutivas' ? 'consecutivas' : 'acumuladas';
  const up = db.prepare(
    `INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`
  );
  await db.transaction(async () => {
    await up.run('limite_faltas', String(limite));
    await up.run('criterio_alerta', criterio);
  })();
  await auditar(req, 'alterar_limite', 'configuracao', null, { limite, criterio });
  res.json({ limite_faltas: limite, criterio_alerta: criterio });
});

// Relatório CSV por período (abre direto no Excel: separador ";" e BOM).
r.get('/relatorio.csv', async (req, res) => {
  const de = normalizarData(req.query.de) || '0000-01-01';
  const ate = normalizarData(req.query.ate) || '9999-12-31';
  const a = await analisar(de, ate);
  const linhas = [['Nome', 'Telefone', 'Presenças', 'Faltas', 'Justificadas', '% presença', 'Em alerta']];
  for (const m of a.membros) {
    linhas.push([m.nome, formatarTelefone(m.telefone), m.presencas, m.faltas, m.justificadas, m.percentual_presenca ?? '', m.em_alerta ? 'Sim' : 'Não']);
  }
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="frequencia.csv"');
  res.send('﻿' + csv);
});

module.exports = r;
