# Planejamento: Conferência de Entrada

Terceiro módulo do Check My Load, ao lado de **Conferência de Carga** (`/cargo`) e
**Contagem de Estoque** (`/estoque`). Baseado em
`Especificacao_Funcional_Sistema_Conferencia_Entrada.docx` (v0.1, 27/08/2026).

---

## O princípio que decide a arquitetura

> O conferente não visualiza a quantidade esperada. Ele conta fisicamente e o
> sistema apenas informa se o total está correto ou divergente.

Isso não é um detalhe de interface — é o que define onde cada coisa mora:

| Decisão | Por quê |
|---|---|
| A comparação acontece **no servidor** | Se acontecesse no aparelho, `QTD_ESPERADA` teria de viajar até lá. Bastaria abrir o DevTools ou farejar a rede para transformar contagem em confirmação induzida. |
| Nenhuma rota `/entrada/*` devolve `qtd_esperada` | Nem em campo próprio, nem em mensagem de erro, nem por diferença ("faltam 3"). |
| A validação do código de barras também é do servidor | Além de não confiar na interface, cada bipagem vira trilha de auditoria. |
| A fila **não** mostra contagem de divergências por cartão | Um "2 divergentes de 8" já entrega parte da nota por eliminação. |

O valor esperado só aparece em `/admin/entradas/*`, para quem precisa decidir
sobre a divergência.

---

## O que foi aproveitado da estrutura existente

O módulo é novo, mas quase nada foi escrito do zero:

| Já existia | Uso na entrada |
|---|---|
| `src/components/BarcodeScanner.tsx` | Leitura de EAN13 e EAN14 — sem alteração |
| `src/lib/barcode.ts` (`maskBarcode`) | Mesma razão de sempre: mostrar o código na tela dispensaria ler o produto físico |
| `src/lib/feedback.ts` (`playFeedback`) | Bipe/vibração de acerto e de erro |
| `comTransacao()` em `server/index.js` | Toda escrita da entrada usa a mesma transação de conexão única |
| Padrão `historico_*` + `JSONB detalhes` | `historico_conferencias_entrada` |
| `EstoqueVerificationModal` | Modelo do `EntradaItemModal` (fase de scan → fase de quantidade) |
| `ProductPhotoModal` (`compressImage`) | Base do `EntradaFotoModal` |
| `AdminEstoque.tsx` | Modelo de `AdminEntradas.tsx` (stats, filtro, ordenação, paginação, modal) |
| `useEstoqueProgress` | Modelo de `useEntradaProgress` |
| `Selecionar.tsx` / `AdminLayout.tsx` | Só ganharam mais um cartão e mais um item de menu |

**A única diferença estrutural real:** cargas e estoque acumulam contagem no
aparelho e sincronizam um lote de tempos em tempos. Aqui não dá — cada leitura e
cada quantidade vai ao servidor na hora, porque é o servidor que compara. O que
sobra de "sync" é recarregar a lista para ver o trabalho dos colegas na mesma nota.

---

## Fluxo

```
Sankhya: pré-entrada → botão "Lançar Conferência"
   └─ grava AD_CONF_ENT_CAB + AD_CONF_ENT_ITE (snapshot congelado)

App (/entrada)
   ├─ Fila: cartões por CONFERÊNCIA + MARCA
   ├─ Itens da marca: pendente (cinza) / OK (verde) / divergente (laranja)
   ├─ Item: bipa EAN13 → digita   |   bipa EAN14 → soma o fator, N vezes
   │        + foto + observação
   └─ Finalizar
        ├─ tudo OK          → CONCLUÍDA_SEM_DIVERGÊNCIA → envia ao ERP
        └─ alguma divergência → AGUARDANDO_LIBERAÇÃO

Painel (/admin/entradas)
   ├─ Liberar (justificativa obrigatória) → CONCLUÍDA_COM_DIVERGÊNCIA → envia ao ERP
   ├─ Devolver para nova conferência (contagem preservada ou zerada)
   └─ Cancelar (preserva histórico)
```

---

## Banco de dados local (Postgres)

