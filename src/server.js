process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const { up } = require('./migrate');
const { db } = require('./db');
const { garantirBucket, USA_STORAGE, BUCKET } = require('./armazenamento');
const { criarApp } = require('./app');

(async () => {
  await up(); // garante o schema atualizado ao subir
  await garantirBucket(); // cria o bucket privado no Supabase Storage, se for o caso
  console.log(USA_STORAGE ? `Imagens no Supabase Storage (bucket "${BUCKET}").` : 'Imagens no disco local (data/uploads).');
  if (!(await db.prepare('SELECT 1 FROM usuarios WHERE superadmin = 1').get())) console.warn('Atenção: não há usuário mestre. Rode `npm run seed` para criá-lo.');
  const porta = Number(process.env.PORT) || 3000;
  criarApp().listen(porta, () => console.log(`Pastoral do Acolhimento rodando em http://localhost:${porta}`));
})().catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
