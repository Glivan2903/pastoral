const express = require('express');
const path = require('path');
const { exigirLogin, exigirGuia } = require('./auth');
const { ErroValidacao } = require('./util');
const { caminho } = require('./upload');

function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.use('/api/marca', require('./routes/marca')); // leitura pública (a tela de login usa); escrita só do administrador
  app.use('/api', require('./routes/conta'));
  app.use('/api/membros', exigirLogin, exigirGuia('membros'), require('./routes/membros'));
  app.use('/api/frequencia', exigirLogin, exigirGuia('frequencia'), require('./routes/frequencia'));
  app.use('/api/notificacoes', exigirLogin, require('./routes/notificacoes'));
  app.use('/api/galeria', exigirLogin, exigirGuia('galeria'), require('./routes/galeria'));
  app.use('/api/financeiro', exigirLogin, exigirGuia('financeiro'), require('./routes/financeiro'));
  app.use('/api/avisos', exigirLogin, exigirGuia('avisos'), require('./routes/avisos'));
  app.use('/api/usuarios', exigirLogin, exigirGuia('usuarios'), require('./routes/usuarios'));
  app.use('/api', exigirLogin, require('./routes/geral'));

  // Mídias só para quem está logado.
  app.get('/uploads/:arquivo', exigirLogin, (req, res) => res.sendFile(caminho(req.params.arquivo)));

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ErroValidacao) return res.status(err.status).json({ erro: err.message });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo grande demais.' });
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ erro: 'Envie no máximo 20 fotos por vez.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
    if (/UNIQUE constraint failed/.test(err.message || '')) return res.status(409).json({ erro: 'Registro duplicado.' });
    if (err.status === 404 || err.code === 'ENOENT') return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  });
  return app;
}

module.exports = { criarApp };
