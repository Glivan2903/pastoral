// Armazenamento de imagens e vídeos: Supabase Storage (bucket privado) ou disco local.
// Com SUPABASE_SERVICE_KEY definida usa o Storage; senão, disco (desenvolvimento e testes).
// PASTORAL_STORAGE=local força o disco. O banco guarda só o nome do arquivo; o prefixo (testes) fica fora dele.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { UPLOAD_DIR, ROOT } = require('./db');

if (!process.env.SUPABASE_SERVICE_KEY && fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'pastoral-midia';
const PREFIXO = process.env.PASTORAL_STORAGE_PREFIX || '';
const USA_STORAGE = process.env.PASTORAL_STORAGE !== 'local' && !!CHAVE && !!URL_BASE;
const LIMITE_BUCKET = 50 * 1024 * 1024;

const objeto = (nome) => encodeURI(`${PREFIXO}${path.basename(nome)}`);
const cab = (extra = {}) => ({ apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, ...extra });
const url = (nome) => `${URL_BASE}/storage/v1/object/${BUCKET}/${objeto(nome)}`;
// O Storage guarda leituras em cache de borda; sem um parâmetro único, um arquivo já apagado ainda seria entregue por um tempo.
const urlLeitura = (nome) => `${url(nome)}?cb=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

async function falhou(r, acao) {
  let detalhe = '';
  try { detalhe = (await r.text()).slice(0, 200); } catch { /* sem corpo */ }
  const e = new Error(`Storage: falha ao ${acao} (${r.status}) ${detalhe}`);
  e.status = r.status;
  return e;
}

// Cria o bucket privado se ainda não existir (idempotente).
let bucketPronto = null;
function garantirBucket() {
  if (!USA_STORAGE) return Promise.resolve();
  bucketPronto ??= (async () => {
    const r = await fetch(`${URL_BASE}/storage/v1/bucket`, {
      method: 'POST',
      headers: cab({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: LIMITE_BUCKET }),
    });
    if (r.ok) return;
    const texto = await r.text();
    if (r.status === 409 || /already exists|Duplicate/i.test(texto)) return;
    throw new Error(`Storage: não foi possível criar o bucket "${BUCKET}" (${r.status}) ${texto.slice(0, 200)}`);
  })().catch((e) => { bucketPronto = null; throw e; });
  return bucketPronto;
}

async function guardar(nome, dados, mimetype) {
  if (!USA_STORAGE) {
    await fs.promises.writeFile(path.join(UPLOAD_DIR, path.basename(nome)), dados);
    return;
  }
  await garantirBucket();
  const r = await fetch(url(nome), { method: 'POST', headers: cab({ 'Content-Type': mimetype, 'x-upsert': 'false' }), body: dados });
  if (!r.ok) throw await falhou(r, 'enviar');
}

// Nunca lança: apagar arquivo é limpeza, não pode derrubar a requisição.
async function remover(nome) {
  if (!nome) return;
  try {
    if (!USA_STORAGE) await fs.promises.rm(path.join(UPLOAD_DIR, path.basename(nome)), { force: true });
    else await fetch(url(nome), { method: 'DELETE', headers: cab() });
  } catch (e) { console.error('[armazenamento] não removeu', nome, e.message); }
}

async function ler(nome) {
  if (!USA_STORAGE) return fs.promises.readFile(path.join(UPLOAD_DIR, path.basename(nome)));
  const r = await fetch(urlLeitura(nome), { headers: cab() });
  if (!r.ok) throw await falhou(r, 'ler');
  return Buffer.from(await r.arrayBuffer());
}

// Entrega o arquivo na resposta. baixarComo: nome sugerido para download.
async function servir(res, nome, baixarComo) {
  if (!USA_STORAGE) {
    const arquivo = path.join(UPLOAD_DIR, path.basename(nome));
    return new Promise((ok, falha) => {
      const fim = (err) => (err ? falha(err) : ok());
      if (baixarComo) res.download(arquivo, baixarComo, fim); else res.sendFile(arquivo, fim);
    });
  }
  const r = await fetch(urlLeitura(nome), { headers: cab() });
  if (r.status === 404 || r.status === 400) { const e = new Error('Arquivo não encontrado.'); e.status = 404; throw e; }
  if (!r.ok) throw await falhou(r, 'ler');
  res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
  const tam = r.headers.get('content-length');
  if (tam) res.setHeader('Content-Length', tam);
  if (baixarComo) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(baixarComo)}`);
  await new Promise((ok, falha) => {
    const corpo = Readable.fromWeb(r.body);
    corpo.on('error', falha);
    res.on('close', ok);
    corpo.pipe(res);
  });
}

// Motor de armazenamento do multer: guarda no destino certo e informa só o nome do arquivo.
function motor(gerarNome) {
  if (!USA_STORAGE) {
    return require('multer').diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, gerarNome(file)) });
  }
  return {
    _handleFile(req, file, cb) {
      const pedacos = [];
      file.stream.on('data', (p) => pedacos.push(p));
      file.stream.on('error', cb);
      file.stream.on('end', async () => {
        if (file.stream.truncated) return cb(new Error('Arquivo grande demais.')); // o multer já responde LIMIT_FILE_SIZE
        const filename = gerarNome(file);
        const dados = Buffer.concat(pedacos);
        try {
          await guardar(filename, dados, file.mimetype);
          cb(null, { filename, path: filename, size: dados.length });
        } catch (e) { cb(e); }
      });
    },
    _removeFile(req, file, cb) { remover(file.filename).then(() => cb(null), () => cb(null)); },
  };
}

module.exports = { USA_STORAGE, BUCKET, garantirBucket, guardar, remover, ler, servir, motor };