`server/migrations/002_conferencias_entrada.sql` — também replicado em `init.sql`
para volumes novos.

| Tabela | Papel |
|---|---|
| `conferencias_entrada` | Cabeçalho, status, auditoria da liberação |
| `conferencias_entrada_itens` | Snapshot: `qtd_esperada` (nunca sai daqui), `qtd_conferida`, `status_item` |
| `conferencias_entrada_marcas` | Lock consultivo por marca — quem abriu é o responsável |
| `conferencias_entrada_leituras` | Trilha de bipagens: sem ela não se sabe se 120 foi digitado ou se vieram 10 caixas de 12 |
| `conferencias_entrada_fotos` | Fotos por item (`item_id` NULL = foto da conferência) |
| `historico_conferencias_entrada` | Log de ações |

### Deploy no servidor Linux

```bash
cd /caminho/do/check-my-load
git pull

# 1. Sobe o código novo. O volume do Postgres não é tocado.
docker compose up -d --build

# 2. Cria as tabelas da entrada. O init.sql NÃO roda em volume existente,
#    por isso a migration é manual. É idempotente (IF NOT EXISTS).
docker compose exec -T db psql -U checkmyload -d checkmyloaddb   < server/migrations/002_conferencias_entrada.sql

# 3. Confere que as 6 tabelas existem.
docker compose exec -T db psql -U checkmyload -d checkmyloaddb   -c "\dt conferencias_entrada*"
```

Enquanto o Sankhya não expuser os endpoints, a fila nasce vazia e o app mostra
o aviso "Sankhya indisponível" — que é o comportamento correto, não uma falha.
Para ter o que conferir na tela:

```bash
curl -X POST http://192.168.255.6:3000/entrada/conferencias/importar      -H 'Content-Type: application/json'      -d @server/sankhya/exemplo-importar.json
```

**Cuidados que já custaram tempo:**

- Alterar `server/index.js` exige `docker compose up -d --build backend`. Um
  `restart` reinicia o container mas mantém a cópia do código feita no build.
- `.env.local` nunca pode chegar ao servidor. O `npm run build` corre dentro da
  imagem e o Vite lê esse arquivo — o endereço de desenvolvimento ficaria assado
  no bundle e o app apontaria para `localhost` em todos os telemóveis, sem erro
  visível. Está no `.gitignore` e no `.dockerignore`, mas não o copie à mão.
- Se a máquina tiver `server/node_modules`, o build só passa com o
  `server/.dockerignore` (incluído nesta entrega).

### Desenvolver contra o backend local

`src/lib/api.ts` tem os dois endereços num sítio só, com a produção como padrão.
Para apontar o app ao Docker local, crie `.env.local` na raiz (ignorado pelo git):

```
VITE_API_URL=http://localhost:3000
VITE_ERP_URL=http://localhost:5000
```

Depois `docker compose up -d db backend` e `npm run dev`. Note que uma alteração
em `server/index.js` exige `docker compose up -d --build backend` — um `restart`
reinicia o container mas mantém a cópia do código feita no build.

---

## Tabelas do Sankhya (ainda não criadas)

DDL sugerido em **`server/sankhya/AD_CONF_ENT.sql`** (Oracle, com as diferenças
para SQL Server no final).

- `AD_CONF_ENT_CAB` — cabeçalho + sequence + índice único **funcional** que
  impede duas conferências ativas para a mesma pré-entrada sem bloquear
  relançamento de notas já concluídas.
- `AD_CONF_ENT_ITE` — itens com `QTD_ESPERADA` congelada e `CHECK` garantindo que
  EAN14 sem fator de conversão não entra.
- `AD_CONF_ENT_LEITURA` — **opcional.** O app já grava toda leitura no Postgres.
  Só vale a pena se a auditoria precisar acontecer dentro do ERP.
- `AD_CONF_ENT_ANEXO` — **sugerimos não criar.** As fotos ficam em
  `conferencias_entrada_fotos`, no mesmo padrão de cargas e sacolas. Se um dia o
  administrativo precisar vê-las dentro do ERP, o caminho certo é o repositório de
  anexos nativo do Sankhya — não uma coluna CLOB com base64, que é justamente o
  que a especificação desaconselha.

