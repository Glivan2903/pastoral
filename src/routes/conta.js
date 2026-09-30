const express = require('express');
const fs = require('fs');
const { db } = require('../db');
const {
  criarSessao, encerrarSessao, exigirLogin, auditar, usuarioPublico,
} = require('../auth');
const {
  ErroValidacao, normalizarNome, normalizarTelefone, normalizarData, normalizarEmail,
  validarSenha, hashSenha, conferirSenha, sha256, novoToken,
} = require('../util');
const { uploadFoto, caminho } = require('../upload');
const { config } = require('../analise');

const r = express.Router();

// Limite simples de tentativas de login por IP (em memória).
const tentativas = new Map();
const LIMITE_TENTATIVAS = Number(process.env.PASTORAL_LIMITE_TENTATIVAS) || 10;
function limitarLogin(req, res, next) {
  const agora = Date.now();
  const chave = `${req.path}|${req.ip}`; // contador separado por rota (login, cadastro, recuperar)
  const t = (tentativas.get(chave) || []).filter((x) => agora - x < 15 * 60 * 1000);
  if (t.length >= LIMITE_TENTATIVAS) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  t.push(agora);
  tentativas.set(chave, t);
  next();
}

r.post('/login', limitarLogin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
  if (!u || !conferirSenha(String(req.body.senha || ''), u.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  criarSessao(res, u.id, novoToken());
  req.usuario = u;
  auditar(req, 'login', 'usuario', u.id);
  res.json(usuarioPublico(u));
});

r.get('/cadastro/status', (req, res) => res.json({ aberto: config('cadastro_aberto') !== '0' }));

// Autocadastro: sempre entra como Usuário (cargo "membro", guias padrão). A administração ajusta depois.
r.post('/cadastro', limitarLogin, (req, res) => {
  if (config('cadastro_aberto') === '0') throw new ErroValidacao('O cadastro está fechado no momento. Fale com a administração.', 403);
  const b = req.body;
  if (b.site) throw new ErroValidacao('Não foi possível concluir o cadastro.'); // campo-isca: só robô preenche
  const nome = normalizarNome(b.nome);
  const email = normalizarEmail(b.email);
  if (!email) throw new ErroValidacao('Informe o e-mail.');
  validarSenha(b.senha);
  if (b.senha !== b.confirmacao) throw new ErroValidacao('A confirmação não confere com a senha.');
  if (!b.consentimento) throw new ErroValidacao('Aceite o uso dos seus dados (LGPD) para criar a conta.');
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) throw new ErroValidacao('Este e-mail já está cadastrado. Entre ou recupere a senha.', 409);
  const info = db
    .prepare(`INSERT INTO usuarios (nome, telefone, data_nascimento, email, funcao, senha_hash, consentimento_lgpd_em) VALUES (?, ?, ?, ?, 'membro', ?, datetime('now'))`)
    .run(nome, normalizarTelefone(b.telefone), normalizarData(b.data_nascimento, 'Data de nascimento'), email, hashSenha(b.senha));
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
  criarSessao(res, u.id, novoToken());
  req.usuario = u;
  auditar(req, 'cadastro', 'usuario', u.id);
  res.status(201).json(usuarioPublico(u));
});

r.post('/logout', (req, res) => {
  encerrarSessao(req, res);
  res.json({ ok: true });
});

// Sem serviço de e-mail local: o link de redefinição é impresso no console do servidor.
r.post('/recuperar-senha', limitarLogin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT id FROM usuarios WHERE email = ? AND ativo = 1').get(email);
  if (u) {
    const token = novoToken();
    db.prepare(`INSERT INTO redefinicoes_senha (token_hash, usuario_id, expira_em) VALUES (?, ?, datetime('now', '+1 hour'))`).run(sha256(token), u.id);
    console.log(`[recuperar-senha] ${email}: http://localhost:${process.env.PORT || 3000}/#/redefinir/${token}`);
  }
  res.json({ ok: true, mensagem: 'Se o e-mail estiver cadastrado, enviamos as instruções de redefinição.' });
});

r.post('/redefinir-senha', (req, res) => {
  validarSenha(req.body.senha);
  const reg = db
    .prepare(`SELECT * FROM redefinicoes_senha WHERE token_hash = ? AND usado_em IS NULL AND expira_em > datetime('now')`)
    .get(sha256(String(req.body.token || '')));
  if (!reg) throw new ErroValidacao('Link inválido ou expirado.');
  db.transaction(() => {
    db.prepare(`UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?`).run(hashSenha(req.body.senha), reg.usuario_id);
    db.prepare(`UPDATE redefinicoes_senha SET usado_em = datetime('now') WHERE token_hash = ?`).run(reg.token_hash);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(reg.usuario_id);
  })();
  res.json({ ok: true });
});

r.get('/me', exigirLogin, (req, res) => res.json(usuarioPublico(req.usuario)));

r.put('/me', exigirLogin, (req, res) => {
  const b = req.body;
  const email = normalizarEmail(b.email);
  if (!email) throw new ErroValidacao('Informe o e-mail.');
  const outro = db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, req.usuario.id);
  if (outro) throw new ErroValidacao('Este e-mail já está em uso.');
  db.prepare(
    `UPDATE usuarios SET nome = ?, telefone = ?, data_nascimento = ?, email = ?, atualizado_em = datetime('now') WHERE id = ?`
  ).run(normalizarNome(b.nome), normalizarTelefone(b.telefone), normalizarData(b.data_nascimento, 'Data de nascimento'), email, req.usuario.id);
  auditar(req, 'atualizar_perfil', 'usuario', req.usuario.id);
  res.json(usuarioPublico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id)));
});

r.put('/me/senha', exigirLogin, (req, res) => {
  const { senha_atual, nova_senha, confirmacao } = req.body;
  if (!conferirSenha(String(senha_atual || ''), req.usuario.senha_hash)) throw new ErroValidacao('A senha atual está incorreta.');
  if (nova_senha !== confirmacao) throw new ErroValidacao('A confirmação não confere com a nova senha.');
  validarSenha(nova_senha);
  db.prepare(`UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?`).run(hashSenha(nova_senha), req.usuario.id);
  auditar(req, 'alterar_senha', 'usuario', req.usuario.id);
  res.json({ ok: true });
});

r.post('/me/foto', exigirLogin, (req, res, next) => {
  uploadFoto(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new ErroValidacao('Envie uma imagem.'));
    if (req.usuario.foto) fs.rm(caminho(req.usuario.foto), { force: true }, () => {});
    db.prepare(`UPDATE usuarios SET foto = ?, atualizado_em = datetime('now') WHERE id = ?`).run(req.file.filename, req.usuario.id);
    res.json({ foto: req.file.filename });
  });
});

module.exports = r;
