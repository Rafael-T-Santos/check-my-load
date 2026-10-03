# Check My Load

Conferência de mercadorias na Neto Distribuidora. Três módulos que rodam no
telemóvel do conferente, mais um painel administrativo.

| Módulo | Rota | O que faz |
|---|---|---|
| **Conferência de Carga** | `/cargo` | Confere os produtos de uma ordem de carga que vai sair, monta sacolas e regista fotos |
| **Contagem de Estoque** | `/estoque` | Conta o estoque físico e devolve o resultado ao ERP |
| **Conferência de Entrada** | `/entrada` | Confere mercadoria que chega do fornecedor, **sem mostrar a quantidade da nota** |
| **Painel administrativo** | `/admin` | Acompanha os três, e decide sobre as divergências de entrada |

> Documentação para quem mexe no código. O manual de operação do galpão vive no
> Notion.

---

## Índice

- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Rodar localmente](#rodar-localmente)
- [Configuração de ambiente](#configuração-de-ambiente)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Deploy](#deploy)
- [Testes](#testes)
- [Os três módulos](#os-três-módulos)
- [Armadilhas conhecidas](#armadilhas-conhecidas)
- [Onde ler mais](#onde-ler-mais)

---

## Arquitetura

```
┌─────────────────────┐
│  ERP Sankhya        │  internal-api-sankhya (Flask + cx_Oracle)
│  192.168.255.6:5000 │  Fonte de verdade: cargas, produtos, contagens,
└──────────┬──────────┘  conferências de entrada
           │ HTTP (servidor-para-servidor, e algumas chamadas do frontend)
┌──────────▼──────────┐
│  Backend local      │  server/index.js — Express, arquivo único
│  192.168.255.6:3000 │  Progresso, fotos (base64), sacolas, histórico,
└──────────┬──────────┘  e toda a lógica da conferência de entrada
           │ pg pool
┌──────────▼──────────┐
│  PostgreSQL         │
│  192.168.255.6:5432 │
└─────────────────────┘

┌─────────────────────┐
│  Frontend           │  React + Vite, servido por nginx
│  192.168.255.6:80   │  Fala com o backend e, em alguns fluxos, direto com o ERP
└─────────────────────┘
```

**A divisão de responsabilidade:** o ERP é a fonte de verdade e é
majoritariamente somente-leitura; o backend local guarda o trabalho em curso
(o que já foi conferido, fotos, sacolas, histórico) e devolve o resultado ao
ERP no fim. É isso que permite continuar a conferir com o Sankhya fora do ar.

O `internal-api-sankhya` é um projeto separado, mantido por nós. O dev do
Sankhya só cria as tabelas customizadas (`AD_*`).

---

## Stack

**Frontend:** React 18, TypeScript, Vite 5, Tailwind + shadcn/ui,
React Router 6, TanStack Query, framer-motion, sonner (toasts),
html5-qrcode (leitor de código de barras por câmera).

**Backend:** Node + Express 4, `pg`. Um arquivo (`server/index.js`), sem
camadas — a mesma escolha do `internal-api-sankhya`.

**Banco:** PostgreSQL 15.

**Infra:** Docker Compose (db + backend + frontend/nginx).

---

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:8080
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 8080 (HTTP) |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm test` | Vitest, uma passagem |
| `npm run test:watch` | Vitest em modo watch |

Backend e banco, se quiser rodar contra um ambiente local em vez de produção:

```bash
docker compose up -d db backend
```

E aponte o frontend para eles com um `.env.local` (ver abaixo).

**Câmera em dev:** o dev server é HTTP, e o `getUserMedia` exige contexto
seguro — mas `localhost` é considerado seguro pelos navegadores, então o leitor
de código de barras funciona em `http://localhost:8080` sem mais nada. Fora de
`localhost` é preciso HTTPS ou a origem liberada no navegador (ver
[Armadilhas](#armadilhas-conhecidas)).

---

## Configuração de ambiente

Os endereços dos dois servidores vivem em [`src/lib/api.ts`](src/lib/api.ts),
com **produção como padrão** — um build sem configuração nenhuma aponta para
onde sempre apontou.

```ts
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://192.168.255.6:3000';
export const ERP_URL = import.meta.env.VITE_ERP_URL ?? 'http://192.168.255.6:5000';
```

Para desenvolver contra um backend local, crie `.env.local` na raiz (ignorado
pelo git e pelo Docker):

```
VITE_API_URL=http://localhost:3000
VITE_ERP_URL=http://localhost:5000
```

**Nunca hardcode o IP num componente** — era assim antes, em 44 lugares, e
apontar o app para outro servidor exigia um search-and-replace fácil de deixar
pela metade.

No backend, `SANKHYA_URL` faz o mesmo papel:

```bash
SANKHYA_URL=http://localhost:5099 node server/index.js
```

---

## Banco de dados e migrations

O `server/init.sql` **só roda na criação do volume**. Num banco que já existe —
ou seja, em produção — ele é ignorado pelo Postgres. Toda tabela nova precisa
de uma migration aplicada à mão:

```bash
docker compose exec -T db psql -U checkmyload -d checkmyloaddb \
  < server/migrations/00X_nome.sql
```

| Migration | O que cria |
|---|---|
| [`001_contagens_estoque.sql`](server/migrations/001_contagens_estoque.sql) | Contagem de estoque |
| [`002_conferencias_entrada.sql`](server/migrations/002_conferencias_entrada.sql) | Conferência de entrada |

Todas usam `CREATE TABLE IF NOT EXISTS` — são idempotentes, pode reexecutar.

Ao criar uma migration, replique as mesmas tabelas no `init.sql`, senão um
volume novo nasce incompleto.

**Verificar o que está aplicado:**

```bash
docker compose exec -T db psql -U checkmyload -d checkmyloaddb -c "\dt"
```

---

## Deploy

```bash
cd /caminho/do/check-my-load
git pull
docker compose up -d --build

# migrations que ainda não correram nesse banco
docker compose exec -T db psql -U checkmyload -d checkmyloaddb \
  < server/migrations/002_conferencias_entrada.sql
```

O volume do Postgres não é tocado pelo `--build`.

O frontend é servido por nginx (portas 80 e 443, com certificado autoassinado
gerado no build da imagem). O acesso em uso hoje é por **HTTP na porta 80**.

---

## Testes

```bash
npm test                              # frontend (vitest)
bash server/tests/teste-concorrencia.sh   # dois conferentes em simultâneo, contra o backend real
```

A cobertura é desigual e vale saber disso: o backend não tem suíte automatizada
no repositório. O módulo de entrada foi validado com testes de aceite escritos
contra o backend real (35 cenários da especificação funcional e 13 de
regressão), mas eles vivem fora do repo — se for mexer nessa área, vale
recriá-los.

---

## Os três módulos

### Conferência de Carga (`/cargo`)

Estado inteiro em [`src/hooks/useCargoProgress.ts`](src/hooks/useCargoProgress.ts).
`src/pages/Index.tsx` é o orquestrador: renderiza um componente por passo de
`currentStep` (`search → brand-selection → verification → bags → photos →
completed`) e recebe todos os callbacks do hook.

O ponto delicado é a **sincronização com vários conferentes na mesma carga**.
A regra está documentada no campo `pendingSync` em
[`src/types/cargo.ts`](src/types/cargo.ts): um número só sai do aparelho quando
alguém acabou de o digitar. Sem isso, dois telemóveis reimpõem as contagens um
do outro em ciclo — já aconteceu.

### Contagem de Estoque (`/estoque`)

[`src/hooks/useEstoqueProgress.ts`](src/hooks/useEstoqueProgress.ts). Mesmo
padrão da carga, mais simples: sem sacolas e sem fotos. Acumula localmente e
sincroniza a cada 30 segundos.

### Conferência de Entrada (`/entrada`)

[`src/hooks/useEntradaProgress.ts`](src/hooks/useEntradaProgress.ts). É o
módulo que quebra o padrão dos outros dois, por um motivo:

> **A conferência é cega.** O conferente conta o que está na doca sem ver a
> quantidade da nota, e o sistema responde apenas OK ou DIVERGENTE.

Daí decorre tudo:

- **A comparação acontece no servidor**, contra um snapshot congelado em
  `conferencias_entrada_itens.qtd_esperada`. Se acontecesse no aparelho, a
  quantidade da nota teria de viajar até lá, e bastaria abrir o DevTools para
  transformar contagem em confirmação induzida.
- **Nenhuma rota `/entrada/*` devolve `qtd_esperada`** — nem em campo, nem em
  mensagem de erro, nem por diferença ("faltam 3"), nem como contagem de
  divergências por cartão. Só `/admin/entradas/*` expõe o valor.
- **Não há acúmulo local nem sync em lote.** Cada leitura e cada quantidade vai
  ao servidor na hora, porque é o servidor que compara.
- **A validação do código de barras também é do servidor**, o que de passagem
  grava a trilha de auditoria em `conferencias_entrada_leituras` — sem ela não
  dá para saber se 120 foi digitado à mão ou se vieram 10 caixas de 12.

Se for mexer aqui, essa é a regra a não quebrar.

### Painel administrativo (`/admin`)

Abas: Cargas, Entradas, Estoque, Usuários.
[`src/components/admin/CargaDetalheModal.tsx`](src/components/admin/CargaDetalheModal.tsx)
cruza dados do backend local e do ERP.
[`src/pages/admin/AdminEntradas.tsx`](src/pages/admin/AdminEntradas.tsx) é onde
a divergência de entrada é liberada, com justificativa obrigatória — e o único
lugar que mostra a quantidade esperada ao lado da conferida.

**Autenticação:** `localStorage` com a chave `usuario`, sem JWT e sem sessão no
servidor. `usuarios.perfil` é `'conferente'` ou `'admin'`.

---

## Armadilhas conhecidas

Coisas que já custaram tempo a alguém.

**`docker compose restart` não aplica mudanças de código.** Os Dockerfiles
copiam o código para dentro da imagem, então é sempre
`docker compose up -d --build <serviço>`. Um `restart` sobe o container com a
versão anterior, e o sintoma costuma ser confuso — uma rota nova responde 404.

**`.env.local` não pode chegar ao servidor.** O `npm run build` roda dentro da
imagem e o Vite lê esse arquivo; se ele entrar no contexto do build, o endereço
de desenvolvimento fica assado no bundle e o app aponta para `localhost` em
todos os telemóveis, sem erro visível. Está no `.gitignore` e no
`.dockerignore`, mas não copie a pasta à mão.

**O `index.html` não pode ficar em cache.** O Vite gera o JS com hash no nome,
então cada versão tem URL própria — mas quem aponta para ela é o `index.html`.
Um telemóvel que guarde um `index.html` velho carrega o bundle velho para
sempre e nenhum deploy o alcança. O `nginx.conf` manda `no-store` nesse arquivo
especificamente; não mexa nisso sem entender a consequência.

**Câmera fora de `localhost` exige contexto seguro.** O leitor de código de
barras usa `getUserMedia`, que só funciona em HTTPS ou em origem marcada como
segura no navegador — hoje `http://192.168.255.6` está liberado manualmente no
Chrome dos aparelhos. Isso vale por dispositivo e não existe em Safari/iOS. A
captura de **foto** não tem esse problema: usa `<input type="file" capture>`.

**Se um dia o acesso passar a HTTPS**, as chamadas a `http://…:3000` viram
*mixed content* e são bloqueadas — só o login sobreviveria, porque é o único
que usa o proxy `/api-local` do nginx. A correção seria mover tudo para esse
proxy (uma linha, agora que os endereços estão centralizados em
`src/lib/api.ts`) e subir o `client_max_body_size` do nginx, senão as fotos em
base64 estouram o limite de 1 MB.

**Fotos são base64 em coluna TEXT.** Funciona e é o padrão em todo o projeto,
mas é pesado. Se o volume crescer, é o primeiro candidato a virar repositório
de arquivos.

---

## Onde ler mais

| Arquivo | O quê |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Referência rápida de arquitetura, para agentes e para quem chega |
| [PLANEJAMENTO_ENTRADA.md](PLANEJAMENTO_ENTRADA.md) | Conferência de entrada: decisões, contrato com o ERP, estado dos testes |
| [PLANEJAMENTO_ESTOQUE.md](PLANEJAMENTO_ESTOQUE.md) | Contagem de estoque: o mesmo, para aquele módulo |
| [server/sankhya/AD_CONF_ENT.sql](server/sankhya/AD_CONF_ENT.sql) | DDL das tabelas da entrada no Sankhya |
| [server/sankhya/exemplo-importar.json](server/sankhya/exemplo-importar.json) | Conferência de exemplo, para testar sem o ERP |
| `internal-api-sankhya/README.md` | Contrato de todos os endpoints do ERP |
