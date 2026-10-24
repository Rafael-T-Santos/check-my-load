#!/usr/bin/env node
/**
 * Tira as fotos antigas do banco: recomprime cada uma, grava em FOTOS_DIR e
 * aponta a linha para o arquivo. Ver server/fotos.js.
 *
 * Roda dentro do container do backend, que tem o volume de fotos e o sharp:
 *
 *   docker compose exec backend node scripts/migrar-fotos.js <etapa>
 *
 * Etapas, nesta ordem:
 *
 *   amostra [N]  Converte N fotos de cada tabela (padrão 20) para
 *                FOTOS_DIR/_amostra e mostra o tamanho antes e depois. Não
 *                altera o banco. Serve para abrir as imagens e conferir se a
 *                qualidade está boa antes de converter tudo.
 *
 *   migrar       Converte todas as fotos que ainda não têm arquivo e preenche
 *                a coluna `arquivo`. O base64 CONTINUA no banco, então nada
 *                se perde se algo der errado. Pode ser interrompido (Ctrl+C) e
 *                rodado de novo: continua de onde parou.
 *
 *   limpar       Para cada foto com `arquivo`, confere que o arquivo existe no
 *                disco e só então apaga o base64. ESTA é a etapa sem volta.
 *                Depois dela o espaço ainda não volta para o disco: falta o
 *                VACUUM FULL que o script imprime no final.
 */
const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
const fotosArquivo = require('../fotos');

const pool = new Pool({
  user: process.env.DB_USER || 'checkmyload',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'checkmyloaddb',
  password: process.env.DB_PASSWORD || 'supersecretpassword',
  port: 5432,
});

const TABELAS = Object.keys(fotosArquivo.TABELAS);
// Lote pequeno: cada linha traz ~300 kB de base64 para a memória.
const LOTE = 20;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const kb = (bytes) => `${Math.round(bytes / 1024)} kB`;

function dataDe(valor) {
  const d = valor ? new Date(valor) : null;
  return d && !isNaN(d) ? d : new Date();
}

async function amostra(n) {
  const destino = path.join(fotosArquivo.FOTOS_DIR, '_amostra');
  await fs.mkdir(destino, { recursive: true });
  console.log(`Configuração: lado máximo ${fotosArquivo.MAX_LADO}px, WebP qualidade ${fotosArquivo.QUALIDADE}`);
  console.log(`Amostras em ${destino}\n`);

  for (const tabela of TABELAS) {
    const { rows } = await pool.query(
      `SELECT id, imagem_base64 FROM ${tabela}
        WHERE imagem_base64 IS NOT NULL
        ORDER BY capturado_em DESC NULLS LAST LIMIT $1`,
      [n]
    );
    let antes = 0, depois = 0, ok = 0;
    for (const r of rows) {
      const bytes = fotosArquivo.decodificar(r.imagem_base64);
      if (!bytes) { console.log(`  ${tabela} ${r.id}: não é imagem, pulada`); continue; }
      try {
        const webp = await fotosArquivo.recomprimir(bytes);
        const nome = `${tabela}-${String(r.id).replace(/[^\w-]/g, '_')}`;
        await fs.writeFile(path.join(destino, `${nome}-original.jpg`), bytes);
        await fs.writeFile(path.join(destino, `${nome}-novo.webp`), webp);
        antes += r.imagem_base64.length; depois += webp.length; ok++;
      } catch (err) {
        console.log(`  ${tabela} ${r.id}: erro ao converter (${err.message})`);
      }
    }
    if (ok === 0) { console.log(`${tabela}: nenhuma foto em base64`); continue; }
    console.log(
      `${tabela}: ${ok} fotos | média no banco ${kb(antes / ok)} -> em disco ${kb(depois / ok)}` +
      ` (${Math.round((1 - depois / antes) * 100)}% menor)`
    );
  }
}

