const { db } = require('./db');

// Cada assunto só aparece para quem tem a guia correspondente.
const GUIA_DO_TIPO = { aviso: 'avisos', evento: 'galeria', fotos: 'galeria' };
const JANELA_AGRUPAR = '-30 minutes'; // fotos enviadas logo após criar o evento entram na mesma notificação

function criar({ tipo, referenciaId, titulo, mensagem, link, porId }) {
  return db
    .prepare('INSERT INTO notificacoes (tipo, referencia_id, titulo, mensagem, link, criado_por) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tipo, referenciaId, titulo, mensagem || null, link, porId ?? null).lastInsertRowid;
}

function excluirDe(tipos, referenciaId) {
  db.prepare(`DELETE FROM notificacoes WHERE tipo IN (${tipos.map(() => '?').join(',')}) AND referencia_id = ?`).run(...tipos, referenciaId);
}

// Fotos novas: se o evento acabou de ser criado (ou já tem aviso recente), reaproveita a notificação
// e volta a marcá-la como não lida para todos; senão cria uma nova.
function notificarFotos(evento, adicionadas, totalFotos, porId) {
  const recente = db
    .prepare(`SELECT id, tipo FROM notificacoes WHERE tipo IN ('evento', 'fotos') AND referencia_id = ? AND criado_em >= datetime('now', ?) ORDER BY id DESC LIMIT 1`)
    .get(evento.id, JANELA_AGRUPAR);
  const titulo = recente?.tipo === 'evento' ? `Novo evento na galeria: ${evento.titulo}` : `Novas fotos na galeria: ${evento.titulo}`;
  const mensagem = recente?.tipo === 'evento' ? `${totalFotos} foto${totalFotos === 1 ? '' : 's'} no evento` : `${adicionadas} foto${adicionadas === 1 ? '' : 's'} adicionada${adicionadas === 1 ? '' : 's'}`;
  if (recente) {
    db.transaction(() => {
      db.prepare(`UPDATE notificacoes SET titulo = ?, mensagem = ?, criado_em = datetime('now') WHERE id = ?`).run(titulo, mensagem, recente.id);
      db.prepare('DELETE FROM notificacoes_leituras WHERE notificacao_id = ?').run(recente.id);
    })();
  } else criar({ tipo: 'fotos', referenciaId: evento.id, titulo, mensagem, link: `#/galeria/${evento.id}`, porId });
}

function marcarLidas(usuarioId, tipos, referenciaId) {
  db.prepare(
    `INSERT OR IGNORE INTO notificacoes_leituras (notificacao_id, usuario_id)
     SELECT id, ? FROM notificacoes WHERE tipo IN (${tipos.map(() => '?').join(',')}) ${referenciaId ? 'AND referencia_id = ?' : ''}`
  ).run(usuarioId, ...tipos, ...(referenciaId ? [referenciaId] : []));
}

// Notificações visíveis para a pessoa: só dos assuntos que ela acessa, feitas depois do cadastro dela e não criadas por ela.
function visiveis(usuario, guias) {
  const tipos = Object.keys(GUIA_DO_TIPO).filter((t) => guias.includes(GUIA_DO_TIPO[t]));
  if (!tipos.length) return { tipos, sql: '0', params: [] };
  return {
    tipos,
    sql: `n.tipo IN (${tipos.map(() => '?').join(',')}) AND n.criado_em >= ? AND (n.criado_por IS NULL OR n.criado_por <> ?)`,
    params: [...tipos, usuario.criado_em, usuario.id],
  };
}

function listar(usuario, guias, limite = 30) {
  const v = visiveis(usuario, guias);
  const itens = db
    .prepare(
      `SELECT n.id, n.tipo, n.referencia_id, n.titulo, n.mensagem, n.link, n.criado_em,
         EXISTS (SELECT 1 FROM notificacoes_leituras l WHERE l.notificacao_id = n.id AND l.usuario_id = ?) AS lida
       FROM notificacoes n WHERE ${v.sql} ORDER BY n.criado_em DESC, n.id DESC LIMIT ?`
    )
    .all(usuario.id, ...v.params, limite);
  const { n: naoLidas } = db
    .prepare(`SELECT COUNT(*) AS n FROM notificacoes n WHERE ${v.sql} AND NOT EXISTS (SELECT 1 FROM notificacoes_leituras l WHERE l.notificacao_id = n.id AND l.usuario_id = ?)`)
    .get(...v.params, usuario.id);
  return { nao_lidas: naoLidas, itens, ultima_id: itens.reduce((m, i) => Math.max(m, i.id), 0), visiveis: v };
}

module.exports = { criar, excluirDe, notificarFotos, marcarLidas, listar, visiveis };
