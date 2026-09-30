// Entrada serverless da Vercel. O disco da Vercel é temporário: o banco e os uploads ficam em /tmp
// e são recriados (com dados de exemplo) a cada inicialização da função. Uso: demonstração.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
process.env.PASTORAL_DB = process.env.PASTORAL_DB || '/tmp/pastoral.db';
process.env.PASTORAL_UPLOADS = process.env.PASTORAL_UPLOADS || '/tmp/pastoral-uploads';

require('../src/seed').semear({ demo: 'completo', log: () => {} }); // migra e cria usuários + dados de exemplo
module.exports = require('../src/app').criarApp();
