const { db } = require('./db');

function config(chave) {
  return db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave)?.valor;
}

// Resumo de frequência por membro ativo. "Justificado" não conta como falta nem quebra a sequência.
function analisar(de = '0000-01-01', ate = '9999-12-31') {
  const limite = Number(config('limite_faltas')) || 3;
  const criterio = config('criterio_alerta') || 'acumuladas';
  const membros = db.prepare('SELECT id, nome, telefone FROM usuarios WHERE ativo = 1 AND superadmin = 0 ORDER BY nome COLLATE NOCASE').all();
  const linhas = db
    .prepare(
      `SELECT p.usuario_id, p.situacao, e.conta_alerta
       FROM presencas p JOIN encontros e ON e.id = p.encontro_id
       WHERE e.data BETWEEN ? AND ?
       ORDER BY e.data DESC, e.id DESC`
    )
    .all(de, ate);

  const por = new Map(membros.map((m) => [m.id, { ...m, presencas: 0, faltas: 0, justificadas: 0, faltas_alerta: 0, consecutivas: 0, _fim: false }]));
  for (const l of linhas) {
    const m = por.get(l.usuario_id);
    if (!m) continue;
    if (l.situacao === 'presente') m.presencas++;
    if (l.situacao === 'justificado') m.justificadas++;
    if (l.situacao === 'ausente') m.faltas++;
    if (!l.conta_alerta) continue;
    if (l.situacao === 'ausente') {
      m.faltas_alerta++;
      if (!m._fim) m.consecutivas++;
    } else if (l.situacao === 'presente') m._fim = true;
  }

  const resultado = [...por.values()].map(({ _fim, ...m }) => {
    const total = m.presencas + m.faltas + m.justificadas;
    return {
      ...m,
      percentual_presenca: total ? Math.round((m.presencas / total) * 100) : null,
      em_alerta: (criterio === 'consecutivas' ? m.consecutivas : m.faltas_alerta) >= limite,
    };
  });
  return {
    limite_faltas: limite,
    criterio_alerta: criterio,
    totais: {
      presencas: resultado.reduce((s, m) => s + m.presencas, 0),
      faltas: resultado.reduce((s, m) => s + m.faltas, 0),
      justificadas: resultado.reduce((s, m) => s + m.justificadas, 0),
    },
    membros: resultado,
  };
}

module.exports = { analisar, config };
