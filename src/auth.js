const crypto = require('crypto');
const { db } = require('./db');
const { sha256 } = require('./util');
const { guiasDoUsuario } = require('./permissoes');

const COOKIE = 'sid';
const DIAS_SESSAO = 7;

// Versão de demonstração (Vercel): cada requisição pode cair numa instância diferente, com banco próprio em /tmp.
// Sessão guardada no banco não sobreviveria; por isso ela vira um cookie assinado que qualquer instância valida
// (todas nascem com os mesmos usuários). Fora da demonstração continua valendo a sessão no banco.
const DEMO = !!process.env.VERCEL || process.env.PASTORAL_DEMO === '1';
const SEGREDO = process.env.SESSION_SECRET || 'pastoral-demo-sessao-publica';
const assinatura = (payload) => crypto.createHmac('sha256', SEGREDO).update(payload).digest('base64url');

function tokenAssinado(usuarioId) {
  const payload = Buffer.from(JSON.stringify({ u: usuarioId, e: Date.now() + DIAS_SESSAO * 86400 * 1000 })).toString('base64url');
  return `${payload}.${assinatura(payload)}`;
}

function usuarioDoTokenAssinado(token) {
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const esperado = Buffer.from(assinatura(payload));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!(e > Date.now())) return null;
    return db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(u) || null;
  } catch { return null; }
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );
}

function criarSessao(res, usuarioId, token) {
  if (DEMO) token = tokenAssinado(usuarioId);
  else {
    db.prepare(`INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', ?))`).run(
      sha256(token),
      usuarioId,
      `+${DIAS_SESSAO} days`
    );
  }
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS_SESSAO * 86400}${process.env.VERCEL ? '; Secure' : ''}`
  );
}

function encerrarSessao(req, res) {
  const t = cookies(req)[COOKIE];
  if (t) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sha256(t));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function exigirLogin(req, res, next) {
  const t = cookies(req)[COOKIE];
  const u = DEMO && t
    ? usuarioDoTokenAssinado(t)
    : t &&
    db
      .prepare(
        `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token_hash = ? AND s.expira_em > datetime('now') AND u.ativo = 1`
      )
      .get(sha256(t));
  if (!u) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = u;
  req.guias = guiasDoUsuario(u);
  next();
}

const nivelCoordenacao = (u) => u.superadmin === 1 || u.funcao === 'coordenacao';

function exigirCoordenacao(req, res, next) {
  if (!nivelCoordenacao(req.usuario)) {
    return res.status(403).json({ erro: 'Apenas a Coordenação pode fazer isso.' });
  }
  next();
}

function exigirSuperadmin(req, res, next) {
  if (req.usuario.superadmin !== 1) return res.status(403).json({ erro: 'Apenas o usuário mestre pode configurar permissões.' });
  next();
}

// Libera a rota só para quem tem a guia (padrão da função + exceções do usuário mestre).
const exigirGuia = (guia) => (req, res, next) => {
  if (!req.guias.includes(guia)) return res.status(403).json({ erro: 'Você não tem acesso a esta guia.' });
  next();
};

function auditar(req, acao, entidade, entidadeId, detalhes) {
  db.prepare('INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, detalhes) VALUES (?, ?, ?, ?, ?)').run(
    req.usuario ? req.usuario.id : null,
    acao,
    entidade,
    entidadeId ?? null,
    detalhes ? JSON.stringify(detalhes) : null
  );
}

function usuarioPublico(u) {
  const guias = guiasDoUsuario(u);
  return {
    id: u.id,
    nome: u.nome,
    telefone: u.telefone,
    data_nascimento: u.data_nascimento,
    email: u.email,
    foto: u.foto,
    funcao: u.funcao,
    superadmin: u.superadmin === 1,
    guias,
    avisos_nao_lidos: guias.includes('avisos')
      ? db.prepare('SELECT COUNT(*) AS n FROM avisos a WHERE NOT EXISTS (SELECT 1 FROM avisos_leituras l WHERE l.aviso_id = a.id AND l.usuario_id = ?)').get(u.id).n
      : 0,
  };
}

module.exports = { criarSessao, encerrarSessao, exigirLogin, exigirCoordenacao, exigirSuperadmin, exigirGuia, nivelCoordenacao, auditar, usuarioPublico };
