const express = require('express');
const { db } = require('../db');
const { auditar } = require('../auth');
const { ErroValidacao, normalizarData, parseValor, hojeISO } = require('../util');

const r = express.Router(); // montado com exigirLogin + exigirCoordenacao
const CATEGORIAS = ['oferta', 'doacao', 'evento', 'compras', 'manutencao', 'materiais', 'outros'];
const ROTULOS = { oferta: 'Ofertas', doacao: 'Doações', evento: 'Eventos e festas', compras: 'Compras', manutencao: 'Manutenção', materiais: 'Materiais', outros: 'Outros' };

function mesParam(v) {
  const m = String(v || hojeISO().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new ErroValidacao('Mês inválido.');
  return m;
}

function somar(where, params) {
  const linhas = db.prepare(`SELECT tipo, COALESCE(SUM(valor_centavos), 0) AS total FROM lancamentos ${where} GROUP BY tipo`).all(...params);
  const entradas = linhas.find((l) => l.tipo === 'entrada')?.total ?? 0;
  const saidas = linhas.find((l) => l.tipo === 'saida')?.total ?? 0;
  return { entradas, saidas, saldo: entradas - saidas };
}

function campos(b) {
  if (!['entrada', 'saida'].includes(b.tipo)) throw new ErroValidacao('Escolha entrada ou saída.');
  const categoria = b.categoria || 'outros';
  if (!CATEGORIAS.includes(categoria)) throw new ErroValidacao('Categoria inválida.');
  const descricao = String(b.descricao || '').trim();
  if (!descricao) throw new ErroValidacao('Informe a descrição.');
  const data = normalizarData(b.data, 'Data');
  if (!data) throw new ErroValidacao('Informe a data.');
  return {
    tipo: b.tipo, categoria, descricao: descricao.slice(0, 150), data,
    valor_centavos: parseValor(b.valor), observacao: String(b.observacao || '').trim().slice(0, 300) || null,
  };
}

r.get('/', (req, res) => {
  const mes = mesParam(req.query.mes);
  const filtros = ['substr(data, 1, 7) = ?'];
  const params = [mes];
  if (['entrada', 'saida'].includes(req.query.tipo)) { filtros.push('tipo = ?'); params.push(req.query.tipo); }
  if (CATEGORIAS.includes(req.query.categoria)) { filtros.push('categoria = ?'); params.push(req.query.categoria); }
  if (req.query.q) { filtros.push('descricao LIKE ?'); params.push(`%${req.query.q}%`); }

  const lancamentos = db.prepare(`SELECT * FROM lancamentos WHERE ${filtros.join(' AND ')} ORDER BY data DESC, id DESC`).all(...params);

  // série dos 6 meses que terminam no mês escolhido
  const [a, m] = mes.split('-').map(Number);
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const linhas = db
    .prepare(`SELECT substr(data, 1, 7) AS mes, tipo, SUM(valor_centavos) AS total FROM lancamentos WHERE substr(data, 1, 7) BETWEEN ? AND ? GROUP BY 1, 2`)
    .all(meses[0], meses[5]);
  const serie = meses.map((x) => ({
    mes: x,
    entradas: linhas.find((l) => l.mes === x && l.tipo === 'entrada')?.total ?? 0,
    saidas: linhas.find((l) => l.mes === x && l.tipo === 'saida')?.total ?? 0,
  }));

  const porCategoria = db
    .prepare(`SELECT categoria, tipo, SUM(valor_centavos) AS total FROM lancamentos WHERE substr(data, 1, 7) = ? GROUP BY categoria, tipo ORDER BY total DESC`)
    .all(mes)
    .map((c) => ({ ...c, rotulo: ROTULOS[c.categoria] }));

  res.json({
    mes,
    resumo: somar('WHERE substr(data, 1, 7) = ?', [mes]),
    saldo_caixa: somar('', []).saldo,
    serie,
    por_categoria: porCategoria,
    categorias: ROTULOS,
    lancamentos,
  });
});

r.post('/', (req, res) => {
  const c = campos(req.body);
  const info = db
    .prepare(`INSERT INTO lancamentos (tipo, categoria, descricao, valor_centavos, data, observacao, criado_por) VALUES (@tipo, @categoria, @descricao, @valor_centavos, @data, @observacao, @por)`)
    .run({ ...c, por: req.usuario.id });
  auditar(req, 'criar', 'lancamento', info.lastInsertRowid, { tipo: c.tipo, valor_centavos: c.valor_centavos });
  res.status(201).json(db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(info.lastInsertRowid));
});

r.put('/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!atual) throw new ErroValidacao('Lançamento não encontrado.', 404);
  const c = campos(req.body);
  db.prepare(
    `UPDATE lancamentos SET tipo = @tipo, categoria = @categoria, descricao = @descricao, valor_centavos = @valor_centavos,
       data = @data, observacao = @observacao, atualizado_em = datetime('now') WHERE id = @id`
  ).run({ ...c, id: atual.id });
  auditar(req, 'editar', 'lancamento', atual.id, { antes: atual.valor_centavos, depois: c.valor_centavos });
  res.json(db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(atual.id));
});

r.delete('/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!l) throw new ErroValidacao('Lançamento não encontrado.', 404);
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(l.id);
  auditar(req, 'excluir', 'lancamento', l.id, { descricao: l.descricao, valor_centavos: l.valor_centavos });
  res.json({ ok: true });
});

r.get('/relatorio.csv', (req, res) => {
  const mes = mesParam(req.query.mes);
  const linhas = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor (R$)', 'Observação']];
  for (const l of db.prepare('SELECT * FROM lancamentos WHERE substr(data, 1, 7) = ? ORDER BY data, id').all(mes)) {
    linhas.push([l.data.split('-').reverse().join('/'), l.tipo === 'entrada' ? 'Entrada' : 'Saída', ROTULOS[l.categoria], l.descricao,
      ((l.tipo === 'saida' ? -1 : 1) * l.valor_centavos / 100).toFixed(2).replace('.', ','), l.observacao || '']);
  }
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="financeiro-${mes}.csv"`);
  res.send('﻿' + csv);
});

module.exports = r;
