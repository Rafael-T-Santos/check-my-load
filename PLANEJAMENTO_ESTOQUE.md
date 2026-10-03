# Planejamento: Feature de Contagem de Estoque

## Contexto

O projeto **Check My Load** já possui duas áreas:
- **Conferente** (`/cargo`) — verificação de produtos de uma ordem de carga
- **Admin** (`/admin`) — painel de gestão de cargas e usuários

O objetivo desta feature é adicionar uma **terceira área de contagem de estoque**, integrada ao ERP Sankhya, mantendo o mesmo padrão de sincronização bidirecional já utilizado nas cargas.

---

## Novos endpoints Sankhya (já existem na API)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/api/contagens-pendentes` | Lista contagens com `PROCESSADO` nulo ou `'N'` |
| `POST` | `/api/itens-contagem` | Retorna itens de uma contagem (`{ nuContagem: N }`) |
| `POST` | `/api/registrar-contagem` | Grava as quantidades contadas (`{ nuContagem, itens[] }`) |

---

## Fluxo após a implementação

```
Login
├── Admin  → /admin
│   ├── Aba Cargas    → /admin          (existente)
│   ├── Aba Estoque   → /admin/estoque  (novo)
│   └── Aba Usuários  → /admin/usuarios (existente)
└── Conferente → /selecionar (novo)
    ├── Conferência de Carga  → /cargo   (existente)
    └── Contagem de Estoque   → /estoque (novo)
```

---

## Etapas de implementação

### Fase 1 — Banco de dados

- [x] **Tabela `contagens_estoque`** — sessões de contagem abertas localmente
- [x] **Tabela `contagens_estoque_produtos`** — itens e quantidades contadas
- [x] **Tabela `historico_contagens_estoque`** — log de ações (igual ao de cargas)
- [x] **Índice** `idx_historico_contagem` para performance

> Arquivo: `server/init.sql`
> Todas as tabelas usam `CREATE TABLE IF NOT EXISTS` — seguro rodar no banco existente.

---

### Fase 2 — Backend

- [x] **`GET /sankhya/contagens-pendentes`** — proxy para o Sankhya
- [x] **`POST /sankhya/itens-contagem`** — proxy para o Sankhya
- [x] **`GET /estoque/contagens/:nucontagem/progresso`** — busca progresso salvo no DB
- [x] **`POST /estoque/contagens/:nucontagem/sincronizar`** — upsert de itens + log de histórico
- [x] **`POST /estoque/contagens/:nucontagem/finalizar`** — envia ao Sankhya (`/api/registrar-contagem`) e fecha no DB
- [x] **`GET /admin/contagens-estoque`** — lista todas as contagens para o admin
- [x] **`GET /admin/contagens-estoque/:id`** — detalhes: itens, divergências e histórico

> Arquivo: `server/index.js`

---

### Fase 3 — Frontend

#### 3.1 Tipos TypeScript

- [x] **`src/types/estoque.ts`**
  - `ContagemPendente` — dados de uma contagem do Sankhya
  - `ItemEstoque` — item com `estoqueatual` e `estoquecontagem`
  - `EstoqueStep` — estados da página (`selecionar-contagem | contar-itens | concluido`)

#### 3.2 Hook de estado

- [x] **`src/hooks/useEstoqueProgress.ts`**
  - `carregarContagens()` — busca contagens pendentes no Sankhya
  - `selecionarContagem()` — carrega itens do Sankhya + mescla com progresso do DB
  - `updateItem()` — atualiza quantidade contada localmente
  - `syncWithServer()` — push local → DB + pull DB → tela (sync bidirecional, igual cargas)
  - `finalizar()` — sync + POST Sankhya + marca `finalizada` no DB
  - Auto-sync a cada 30 segundos durante a contagem

#### 3.3 Página de seleção

- [x] **`src/pages/Selecionar.tsx`** — rota `/selecionar`
  - Tela exibida após login do conferente
  - Dois cartões: "Conferência de Carga" e "Contagem de Estoque"

#### 3.4 Página de contagem de estoque

- [x] **`src/pages/Estoque.tsx`** — rota `/estoque`
  - **Passo 1** — lista de contagens pendentes (do Sankhya)
  - **Passo 2** — listagem de itens com campo de quantidade + barra de progresso + busca
  - **Passo 3** — tela de conclusão com opção de nova contagem
  - `ItemCard` com sincronização de valor externo sem interromper digitação

