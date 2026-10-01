// ZIP "store" (sem compressão; JPG/PNG/WebP já são comprimidos), escrito em streaming para não segurar tudo na memória.
const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDataHora(d = new Date()) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// arquivos: [{ nome, ler: () => Promise<Buffer> }]; saida: stream gravável (res).
async function escreverZip(saida, arquivos) {
  const { hora, data } = dosDataHora();
  const central = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const dados = await a.ler();
    const nome = Buffer.from(a.nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(data, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nome.length, 26); local.writeUInt16LE(0, 28);
    saida.write(local); saida.write(nome); saida.write(dados);
    const reg = Buffer.alloc(46);
    reg.writeUInt32LE(0x02014b50, 0); reg.writeUInt16LE(20, 4); reg.writeUInt16LE(20, 6); reg.writeUInt16LE(0x0800, 8); reg.writeUInt16LE(0, 10);
    reg.writeUInt16LE(hora, 12); reg.writeUInt16LE(data, 14); reg.writeUInt32LE(crc, 16);
    reg.writeUInt32LE(dados.length, 20); reg.writeUInt32LE(dados.length, 24); reg.writeUInt16LE(nome.length, 28);
    reg.writeUInt32LE(deslocamento, 42);
    central.push(Buffer.concat([reg, nome]));
    deslocamento += 30 + nome.length + dados.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(deslocamento, 16);
  saida.write(dir);
  saida.end(fim);
}

module.exports = { escreverZip, crc32 };
