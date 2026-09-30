const { db } = require('./db');

// Guias do menu. "fixa" = sempre liberada para quem está logado.
const GUIAS = [
  { id: 'painel', rotulo: 'Início', fixa: true },
  { id: 'minha-presenca', rotulo: 'Minha presença' },
  { id: 'frequencia', rotulo: 'Frequência' },
  { id: 'aniversariantes', rotulo: 'Aniversariantes' },
  { id: 'avisos', rotulo: 'Avisos' },
  { id: 'galeria', rotulo: 'Galeria' },
  { id: 'membros', rotulo: 'Membros' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'usuarios', rotulo: 'Usuários', soAdmin: true },
  { id: 'configuracoes', rotulo: 'Configurações', fixa: true },
];
const EDITAVEIS = GUIAS.filter((g) => !g.fixa && !g.soAdmin).map((g) => g.id);
const PADRAO = {
  coordenacao: GUIAS.filter((g) => !g.soAdmin).map((g) => g.id),
  membro: ['painel', 'minha-presenca', 'avisos', 'galeria', 'configuracoes'], // Usuário comum: só o básico
};

const excecoes = (usuarioId) =>
  new Map(db.prepare('SELECT guia, liberado FROM usuario_guias WHERE usuario_id = ?').all(usuarioId).map((r) => [r.guia, r.liberado === 1]));

function guiasDoUsuario(u) {
  if (u.superadmin) return GUIAS.map((g) => g.id);
  const ex = excecoes(u.id);
  const padrao = PADRAO[u.funcao] || PADRAO.membro;
  return GUIAS.filter((g) => !g.soAdmin).filter((g) => g.fixa || (ex.has(g.id) ? ex.get(g.id) : padrao.includes(g.id))).map((g) => g.id);
}

module.exports = { GUIAS, EDITAVEIS, PADRAO, excecoes, guiasDoUsuario };
