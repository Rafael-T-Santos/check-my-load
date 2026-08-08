#!/usr/bin/env bash
#
# Teste de concorrência entre conferentes — dois "aparelhos" contra o backend real.
#
# Reproduz o bug que corrompeu 60 cargas (dois telemóveis a reimpor cada um o seu
# número, e o valor final a ser o de quem sincronizasse por último) e verifica que
# o comportamento novo é o desejado: o eco não corrompe, mas a correção legítima
# de um colega continua a passar — registada, nunca em silêncio.
#
# USO (no servidor, a partir de ~/check-my-load):
#     bash server/tests/teste-concorrencia.sh
#
# Cria uma carga descartável (TESTE-<timestamp>), exercita-a e APAGA tudo no fim,
# inclusive se for interrompido. Não toca em nenhuma carga real.
#
# Rode ANTES do deploy (para ver o bug antigo a acontecer) e DEPOIS (para ver que
# deixou de acontecer). A diferença entre as duas execuções é a prova.

set -u

API="${API:-http://localhost:3000}"
CARGA="TESTE-$(date +%s)"

psql_() { docker compose exec -T db psql -U checkmyload -d checkmyloaddb -tAc "$1" 2>/dev/null | tr -d '\r'; }

sincronizar() { # $1 = usuario_id, $2 = codigo, $3 = quantidade
  curl -s -X POST "$API/cargas/$CARGA/sincronizar" \
    -H 'Content-Type: application/json' \
    -d "{\"produtos\":[{\"codigo\":\"$2\",\"quantidade\":$3,\"marca\":\"TESTE\"}],\"usuario_id\":$1,\"placa\":\"TESTE-0000\"}"
}

limpar() {
  psql_ "DELETE FROM historico_acoes      WHERE carga_id = '$CARGA';" >/dev/null
  psql_ "DELETE FROM conferencias_produtos WHERE carga_id = '$CARGA';" >/dev/null
  psql_ "DELETE FROM conferencias_cargas   WHERE id       = '$CARGA';" >/dev/null
}
trap limpar EXIT

ok=0; falhou=0
verifica() { # $1 = descrição, $2 = esperado, $3 = obtido
  if [ "$2" = "$3" ]; then
    printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1))
  else
    printf '  \033[31m✗ %s\033[0m\n      esperado: [%s]\n      obtido:   [%s]\n' "$1" "$2" "$3"; falhou=$((falhou+1))
  fi
}

# ── Preparação ───────────────────────────────────────────────────────────────
echo "Backend:  $API"
echo "Carga de teste: $CARGA (apagada no fim)"

if ! curl -sf "$API/health" >/dev/null; then
  echo "ERRO: backend não responde em $API/health. Está de pé?"; exit 1
fi

USUARIOS=$(psql_ "SELECT id FROM usuarios ORDER BY id LIMIT 2;")
A=$(echo "$USUARIOS" | sed -n 1p)
B=$(echo "$USUARIOS" | sed -n 2p)
if [ -z "${A:-}" ] || [ -z "${B:-}" ]; then
  echo "ERRO: são precisos 2 utilizadores na tabela usuarios."; exit 1
fi
NOME_A=$(psql_ "SELECT nome FROM usuarios WHERE id = $A;")
echo "Conferente A = $A ($NOME_A) · Conferente B = $B"
echo

qtd()  { psql_ "SELECT quantidade_conferida::FLOAT FROM conferencias_produtos WHERE carga_id='$CARGA' AND produto_codigo='$1';"; }
dono() { psql_ "SELECT conferido_por_usuario_id FROM conferencias_produtos WHERE carga_id='$CARGA' AND produto_codigo='$1';"; }
hist() { psql_ "SELECT count(*) FROM historico_acoes WHERE carga_id='$CARGA' AND acao='$1';"; }

# ── 1. Contagem nova ─────────────────────────────────────────────────────────
echo "1) A conta 10 unidades do produto P1 (primeira contagem)"
R=$(sincronizar "$A" P1 10)
verifica "quantidade gravada"        "10" "$(qtd P1)"
verifica "dono é o A"                "$A" "$(dono P1)"
verifica "sem correções na resposta" "sim" "$(echo "$R" | grep -q '"correcoes":\[\]' && echo sim || echo nao)"
echo

