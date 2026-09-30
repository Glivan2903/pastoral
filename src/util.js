const crypto = require('crypto');

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

class ErroValidacao extends Error {
  constructor(msg, status = 400) {
    super(msg);
    this.status = status;
  }
}

function normalizarNome(v) {
  const nome = String(v || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2) throw new ErroValidacao('Informe o nome completo.');
  const minusc = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return nome
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && minusc.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

function normalizarTelefone(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  let d = String(v).replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) {
    throw new ErroValidacao('Telefone inválido. Use DDD + número, por exemplo (47) 99999-9999.');
  }
  return d;
}

function formatarTelefone(d) {
  if (!d) return '';
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

// Aceita AAAA-MM-DD ou DD/MM/AAAA.
function normalizarData(v, campo = 'Data') {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  let a, m, d;
  let r;
  if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [, a, m, d] = r;
  else if ((r = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, d, m, a] = r;
  else throw new ErroValidacao(`${campo} inválida.`);
  const dt = new Date(Date.UTC(+a, +m - 1, +d));
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) {
    throw new ErroValidacao(`${campo} inválida.`);
  }
  return `${a}-${m}-${d}`;
}

function normalizarEmail(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const e = String(v).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErroValidacao('E-mail inválido.');
  return e;
}

// Aceita 1234.56, "1234,56" e "1.234,56"; devolve centavos inteiros.
function parseValor(v) {
  if (typeof v === 'number') v = String(v);
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!/^\d+([.,]\d{1,2})?$|^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) throw new ErroValidacao('Valor inválido. Use, por exemplo, 150,00.');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const centavos = Math.round(parseFloat(s) * 100);
  if (!(centavos > 0)) throw new ErroValidacao('O valor precisa ser maior que zero.');
  if (centavos > 99999999999) throw new ErroValidacao('Valor alto demais.');
  return centavos;
}

function validarSenha(s) {
  if (typeof s !== 'string' || s.length < 8 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) {
    throw new ErroValidacao('A senha precisa ter ao menos 8 caracteres, com letras e números.');
  }
}

function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  return `scrypt$${sal}$${crypto.scryptSync(senha, sal, 64).toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  if (!armazenado) return false;
  const [, sal, hash] = armazenado.split('$');
  const calc = crypto.scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calc.length && crypto.timingSafeEqual(calc, esperado);
}

// Contraste WCAG entre duas cores #rrggbb (1 a 21).
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const novoToken = () => crypto.randomBytes(32).toString('hex');

module.exports = {
  hojeISO,
  ErroValidacao,
  normalizarNome,
  normalizarTelefone,
  formatarTelefone,
  normalizarData,
  normalizarEmail,
  validarSenha,
  parseValor,
  contraste,
  hashSenha,
  conferirSenha,
  sha256,
  novoToken,
};
