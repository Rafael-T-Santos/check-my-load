/**
 * Fotos gravadas em arquivo, fora do Postgres.
 *
 * Antes cada foto ia para o banco como texto base64 — 99% do tamanho do banco
 * eram imagens (8,7 GB em out/2026). Agora o banco guarda só o caminho
 * relativo na coluna `arquivo`, e a imagem fica em FOTOS_DIR.
 *
 * Toda foto que chega é recomprimida aqui, para WebP. Isso vale também para
 * celulares com uma versão antiga do app em cache, que ainda mandam a foto
 * grande: o tamanho em disco não depende de quem enviou.
 *
 * Linhas antigas que ainda não passaram pelo script de migração continuam com
 * `imagem_base64` preenchido e `arquivo` nulo; `urlFoto` devolve o base64
 * nesse caso, então o app funciona durante a migração.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const FOTOS_DIR = path.resolve(process.env.FOTOS_DIR || path.join(__dirname, 'fotos'));
const MAX_LADO = Number(process.env.FOTO_MAX_LADO) || 1280;
const QUALIDADE = Number(process.env.FOTO_QUALIDADE) || 60;

/** Caminho HTTP em que o Express serve FOTOS_DIR. */
const PREFIXO_URL = '/arquivos-fotos';

/** Tabelas de foto e a pasta de cada uma dentro de FOTOS_DIR. */
const TABELAS = {
  fotos: 'cargas',
  sacolas_fotos: 'sacolas',
  conferencias_entrada_fotos: 'entradas',
};

/**
 * Converte o que o app manda (data URL ou base64 puro) em bytes.
 * Devolve null para o que não é imagem — por exemplo a URL de uma foto já
 * salva, que o app reenvia quando sincroniza as sacolas.
 */
function decodificar(imageData) {
  if (typeof imageData !== 'string' || imageData.length === 0) return null;
  let b64 = imageData;
  if (imageData.startsWith('data:')) {
    const virgula = imageData.indexOf(',');
    if (virgula < 0 || !imageData.slice(0, virgula).includes(';base64')) return null;
    b64 = imageData.slice(virgula + 1);
  } else if (!/^[A-Za-z0-9+/=\s]+$/.test(imageData.slice(0, 200))) {
    return null;
  }
  const buf = Buffer.from(b64, 'base64');
  return buf.length > 0 ? buf : null;
}

/** Reduz para no máximo MAX_LADO no lado maior e regrava como WebP. */
function recomprimir(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate() // aplica a orientação EXIF antes de descartar os metadados
    .resize({ width: MAX_LADO, height: MAX_LADO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALIDADE })
    .toBuffer();
}

/**
 * Recomprime e grava uma foto. Devolve o caminho relativo a FOTOS_DIR, que é
 * o que vai para a coluna `arquivo`.
 *
 * O nome do arquivo é um UUID gerado aqui, nunca o id que veio do app: o id é
 * texto livre do cliente e não pode virar caminho no disco.
 */
async function gravarFoto(pasta, bytes, data = new Date()) {
  const imagem = await recomprimir(bytes);
  const d = data instanceof Date && !isNaN(data) ? data : new Date();
  const ano = String(d.getFullYear());
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const relativo = path.posix.join(pasta, ano, mes, `${crypto.randomUUID()}.webp`);
  const absoluto = path.join(FOTOS_DIR, relativo);

  await fs.mkdir(path.dirname(absoluto), { recursive: true });
  // Grava num temporário e renomeia: um arquivo pela metade nunca fica com o
  // nome final, nem se o processo cair no meio.
  const temporario = `${absoluto}.tmp`;
  await fs.writeFile(temporario, imagem);
  await fs.rename(temporario, absoluto);
  return { arquivo: relativo, bytes: imagem.length };
}

async function apagarArquivos(relativos) {
  await Promise.all(relativos.map(r => fs.unlink(path.join(FOTOS_DIR, r)).catch(() => {})));
}

/**
 * Grava em disco as fotos de um envio que ainda não existem no banco.
 *
 * Roda ANTES da transação: recomprimir leva ~100 ms por foto, e não vale
 * segurar uma conexão do pool com transação aberta enquanto isso. Fotos que
 * já existem são puladas sem tocar no disco — a sincronização de sacolas
 * reenvia todas as fotos a cada vez.
 *
 * Devolve Map(id -> caminho relativo). Se a transação falhar depois, quem
 * chamou deve apagar os arquivos com `apagarArquivos([...mapa.values()])`.
 */
async function prepararFotosNovas(pool, tabela, fotos) {
  const pasta = TABELAS[tabela];
  if (!pasta) throw new Error(`Tabela de fotos desconhecida: ${tabela}`);

  const candidatas = (fotos || [])
    .filter(f => f && f.id != null)
    .map(f => ({ ...f, id: String(f.id), bytes: decodificar(f.imageData) }))
    .filter(f => f.bytes);
  if (candidatas.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT id FROM ${tabela} WHERE id = ANY($1)`,
    [candidatas.map(f => f.id)]
  );
  const existentes = new Set(rows.map(r => r.id));

  const mapa = new Map();
  try {
    for (const f of candidatas) {
      if (existentes.has(f.id) || mapa.has(f.id)) continue;
      const { arquivo } = await gravarFoto(pasta, f.bytes);
      mapa.set(f.id, arquivo);
    }
  } catch (err) {
    await apagarArquivos([...mapa.values()]);
    throw err;
  }
  return mapa;
}

/**
 * O que vai no campo de imagem das respostas: a URL do arquivo, ou o base64
 * antigo enquanto a linha não foi migrada. O app usa o valor direto no
 * `<img src>`, então os dois formatos funcionam sem mudança na tela.
 *
 * A URL é absoluta porque o app chama o backend por outro host (API_URL).
 * Atrás de um proxy que mude o host, defina FOTOS_URL_BASE.
 */
function urlFoto(req, arquivo, base64) {
  if (!arquivo) return base64 ?? null;
  const base = process.env.FOTOS_URL_BASE || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}${PREFIXO_URL}/${arquivo}`;
}

module.exports = {
  FOTOS_DIR,
  PREFIXO_URL,
  TABELAS,
  MAX_LADO,
  QUALIDADE,
  decodificar,
  recomprimir,
  gravarFoto,
  apagarArquivos,
  prepararFotosNovas,
  urlFoto,
};
