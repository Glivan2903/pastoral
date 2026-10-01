const multer = require('multer');
const { novoToken, ErroValidacao } = require('./util');
const { motor } = require('./armazenamento');

const TIPOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

// Nome aleatório (o nome enviado pelo usuário nunca é usado); o destino é o Supabase Storage ou o disco local.
const storage = motor((file) => novoToken().slice(0, 24) + TIPOS[file.mimetype]);

const fileFilter = (req, file, cb) =>
  TIPOS[file.mimetype] ? cb(null, true) : cb(new ErroValidacao('Formato não aceito. Envie JPG, PNG, WebP, MP4, WebM ou MOV.'));

const uploadMidia = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } }).single('arquivo');
const uploadFoto = multer({
  storage,
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') && TIPOS[file.mimetype] ? cb(null, true) : cb(new ErroValidacao('A foto precisa ser JPG, PNG ou WebP.')),
  limits: { fileSize: 3 * 1024 * 1024 },
}).single('arquivo');

const IMAGENS = ['image/jpeg', 'image/png', 'image/webp'];
const uploadFotos = multer({
  storage,
  fileFilter: (req, file, cb) => (IMAGENS.includes(file.mimetype) ? cb(null, true) : cb(new ErroValidacao('Envie apenas fotos JPG, PNG ou WebP.'))),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
}).array('fotos', 20);

const uploadLogo = multer({
  storage,
  fileFilter: (req, file, cb) => (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new ErroValidacao('O logotipo precisa ser PNG, JPG ou WebP.'))),
  limits: { fileSize: 2 * 1024 * 1024 },
}).single('arquivo');

const tipoMidia = (mimetype) => (mimetype.startsWith('video/') ? 'video' : 'imagem');

module.exports = { uploadMidia, uploadFoto, uploadFotos, uploadLogo, tipoMidia };