async function migrar() {
  for (const tabela of TABELAS) {
    const pasta = fotosArquivo.TABELAS[tabela];
    // count(*) não lê o base64, então é rápido mesmo com GBs.
    const { rows: [{ total }] } = await pool.query(
      `SELECT count(*)::int AS total FROM ${tabela} WHERE arquivo IS NULL AND imagem_base64 IS NOT NULL`
    );
    console.log(`\n${tabela}: ${total} fotos para converter`);
    if (total === 0) continue;

    let ultimoId = '';
    let feitas = 0, erros = 0, antes = 0, depois = 0;
    const inicio = Date.now();

    for (;;) {
      // Paginação pelo id (chave primária): cada lote lê só as suas linhas.
      const { rows } = await pool.query(
        `SELECT id, imagem_base64, capturado_em FROM ${tabela}
          WHERE arquivo IS NULL AND imagem_base64 IS NOT NULL AND id > $1
          ORDER BY id LIMIT ${LOTE}`,
        [ultimoId]
      );
      if (rows.length === 0) break;
      ultimoId = rows[rows.length - 1].id;

      await Promise.all(rows.map(async (r) => {
        const bytes = fotosArquivo.decodificar(r.imagem_base64);
        if (!bytes) { erros++; console.log(`  ${r.id}: não é imagem, mantida no banco`); return; }
        try {
          const { arquivo, bytes: tamanho } = await fotosArquivo.gravarFoto(pasta, bytes, dataDe(r.capturado_em));
          const up = await pool.query(
            `UPDATE ${tabela} SET arquivo = $2 WHERE id = $1 AND arquivo IS NULL`,
            [r.id, arquivo]
          );
          // O backend gravou outra versão no meio do caminho: fica a dele.
          if (up.rowCount === 0) { await fotosArquivo.apagarArquivos([arquivo]); return; }
          feitas++; antes += r.imagem_base64.length; depois += tamanho;
        } catch (err) {
          erros++;
          console.log(`  ${r.id}: erro ao converter (${err.message}), mantida no banco`);
        }
      }));

      const seg = (Date.now() - inicio) / 1000;
      const ritmo = feitas / Math.max(seg, 1);
      const resta = ritmo > 0 ? Math.round((total - feitas - erros) / ritmo / 60) : '?';
      process.stdout.write(
        `\r  ${feitas + erros}/${total} | ${mb(antes)} -> ${mb(depois)} | erros ${erros} | faltam ~${resta} min   `
      );
    }
    console.log(`\n  pronto: ${feitas} convertidas, ${erros} com erro (continuam em base64)`);
  }
  console.log('\nO base64 continua no banco. Confira as fotos no painel admin e depois rode a etapa "limpar".');
}

async function limpar() {
  const limpas = [];
  for (const tabela of TABELAS) {
    let ultimoId = '';
    let apagadas = 0, faltando = 0;
    for (;;) {
      // Não seleciona o base64: IS NOT NULL não precisa ler o conteúdo.
      const { rows } = await pool.query(
        `SELECT id, arquivo FROM ${tabela}
          WHERE arquivo IS NOT NULL AND imagem_base64 IS NOT NULL AND id > $1
          ORDER BY id LIMIT 500`,
        [ultimoId]
      );
      if (rows.length === 0) break;
      ultimoId = rows[rows.length - 1].id;

      const conferidas = [];
      for (const r of rows) {
        const st = await fs.stat(path.join(fotosArquivo.FOTOS_DIR, r.arquivo)).catch(() => null);
        if (st && st.size > 0) { conferidas.push(r.id); continue; }
        // Sem arquivo, a tela mostraria imagem quebrada. Desfaz o vínculo: a
        // foto volta a sair do base64 e o próximo "migrar" gera o arquivo de novo.
        faltando++;
        await pool.query(`UPDATE ${tabela} SET arquivo = NULL WHERE id = $1 AND arquivo = $2`, [r.id, r.arquivo]);
        console.log(`\n  ${tabela} ${r.id}: arquivo ${r.arquivo} não encontrado; base64 mantido, rode "migrar" de novo`);
      }
      if (conferidas.length > 0) {
        const up = await pool.query(
          `UPDATE ${tabela} SET imagem_base64 = NULL WHERE id = ANY($1) AND arquivo IS NOT NULL`,
          [conferidas]
        );
        apagadas += up.rowCount;
      }
      process.stdout.write(`\r${tabela}: ${apagadas} base64 apagados   `);
    }
    console.log(`\r${tabela}: ${apagadas} base64 apagados, ${faltando} mantidos por falta de arquivo   `);
    if (apagadas > 0) limpas.push(tabela);
  }

  if (limpas.length > 0) {
    console.log(`
O espaço só volta para o disco depois do VACUUM FULL. Ele trava a tabela
enquanto roda (o app não consegue salvar foto nesse tempo), então rode fora do
horário de trabalho:

  docker compose exec db psql -U checkmyload -d checkmyloaddb -c "VACUUM (FULL, ANALYZE) ${limpas.join(', ')};"
`);
  }
}

async function main() {
  const [etapa, arg] = process.argv.slice(2);
  if (etapa === 'amostra') await amostra(Number(arg) || 20);
  else if (etapa === 'migrar') await migrar();
  else if (etapa === 'limpar') await limpar();
  else {
    console.log('Uso: node scripts/migrar-fotos.js amostra [N] | migrar | limpar');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => { console.error('\nFalhou:', err); process.exitCode = 1; })
  .finally(() => pool.end());