#### 3.5 Página admin de estoque

- [x] **`src/pages/admin/AdminEstoque.tsx`** — rota `/admin/estoque`
  - Tabela com todas as contagens (filtro, ordenação, paginação)
  - Cards de stats (total, em andamento, finalizadas, taxa)
  - Modal de detalhe com itens, divergências destacadas e nome do conferente

#### 3.6 Atualizações em arquivos existentes

- [x] **`src/pages/Login.tsx`** — conferente redirecionado para `/selecionar` após login
- [x] **`src/App.tsx`** — novas rotas (`/selecionar`, `/estoque`, `/admin/estoque`) + imports
- [x] **`src/App.tsx`** — `PublicRoute` atualizado para redirecionar conferente para `/selecionar`
- [x] **`src/pages/admin/AdminLayout.tsx`** — item "Estoque" adicionado ao menu lateral

---

## Pendente (próximos passos)

- [ ] **Aplicar migration no banco de produção** — ver seção "Deploy" abaixo
- [ ] **Testar o fluxo completo** com a API do Sankhya em ambiente real
- [ ] **Validar sync bidirecional** com dois conferentes simultâneos na mesma contagem

---

## Validação de código de barras (implementada)

Campos do Sankhya usados por item (`POST /api/itens-contagem`):

| Campo Sankhya | Campo local | Comportamento |
|---|---|---|
| `ad_validabarra = 'S'` | `hasBarcode: true` | Obrigatório escanear antes de digitar quantidade |
| `ad_validabarra = 'N'` ou `null` | `hasBarcode: false` | Pula scan, vai direto para quantidade |
| `ad_referencia2` (string) | `referencia2` | Exige 2º scan em sequência após o 1º |
| `ad_referencia2 = null` | `referencia2: undefined` | Apenas 1 código necessário |

**Estoque atual (`estoqueatual`) não é exibido** em nenhuma tela do conferente — nem na lista nem no modal.

---

## Deploy

> O `docker compose up -d --build` **não cria as novas tabelas automaticamente**.
> O PostgreSQL só executa o `init.sql` na criação do volume — como o banco de produção já existe, o script é ignorado.

### Passos para subir em produção

```bash
# 1. Puxa o código novo
git pull

# 2. Rebuilda e sobe os containers
docker compose up -d --build

# 3. Roda a migration UMA VEZ (cria as 3 novas tabelas)
docker compose exec -T db psql -U checkmyload -d checkmyloaddb < server/migrations/001_contagens_estoque.sql
```

O passo 3 é **idempotente** — pode ser re-executado sem risco, pois todos os comandos usam `IF NOT EXISTS`.

> Arquivo de migration: `server/migrations/001_contagens_estoque.sql`

---

## Arquivos criados / modificados

| Arquivo | Tipo | Status |
|---------|------|--------|
| `server/init.sql` | Modificado | ✅ Concluído |
| `server/index.js` | Modificado | ✅ Concluído |
| `src/types/estoque.ts` | Criado | ✅ Concluído |
| `src/hooks/useEstoqueProgress.ts` | Criado | ✅ Concluído |
| `src/pages/Selecionar.tsx` | Criado | ✅ Concluído |
| `src/pages/Estoque.tsx` | Criado | ✅ Concluído |
| `src/pages/admin/AdminEstoque.tsx` | Criado | ✅ Concluído |
| `src/pages/Login.tsx` | Modificado | ✅ Concluído |
| `src/App.tsx` | Modificado | ✅ Concluído |
| `src/pages/admin/AdminLayout.tsx` | Modificado | ✅ Concluído |
| `src/types/estoque.ts` | Atualizado | ✅ `hasBarcode` e `referencia2` adicionados |
| `src/hooks/useEstoqueProgress.ts` | Atualizado | ✅ Mapeia `ad_validabarra` e `ad_referencia2` |
| `src/components/estoque/EstoqueVerificationModal.tsx` | Criado | ✅ Modal com scan obrigatório, sem mostrar estoque atual |
| `src/pages/Estoque.tsx` | Atualizado | ✅ Cards clicáveis + modal; sem estoque atual na lista |