Depois do DDL, registrar as tabelas no dicionário (TDDTAB / TDDCAM) e criar a
ação **"Lançar Conferência"** na tela de pré-entrada.

### Divisão de trabalho

| Quem | O quê |
|---|---|
| Dev do Sankhya | Cria as tabelas `AD_CONF_ENT_*` e a ação "Lançar Conferência" na tela de pré-entrada |
| Nós | Os três endpoints REST, no projeto **`internal-api-sankhya`** (Flask + `cx_Oracle`, tudo em `app.py`) |

### Endpoints a acrescentar na `internal-api-sankhya`

São o análogo direto de `/api/contagens-pendentes`, `/api/itens-contagem` e
`/api/registrar-contagem`, que já existem para a contagem de estoque — o mesmo
formato de resposta e o mesmo tratamento de erro servem aqui.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| `GET` | `/api/conferencias-entrada-pendentes` | — | `{ sucesso, totalRegistros, dados: [...] }` com `nuconf, nunota, codemp, numnota, fornecedor, dtprevista, qtdvolumes` |
| `POST` | `/api/itens-conferencia-entrada` | `{ nuConf }` | idem, com `sequencia, sequencia_orig, codprod, descrprod, marca, unidade, ean13, ean14, fator_ean14, qtd_esperada` |
| `POST` | `/api/registrar-conferencia-entrada` | `{ nuConf, status, itens: [{ seqConf, codProd, qtdConferida, statusItem, observacao }] }` | `{ sucesso }` |

O backend aceita tanto `[...]` cru quanto o envelope `{ dados: [...] }`, que é o
padrão da `internal-api-sankhya` — não é preciso mudar a convenção.

**Nomes das colunas:** a API devolve as colunas do Oracle em minúsculas
(`col[0].lower()`), então um `SELECT *` traz `seqconf` e `descrprod_snap`, não
`sequencia` e `descrprod`. O importador aceita as duas grafias, mas o mais
legível é usar alias no SQL:

```sql
SELECT I.SEQCONF        AS SEQUENCIA,
       I.DESCRPROD_SNAP AS DESCRPROD,
       I.SEQUENCIA_ORIG, I.CODPROD, I.MARCA, I.UNIDADE,
       I.EAN13, I.EAN14, I.FATOR_EAN14, I.QTD_ESPERADA
  FROM AD_CONF_ENT_ITE I
 WHERE I.NUCONF = :NUCONF
 ORDER BY I.SEQCONF
```

`/api/itens-conferencia-entrada` **é servidor-para-servidor**: devolve
`qtd_esperada`, mas quem chama é o backend do Check My Load, nunca o aplicativo.
Ele guarda o valor no Postgres e não o repassa adiante.

**Enquanto o ERP não estiver pronto**, o módulo já roda inteiro via
`POST /entrada/conferencias/importar`:

```json
{
  "cabecalho": { "nuconf": 1, "nunota": 55001, "numnota": "12345",
                 "fornecedor": "FORTLEV", "dt_prevista": "2026-09-02", "qtd_volumes": 30 },
  "itens": [
    { "codprod": "1001", "descrprod": "Caixa d'água 500L", "marca": "FORTLEV",
      "unidade": "UN", "ean13": "7891234567895", "ean14": "17891234567892",
      "fator_ean14": 12, "qtd_esperada": 36 }
  ]
}
```

---

## Endpoints do backend local

### Aplicativo — conferência cega

| Método | Rota | Nota |
|---|---|---|
| `GET` | `/entrada/fila` | Puxa o ERP e devolve cartões. **Responde com o cache local se o ERP cair** — recebimento no pátio não pode parar por falha de integração |
| `POST` | `/entrada/conferencias/:nuconf/marcas/:marca/abrir` | Itens sem `qtd_esperada` + estado do lock; `{ assumir: true }` toma a marca (auditado) |
| `POST` | `/entrada/itens/:id/leituras` | EAN13 libera digitação; EAN14 soma o fator; código alheio → **422 sem alterar nada** |
| `POST` | `/entrada/itens/:id/quantidade` | Exige leitura prévia — salvo produto sem EAN cadastrado |
| `POST` | `/entrada/itens/:id/zerar` | Volta a PENDENTE, com registro |
| `POST` | `/entrada/itens/:id/observacao` | |
| `GET`/`POST` | `/entrada/itens/:id/fotos` | |
| `POST` | `/entrada/conferencias/:nuconf/finalizar` | Recusa com item pendente; decide entre concluída e aguardando liberação |

