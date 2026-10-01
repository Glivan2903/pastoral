// Entrada serverless da Vercel. O banco é o Postgres do Supabase (DATABASE_URL), compartilhado entre instâncias.
// As imagens ficam no Supabase Storage (SUPABASE_URL, SUPABASE_SERVICE_KEY); sem elas cairia no disco temporário (/tmp).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
process.env.PASTORAL_UPLOADS = process.env.PASTORAL_UPLOADS || '/tmp/pastoral-uploads';

const { up } = require('../src/migrate');
const { garantirBucket } = require('../src/armazenamento');
const app = require('../src/app').criarApp();
const pronto = up().then(garantirBucket); // só migra; os usuários iniciais são criados à mão (`npm run seed`), nunca com senha padrão pública
pronto.catch((e) => console.error('Falha ao preparar o banco:', e.message));

module.exports = (req, res) => pronto.then(() => app(req, res), () => res.status(500).json({ erro: 'Banco indisponível.' }));