# ── 2. Eco: o mesmo número outra vez ─────────────────────────────────────────
# Era assim que o app antigo se comportava a cada sincronização. Reenviar o mesmo
# valor tem de ser inofensivo E silencioso: nem grava, nem suja o histórico.
echo "2) A reenvia o MESMO 10 (eco do app antigo)"
ANTES=$(hist produto_conferido)
sincronizar "$A" P1 10 >/dev/null
verifica "quantidade intacta"                 "10" "$(qtd P1)"
verifica "não criou linha nova no histórico"  "$ANTES" "$(hist produto_conferido)"
echo

# ── 3. A corrige a própria contagem ──────────────────────────────────────────
echo "3) A corrige a própria contagem: 10 → 12"
sincronizar "$A" P1 12 >/dev/null
verifica "quantidade atualizada" "12" "$(qtd P1)"
verifica "dono continua o A"     "$A" "$(dono P1)"
echo

# ── 4. B corrige a contagem do A ─────────────────────────────────────────────
# ESTE é o caso que motivou refazer a correção: o primeiro conferente pode ter-se
# enganado e o segundo vem consertar. Tem de passar — e tem de ficar registado.
echo "4) B corrige a contagem do A: 12 → 8"
R=$(sincronizar "$B" P1 8)
verifica "quantidade é a do B"                  "8"  "$(qtd P1)"
verifica "dono passou para o B"                 "$B" "$(dono P1)"
verifica "resposta avisa a correção"            "sim" "$(echo "$R" | grep -q '"qtd_anterior":12' && echo sim || echo nao)"
verifica "resposta diz de quem era a contagem"  "sim" "$(echo "$R" | grep -q "\"conferido_por_nome\":\"$NOME_A\"" && echo sim || echo nao)"
verifica "ficou no histórico como alteração"    "1"  "$(hist quantidade_corrigida)"
echo

# ── 5. Concorrência real: dois envios ao mesmo tempo ─────────────────────────
# Prova a transação. Os dois chegam juntos num produto que ainda não existe: um
# tem de criar e o outro tem de VER o que o primeiro escreveu — nunca os dois
# acharem que estão a criar (o que dava linha perdida ou update perdido).
echo "5) A e B sincronizam o produto P2 AO MESMO TEMPO (7 e 9)"
sincronizar "$A" P2 7 >/dev/null &
sincronizar "$B" P2 9 >/dev/null &
wait
verifica "existe exatamente 1 linha do produto" "1" "$(psql_ "SELECT count(*) FROM conferencias_produtos WHERE carga_id='$CARGA' AND produto_codigo='P2';")"
verifica "uma contagem inicial + uma alteração" "1" "$(psql_ "SELECT count(*) FROM historico_acoes WHERE carga_id='$CARGA' AND acao='quantidade_corrigida' AND detalhes->>'produto_codigo'='P2';")"
FINAL=$(qtd P2)
if [ "$FINAL" = "7" ] || [ "$FINAL" = "9" ]; then
  printf '  \033[32m✓\033[0m ficou com um dos dois valores (%s), sem se perder\n' "$FINAL"; ok=$((ok+1))
else
  printf '  \033[31m✗ valor final inesperado: [%s]\033[0m\n' "$FINAL"; falhou=$((falhou+1))
fi
echo

# ── 6. Rastro completo ───────────────────────────────────────────────────────
echo "6) O que o painel vai mostrar na aba Atividade:"
psql_ "SELECT '     ' || to_char(h.criado_em,'HH24:MI:SS') || ' | ' || rpad(u.nome,22) || ' | ' || rpad(h.acao,22) || ' | ' ||
              coalesce(h.detalhes->>'produto_codigo','') || ' ' ||
              coalesce(h.detalhes->>'qtd_anterior','-') || '->' || coalesce(h.detalhes->>'qtd_nova','-')
         FROM historico_acoes h JOIN usuarios u ON u.id=h.usuario_id
        WHERE h.carga_id='$CARGA' ORDER BY h.criado_em, h.id;"
echo

# ── Resultado ────────────────────────────────────────────────────────────────
echo "─────────────────────────────────────────"
if [ "$falhou" -eq 0 ]; then
  printf '\033[32mTODOS OS %s TESTES PASSARAM\033[0m\n' "$ok"
else
  printf '\033[31m%s FALHA(S)\033[0m de %s verificações\n' "$falhou" "$((ok+falhou))"
fi
echo "A carga $CARGA vai ser apagada agora."
[ "$falhou" -eq 0 ]
