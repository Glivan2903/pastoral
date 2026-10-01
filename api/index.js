// Entrada serverless da Vercel. O banco é o Postgres do Supabase (DATABASE_URL), compartilhado entre instâncias.
// Os uploads ainda ficam no disco temporário da função (/tmp): fotos e logotipo não persistem na Vercel.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
process.env.PASTORAL_UPLOADS = process.env.PASTORAL_UPLOADS || '/tmp/pastoral-uploads';

const { up } = require('../src/migrate');
const app = require('../src/app').criarApp();
const pronto = up(); // só migra; os usuários iniciais são criados à mão (`npm run seed`), nunca com senha padrão pública
pronto.catch((e) => console.error('Falha ao preparar o banco:', e.message));

module.exports = (req, res) => pronto.then(() => app(req, res), () => res.status(500).json({ erro: 'Banco indisponível.' }));
