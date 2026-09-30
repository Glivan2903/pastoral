const express = require('express');
const { db } = require('../db');
const { exigirCoordenacao, exigirGuia, auditar } = require('../auth');
const { ErroValidacao, hojeISO } = require('../util');
const { analisar, config } = require('../analise');

const r = express.Router(); // montado com exigirLogin

function aniversariantesDoMes(mes) {
  return db
    .prepare(
      `SELECT id, nome, CAST(strftime('%d', data_nascimento) AS INTEGER) AS dia, data_nascimento FROM usuarios
       WHERE ativo = 1 AND superadmin = 0 AND data_nascimento IS NOT NULL AND CAST(strftime('%m', data_nascimento) AS INTEGER) = ?
       ORDER BY dia, nome COLLATE NOCASE`
    )
    .all(mes);
}

r.get('/aniversariantes', exigirGuia('aniversariantes'), (req, res) => {
  const mes = Number(req.query.mes) || new Date().getMonth() + 1;
  if (mes < 1 || mes > 12) throw new ErroValidacao('Mês inválido.');
  res.json({ mes, mensagem: config('mensagem_aniversario'), aniversariantes: aniversariantesDoMes(mes) });
});

r.put('/aniversariantes/mensagem', exigirGuia('aniversariantes'), exigirCoordenacao, (req, res) => {
  const msg = String(req.body.mensagem || '').trim();
  if (!msg) throw new ErroValidacao('Escreva a mensagem de aniversário.');
  if (msg.length > 500) throw new ErroValidacao('A mensagem pode ter no máximo 500 caracteres.');
  db.prepare(
    `INSERT INTO configuracoes (chave, valor) VALUES ('mensagem_aniversario', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`
  ).run(msg);
  auditar(req, 'alterar_mensagem', 'configuracao', null);
  res.json({ mensagem: msg });
});

// Só os dados da própria pessoa.
function resumoPresenca(usuarioId) {
  const a = analisar();
  const eu = a.membros.find((m) => m.id === usuarioId);
  const total = eu ? eu.presencas + eu.faltas + eu.justificadas : 0;
  return {
    presencas: eu?.presencas ?? 0, faltas: eu?.faltas ?? 0, justificadas: eu?.justificadas ?? 0,
    percentual: total ? Math.round((eu.presencas / total) * 100) : null,
    limite_faltas: a.limite_faltas, em_alerta: !!eu?.em_alerta,
  };
}

r.get('/minha-presenca', exigirGuia('minha-presenca'), (req, res) => {
  const historico = db
    .prepare(
      `SELECT e.data, e.tipo, e.titulo, p.situacao, p.observacao FROM presencas p
       JOIN encontros e ON e.id = p.encontro_id WHERE p.usuario_id = ? ORDER BY e.data DESC, e.id DESC LIMIT 200`
    )
    .all(req.usuario.id);
  res.json({ ...resumoPresenca(req.usuario.id), historico });
});

r.get('/painel', (req, res) => {
  const hoje = hojeISO();
  const [, mm, dd] = hoje.split('-');
  const tem = (g) => req.guias.includes(g);
  const doMes = aniversariantesDoMes(Number(mm));
  const saida = { hoje, guias: req.guias };
  if (tem('aniversariantes')) {
    saida.mensagem_aniversario = config('mensagem_aniversario');
    saida.aniversariantes_hoje = doMes.filter((a) => a.dia === Number(dd));
    saida.aniversariantes_mes = doMes.length;
  }
  if (tem('avisos')) {
    saida.ultimo_aviso = db.prepare('SELECT id, titulo, categoria, criado_em FROM avisos ORDER BY fixado DESC, criado_em DESC LIMIT 1').get() || null;
    saida.proximo_evento = db.prepare('SELECT id, titulo, data_evento FROM avisos WHERE data_evento >= ? ORDER BY data_evento LIMIT 1').get(hoje) || null;
  }
  if (tem('minha-presenca')) saida.minha_presenca = resumoPresenca(req.usuario.id);
  if (tem('frequencia')) {
    const a = analisar();
    saida.frequencia = {
      ...a.totais,
      em_alerta: a.membros.filter((m) => m.em_alerta).length,
      membros_ativos: a.membros.length,
      ultimo_encontro: db
        .prepare(
          `SELECT e.data, e.tipo, e.titulo, COALESCE(SUM(p.situacao = 'presente'), 0) AS presentes, COUNT(p.id) AS registrados
           FROM encontros e LEFT JOIN presencas p ON p.encontro_id = e.id GROUP BY e.id ORDER BY e.data DESC, e.id DESC LIMIT 1`
        )
        .get() || null,
    };
  }
  res.json(saida);
});

module.exports = r;