### Painel administrativo

| Método | Rota |
|---|---|
| `GET` | `/admin/entradas` |
| `GET` | `/admin/entradas/:id` — itens, leituras, fotos e histórico |
| `POST` | `/admin/entradas/:id/liberar` — justificativa obrigatória (mín. 5 caracteres) |
| `POST` | `/admin/entradas/:id/devolver` — `{ zerar_itens }` opcional |
| `POST` | `/admin/entradas/:id/cancelar` — motivo obrigatório |

---

## Arquivos

| Arquivo | Tipo |
|---|---|
| `server/migrations/002_conferencias_entrada.sql` | Criado |
| `server/sankhya/AD_CONF_ENT.sql` | Criado (DDL sugerido para o ERP) |
| `server/init.sql` | Modificado (mesmas tabelas, para volume novo) |
| `server/index.js` | Modificado (+~800 linhas: seção da entrada) |
| `src/types/entrada.ts` | Criado |
| `src/hooks/useEntradaProgress.ts` | Criado |
| `src/pages/Entrada.tsx` | Criado |
| `src/components/entrada/EntradaItemModal.tsx` | Criado |
| `src/components/entrada/EntradaFotoModal.tsx` | Criado |
| `src/pages/admin/AdminEntradas.tsx` | Criado |
| `src/lib/api.ts` | Criado — `API_URL`/`ERP_URL` com override por env var |
| `server/.dockerignore` | Criado — corrige o build do backend |
| `src/App.tsx` | Modificado (rotas `/entrada` e `/admin/entradas`) |
| `src/pages/Selecionar.tsx` | Modificado (terceiro cartão) |
| `src/pages/admin/AdminLayout.tsx` | Modificado (menu "Entradas") |

---

## Cenários de aceite da especificação × implementação

| Cenário | Onde está |
|---|---|
| EAN13 + quantidade igual → verde/OK | `statusDoItem()` + `POST /quantidade` |
| EAN13 + quantidade diferente → laranja/DIVERGENTE | idem |
| EAN14 fator 12 lido 3× → 36 | `POST /leituras`, ramo `ehEan14` |
| EAN de outro produto → rejeitado, quantidade intacta | 422 antes de qualquer `UPDATE` |
| Todos OK → finaliza sem liberação | `POST /finalizar` |
| Existe divergente → AGUARDANDO_LIBERAÇÃO | idem |
| Liberar sem justificativa → bloqueado | `POST /admin/entradas/:id/liberar` (400) |
| Liberar com justificativa → conclui e audita | idem |
| Duas notas da mesma marca ficam separadas | Cartão é `(nuconf, marca)`; a chave da fila inclui o `nuconf` |

---

## Estado dos testes

Rodado contra Postgres real (`docker compose up -d db backend`), num volume que
já existia — ou seja, com o `init.sql` ignorado, igual à produção.

- Migration 002 aplicada: 6 tabelas + 4 índices, e idempotente na re-execução.
- **35 cenários de aceite** da seção 11 da especificação, incluindo a verificação
  de que `qtd_esperada` não aparece em nenhuma resposta de `/entrada/*`.
- **13 testes de regressão** dos bugs encontrados no walkthrough das telas.
- Telas percorridas no navegador: fila, lock por marca, contagem OK e divergente,
  produto sem EAN, recusa de finalização, tela de conclusão e painel admin com a
  trilha de bipagens.

### Bugs encontrados durante o teste e já corrigidos

