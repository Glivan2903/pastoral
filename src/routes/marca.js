const express = require('express');
const fs = require('fs');
const { db } = require('../db');
const { exigirLogin, exigirSuperadmin, auditar } = require('../auth');
const { ErroValidacao, contraste } = require('../util');
const { config } = require('../analise');
const { uploadLogo, caminho } = require('../upload');

const r = express.Router();
const DEMO = process.env.PASTORAL_DEMO === '1'; // publicado como demonstração
const PADRAO = { cor_principal: '#1d3766', cor_secundaria: '#c8962c' };
const COR = /^#[0-9a-fA-F]{6}$/;
const salvar = db.prepare(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`);

async function marca() {
  const logo = await config('marca_logo');
  return {
    cor_principal: await config('marca_cor_principal') || PADRAO.cor_principal,
    cor_secundaria: await config('marca_cor_secundaria') || PADRAO.cor_secundaria,
    logo: logo ? `/api/marca/logo?v=${await config('marca_versao') || 0}` : null,
    demo: DEMO,
  };
}
const nova_versao = () => salvar.run('marca_versao', String(Date.now()));
const apagarLogo = async () => { const f = await config('marca_logo'); if (f) fs.rm(caminho(f), { force: true }, () => {}); await salvar.run('marca_logo', ''); };

// Público: a tela de login precisa das cores e do logotipo antes de qualquer sessão.
r.get('/', async (req, res) => res.json({ ...(await marca()), padrao: PADRAO }));

r.get('/logo', async (req, res) => {
  const f = await config('marca_logo');
  if (!f) return res.status(404).json({ erro: 'Sem logotipo.' });
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // a URL muda (?v=) quando o logotipo muda
  res.sendFile(caminho(f));
});

r.put('/cores', exigirLogin, exigirSuperadmin, async (req, res) => {
  const { cor_principal: p, cor_secundaria: s } = req.body;
  if (!COR.test(p || '') || !COR.test(s || '')) throw new ErroValidacao('Use cores no formato #RRGGBB.');
  if (contraste(p, '#ffffff') < 4.5) throw new ErroValidacao('A cor principal está clara demais: o texto branco sobre ela ficaria difícil de ler.');
  if (contraste(s, '#2a1c05') < 4.5) throw new ErroValidacao('A cor secundária está escura demais: o texto escuro sobre ela ficaria difícil de ler.');
  await db.transaction(async () => { await salvar.run('marca_cor_principal', p.toLowerCase()); await salvar.run('marca_cor_secundaria', s.toLowerCase()); await nova_versao(); })();
  await auditar(req, 'alterar_cores', 'marca', null, { cor_principal: p, cor_secundaria: s });
  res.json(await marca());
});

r.post('/logo', exigirLogin, exigirSuperadmin, async (req, res, next) => {
  uploadLogo(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(new ErroValidacao('Escolha uma imagem.'));
    await apagarLogo();
    await db.transaction(async () => { await salvar.run('marca_logo', req.file.filename); await nova_versao(); })();
    await auditar(req, 'alterar_logo', 'marca', null);
    res.status(201).json(await marca());
  });
});

r.delete('/logo', exigirLogin, exigirSuperadmin, async (req, res) => {
  await apagarLogo(); await nova_versao();
  await auditar(req, 'remover_logo', 'marca', null);
  res.json(await marca());
});

r.post('/restaurar', exigirLogin, exigirSuperadmin, async (req, res) => {
  await apagarLogo();
  await db.transaction(async () => { await salvar.run('marca_cor_principal', PADRAO.cor_principal); await salvar.run('marca_cor_secundaria', PADRAO.cor_secundaria); await nova_versao(); })();
  await auditar(req, 'restaurar_marca', 'marca', null);
  res.json(await marca());
});

module.exports = r;
