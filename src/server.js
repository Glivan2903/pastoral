process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const { up } = require('./migrate');
const { criarApp } = require('./app');

up(); // garante o schema atualizado ao subir
if (!require('./db').db.prepare('SELECT 1 FROM usuarios WHERE superadmin = 1').get()) console.warn('Atenção: não há usuário mestre. Rode `npm run seed` para criá-lo.');
const porta = Number(process.env.PORT) || 3000;
criarApp().listen(porta, () => console.log(`Pastoral do Acolhimento rodando em http://localhost:${porta}`));
