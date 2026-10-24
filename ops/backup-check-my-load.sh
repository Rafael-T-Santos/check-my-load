#!/usr/bin/env bash
# Backup diário do check-my-load: banco (tudo menos o schema `televendas`, que
# tem backup próprio em ~/televendas/ops) e o volume de fotos.
#
# Instalar no cron do usuário nitia, depois do backup do televendas:
#   45 2 * * * $HOME/check-my-load/ops/backup-check-my-load.sh >> $HOME/backups/check-my-load/backup.log 2>&1
#
# Banco: um .sql.gz por dia, guarda DIAS dias.
# Fotos: cópia espelho em $DESTINO/fotos. Foto gravada nunca muda (o nome é um
# UUID), então cada noite copia só as novas. Nada é apagado da cópia.
#
# ATENÇÃO: fica no MESMO disco do servidor. Protege contra apagar dados por
# engano, não contra perder o servidor. A cópia para fora ainda não foi decidida.
#
# Restaurar o banco (num banco vazio, com o init.sql já aplicado ou não):
#   zcat check-my-load-AAAA-MM-DD-HHMM.sql.gz | docker exec -i check-my-load-db-1 psql -U checkmyload -d checkmyloaddb
# Restaurar as fotos:
#   docker run --rm -v check-my-load_fotos:/destino -v ~/backups/check-my-load/fotos:/origem:ro node:18-alpine cp -R -p /origem/. /destino/
set -euo pipefail
# Nunca falhar calado: qualquer erro deixa no log a linha e o código de saída.
trap 'echo "$(date -Is) FALHOU na linha $LINENO (código $?) — confira ~/backups/check-my-load"' ERR

DESTINO="${DESTINO:-$HOME/backups/check-my-load}"
DIAS="${DIAS:-30}"
CONTAINER="${CONTAINER:-check-my-load-db-1}"
VOLUME_FOTOS="${VOLUME_FOTOS:-check-my-load_fotos}"
# Imagem que já existe no servidor (base do backend): não depende de internet.
IMAGEM="${IMAGEM:-node:18-alpine}"
mkdir -p "$DESTINO/fotos"

psql_valor() { docker exec "$CONTAINER" psql -U checkmyload -d checkmyloaddb -tAc "$1"; }

# ── Trava: enquanto as fotos antigas estiverem em base64 no banco, cada dump
# teria GBs e 30 dias deles encheriam o disco. Só roda depois do
# `migrar-fotos.js limpar` (ver server/migrations/003_fotos_em_arquivo.md).
BASE64=$(psql_valor "SELECT (SELECT count(*) FROM fotos WHERE imagem_base64 IS NOT NULL)
                          + (SELECT count(*) FROM sacolas_fotos WHERE imagem_base64 IS NOT NULL)
                          + (SELECT count(*) FROM conferencias_entrada_fotos WHERE imagem_base64 IS NOT NULL)")
if [ "$BASE64" -gt 100 ]; then
  echo "$(date -Is) PULADO: ainda há $BASE64 fotos em base64 no banco. Rode 'migrar-fotos.js limpar' e o VACUUM FULL."
  exit 0
fi

# ── Banco
ARQ="$DESTINO/check-my-load-$(date +%F-%H%M).sql.gz"
# pipefail: se o pg_dump falhar, o script falha (e não grava um .gz vazio como se fosse backup).
docker exec "$CONTAINER" pg_dump -U checkmyload -d checkmyloaddb --exclude-schema=televendas --no-owner --no-privileges \
  | gzip > "$ARQ.tmp"

# Só vira backup se o arquivo estiver íntegro E tiver as tabelas dentro.
# grep -c (e não grep -q): o -q fecha a leitura ao achar o texto, o zcat morre
# com SIGPIPE e o pipefail derruba o script em silêncio. Mesmo cuidado do
# backup do televendas (incidente de 03/10).
gzip -t "$ARQ.tmp"
zcat "$ARQ.tmp" | grep -c "CREATE TABLE public.conferencias_cargas" > /dev/null
mv "$ARQ.tmp" "$ARQ"
find "$DESTINO" -maxdepth 1 -name 'check-my-load-*.sql.gz' -mtime +"$DIAS" -delete

# ── Fotos
# O volume pertence ao root e o cron roda como nitia: um container lê o volume
# e grava na pasta do nitia com o uid dele. -n não sobrescreve o que já foi
# copiado, então só as fotos novas são transferidas. Os .tmp são uploads em
# andamento na hora do backup; a versão final entra na noite seguinte.
docker run --rm -u "$(id -u):$(id -g)" \
  -v "$VOLUME_FOTOS":/origem:ro \
  -v "$DESTINO/fotos":/destino \
  "$IMAGEM" sh -c 'cp -R -p -n /origem/. /destino/ && find /destino -name "*.tmp" -delete && rm -rf /destino/_amostra'

# Confere: toda foto do volume tem que estar na cópia.
NO_VOLUME=$(docker run --rm -v "$VOLUME_FOTOS":/origem:ro "$IMAGEM" sh -c 'find /origem -name "*.webp" ! -path "*/_amostra/*" | wc -l')
NA_COPIA=$(find "$DESTINO/fotos" -name '*.webp' | wc -l)
if [ "$NA_COPIA" -lt "$NO_VOLUME" ]; then
  echo "$(date -Is) FALHOU: volume tem $NO_VOLUME fotos e a cópia só $NA_COPIA"
  exit 1
fi

echo "$(date -Is) OK $ARQ $(du -h "$ARQ" | cut -f1) | fotos $NA_COPIA ($(du -sh "$DESTINO/fotos" | cut -f1))"