| Bug | Sintoma | Correção |
|---|---|---|
| Liberação fantasma | `devolver` não limpava `justificativa`/`liberado_por`, então a conferência voltava à fila exibindo "Divergência liberada por Fulano" — o administrativo via como resolvido o que aguardava a decisão dele | `devolver` zera os três campos |
| Recontagem sem bipagem | "Zerar todas as contagens" limpava as quantidades mas não a trilha, e a bipagem antiga continuava valendo: dava para digitar a quantidade sem voltar a ler o produto | Zerar em massa grava uma leitura `zerar`, e a regra de "já identificado" só conta leituras posteriores a ela |
| Regra duplicada | A tela e o `/quantidade` decidiam "já bipou?" com SQL escrito separadamente, e divergiram: a tela exigia leitura que o servidor dispensava (e o inverso, depois da primeira correção) | Constante `SQL_JA_IDENTIFICADO`, usada nos dois sítios |
| Build do backend | `docker compose build backend` falhava com `archive/tar: unknown file mode` em máquina com `server/node_modules` — o `.dockerignore` da raiz não vale para o contexto `./server` | `server/.dockerignore` criado |

## Pendente

- [ ] **Criar as tabelas `AD_CONF_ENT_*` no Sankhya** e a ação "Lançar Conferência"
- [ ] **Escrever os três endpoints** na `internal-api-sankhya` (ver seção acima)
- [ ] **Rodar a migration 002** no banco de produção
- [ ] Testar dois conferentes em marcas diferentes da mesma nota, em aparelhos
      reais (o `server/tests/teste-concorrencia.sh` das cargas serve de modelo)
- [ ] Testar a câmera num aparelho — o fluxo de fotos e o leitor de código de
      barras foram exercitados pela API, não pelo hardware

---

## Decisões que a especificação deixou em aberto

A seção 12 do documento lista seis pontos. Foram resolvidos assim — cada um é
reversível se o negócio decidir diferente:

| Pergunta | O que foi feito |
|---|---|
| Fonte da data prevista | `AD_CONF_ENT_CAB.DTPREVISTA`, copiada da pré-entrada no lançamento |
| Fonte do EAN13/EAN14/fator | Cadastro do produto, copiado para o snapshot no lançamento — assim um recadastro no meio do recebimento não muda a regra de contagem em curso |
| Por nota, por marca, ou dividida? | **Uma conferência por pré-entrada**, com a marca como agrupamento visual — a recomendação do próprio documento. Vários conferentes podem trabalhar em marcas diferentes da mesma nota; a finalização é da nota inteira e só passa quando todos os itens estiverem contados |
| Liberação ajusta a pré-entrada? | **Não.** A liberação autoriza o fluxo seguinte e envia as quantidades físicas ao ERP; ajustar a nota é decisão fiscal e fica com o Sankhya |
| Onde ficam as fotos | `conferencias_entrada_fotos` (base64 em tabela dedicada), mesmo padrão de cargas e sacolas — sem introduzir dependência nova |
| Pode zerar a contagem de um item? | **Sim**, e gera histórico (`item_zerado`) mais um registro `zerar` na trilha de leituras |

### Duas coisas que a especificação não previu, e que valem uma decisão

**1. Lock por marca.** A regra 7 pede um responsável para evitar dupla contagem,
mas um lock rígido trava o galpão quando alguém sai para o almoço com a marca
aberta. Ficou **consultivo**: quem abre primeiro é o responsável, quem chega
depois vê a lista e precisa clicar em "Assumir" — e a tomada fica no histórico.
Se a operação preferir bloqueio rígido, é uma linha em `/marcas/:marca/abrir`.

**2. Risco residual da conferência cega.** O veredicto imediato por item (OK /
DIVERGENTE), que a própria especificação pede na seção 4.5, permite descobrir a
quantidade da nota por tentativa: digita 10 → divergente, 11 → divergente, 12 →
OK. É inerente ao desenho proposto. Duas mitigações possíveis, se preocupar:

- A trilha de leituras **já torna isso visível** — um item com seis gravações
  manuais seguidas salta aos olhos no painel. É a mitigação mais barata e já está
  no lugar.
- Limitar regravações por item, ou só revelar o veredicto na finalização. Ambas
  custam usabilidade e nenhuma foi implementada, porque contrariam a seção 4.5.
