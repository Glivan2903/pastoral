const express = require('express');
const fs = require('fs');
const { db } = require('../db');
const { exigirLogin, exigirSuperadmin, auditar } = require('../auth');
const { ErroValidacao, contraste } = require('../util');
const { config } = require('../analise');
const { uploadLogo, caminho } = require('../upload');

const r = express.Router();
const PADRAO = { cor_principal: '#1d3766', cor_secundaria: '#c8962c' };
const COR = /^#[0-9a-fA-F]{6}$/;
const salvar = db.prepare(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`);

function marca() {
  const logo = config('marca_logo');
  return {
    cor_principal: config('marca_cor_principal') || PADRAO.cor_principal,
    cor_secundaria: config('marca_cor_secundaria') || PADRAO.cor_secundaria,
    logo: logo ? `/api/marca/logo?v=${config('marca_versao') || 0}` : null,
  };
}
const nova_versao = () => salvar.run('marca_versao', String(Date.now()));
const apagarLogo = () => { const f = config('marca_logo'); if (f) fs.rm(caminho(f), { force: true }, () => {}); salvar.run('marca_logo', ''); };

// Público: a tela de login precisa das cores e do logotipo antes de qualquer sessão.
r.get('/', (req, res) => res.json({ ...marca(), padrao: PADRAO }));

r.get('/logo', (req, res) => {
  const f = config('marca_logo');
  if (!f) return res.status(404).json({ erro: 'Sem logotipo.' });
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // a URL muda (?v=) quando o logotipo muda
  res.sendFile(caminho(f));
});

r.put('/cores', exigirLogin, exigirSuperadmin, (req, res) => {
  const { cor_principal: p, cor_secundaria: s } = req.body;
  if (!COR.test(p || '') || !COR.test(s || '')) throw new ErroValidacao('Use cores no formato #RRGGBB.');
  if (contraste(p, '#ffffff') < 4.5) throw new ErroValidacao('A cor principal está clara demais: o texto branco sobre ela ficaria difícil de ler.');
  if (contraste(s, '#2a1c05') < 4.5) throw new ErroValidacao('A cor secundária está escura demais: o texto escuro sobre ela ficaria difícil de ler.');
  db.transaction(() => { salvar.run('marca_cor_principal', p.toLowerCase()); salvar.run('marca_cor_secundaria', s.toLowerCase()); nova_versao(); })();
  auditar(req, 'alterar_cores', 'marca', null, { cor_principal: p, cor_secundaria: s });
  res.json(marca());
});

r.post('/logo', exigirLogin, exigirSuperadmin, (req, res, next) => {
  uploadLogo(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new ErroValidacao('Escolha uma imagem.'));
    apagarLogo();
    db.transaction(() => { salvar.run('marca_logo', req.file.filename); nova_versao(); })();
    auditar(req, 'alterar_logo', 'marca', null);
    res.status(201).json(marca());
  });
});

r.delete('/logo', exigirLogin, exigirSuperadmin, (req, res) => {
  apagarLogo(); nova_versao();
  auditar(req, 'remover_logo', 'marca', null);
  res.json(marca());
});

r.post('/restaurar', exigirLogin, exigirSuperadmin, (req, res) => {
  apagarLogo();
  db.transaction(() => { salvar.run('marca_cor_principal', PADRAO.cor_principal); salvar.run('marca_cor_secundaria', PADRAO.cor_secundaria); nova_versao(); })();
  auditar(req, 'restaurar_marca', 'marca', null);
  res.json(marca());
});

module.exports = r;
