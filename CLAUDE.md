# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm run dev        # Dev server on port 8080 (HTTP — camera works on localhost)
npm run build      # Production build (enables HTTPS via basicSsl plugin)
npm run lint       # ESLint
npm run test       # Run tests once (vitest)
npm run test:watch # Watch mode
```

### Backend (`server/`)
```bash
cd server && npm run dev   # Starts Express on port 3000 (node index.js)
```

### Full stack (Docker)
```bash
docker compose up          # Runs db (5432) + backend (3000) + frontend (80/443)
```

The database is initialized from `server/init.sql` only on a **fresh volume**. Schema changes added after initial setup (e.g., `ALTER TABLE fotos ADD COLUMN pedido_id`) must be run manually against the running Postgres container — they are not applied automatically by Docker.

## Architecture

### Three modules

**Conferência de Cargas** (`/cargo`) — the main feature. A "conferente" loads a cargo by ID, checks products against expected quantities, creates bags ("sacolas"), takes photos, and finalizes. State is managed entirely in `src/hooks/useCargoProgress.ts`.

**Contagem de Estoque** (`/estoque`) — stock counting flow. Managed in `src/hooks/useEstoqueProgress.ts`, mirrors the cargo flow pattern but simpler (no bags, no photos).

**Conferência de Entrada** (`/entrada`) — goods-receipt checking. Managed in `src/hooks/useEntradaProgress.ts`. See `PLANEJAMENTO_ENTRADA.md`.

This module is **blind** (`conferência cega`): the conferente never sees the expected quantity. That constraint drives its architecture and makes it the odd one out:

- The OK/DIVERGENTE comparison happens **on the server**, against a frozen snapshot in `conferencias_entrada_itens.qtd_esperada`.
- **No route under `/entrada/*` may return `qtd_esperada`** — not as a field, not inside an error message, not as a difference ("faltam 3"), and not as a per-card divergence count. Only `/admin/entradas/*` exposes it.
- Unlike cargo and estoque, there is **no local batching and no periodic bulk sync**. Every scan and every quantity goes to the server immediately, because the server is what compares. `recarregarItens()` only pulls in colleagues' work.
- Barcode validation is server-side too, which doubles as the audit trail in `conferencias_entrada_leituras` (EAN13 identifies and unlocks manual entry; EAN14 adds `fator_ean14` per scan).

The Sankhya-side tables (`AD_CONF_ENT_*`) **do not exist yet** — suggested DDL is in `server/sankhya/AD_CONF_ENT.sql`, and the three ERP endpoints it needs are specified in `PLANEJAMENTO_ENTRADA.md`. Until they exist, `POST /entrada/conferencias/importar` seeds a conference directly.

### Data flow

```
ERP (port 5000)  ──POST /api/consultar-ordem-carga──▶  Frontend
                                                         │
Local Backend (port 3000)  ◀──── reads/writes ──────────┘
PostgreSQL  ◀──── pg pool ────────────────────────────── Backend
```

- **ERP** (`192.168.255.6:5000`): read-only source of truth for cargo/product data and stock counts. The backend proxies some ERP calls.
- **Local backend** (`192.168.255.6:3000`): stores progress, photos (as base64 TEXT), bags, and history.
- **`/api-local` proxy**: Vite dev server proxies `/api-local/*` → `http://192.168.255.6:3000/*` to avoid CORS in dev. Little used — most code calls the backend through `API_URL` instead.
- **`src/lib/api.ts`**: single source for both hosts. `API_URL` and `ERP_URL` default to the production IPs and are overridden by `VITE_API_URL` / `VITE_ERP_URL` in a gitignored `.env.local`. Never hardcode the IP in a component — that is what this module replaced.

### Frontend state machine

`useCargoProgress.ts` is the central hook for the cargo flow. It owns:
- `currentStep`: `'search' | 'brand-selection' | 'verification' | 'bags' | 'photos' | 'completed'`
- All products, photos, and bags state
- All API calls (ERP fetch + local backend sync)

`src/pages/Index.tsx` renders one component per step based on `currentStep` — it is the orchestrator and should receive all callbacks from the hook and pass them down.

### Photo types

Photos share a single `fotos` DB table and `PhotoRecord` TS type, differentiated by optional fields:

| Type | `produtoCodigo` | `pedidoId` | When saved |
|------|----------------|------------|------------|
| Finalization | — | — | Batched on `completeConference()` |
| Product | set | — | Immediately via `addProductPhoto()` |
| Order | — | set | Immediately via `addOrderPhoto()` |
| Bag | n/a | n/a | Separate `sacolas_fotos` table |

Filters for finalization photos must always be `!p.produtoCodigo && !p.pedidoId`.

### Database schema key points

- `fotos.produto_codigo` and `fotos.pedido_id` were added after `init.sql` via `ALTER TABLE` — they are **not** in `init.sql`.
- Conferência de Entrada tables live in `server/migrations/002_conferencias_entrada.sql` (also mirrored into `init.sql` for fresh volumes). Run the migration manually on an existing database.
- Passwords are stored in plain text (`usuarios.senha`).
- Auth is `localStorage`-based (`'usuario'` key); no JWT or server sessions.
- `usuarios.perfil` is either `'conferente'` or `'admin'`. Admins go to `/admin`, conferentes go to `/selecionar`.
- From `/selecionar`, conferentes pick one of the three flows: `/cargo`, `/estoque`, or `/entrada`.

### Admin panel

Tabs: Cargas (`/admin`), Entradas (`/admin/entradas`), Estoque (`/admin/estoque`), Usuários (`/admin/usuarios`).

`src/pages/admin/AdminEntradas.tsx` is the divergence-release panel — it is the only place that shows `qtd_esperada` alongside `qtd_conferida`, plus the scan-by-scan audit trail. Releasing a divergence requires a justificativa.

`src/components/admin/CargaDetalheModal.tsx` is a large self-contained modal that fetches and cross-references data from both the local backend and ERP. It has tabs: Resumo, Produtos, Pendências, Sacolas, Fotos, Atividade, Observações. The `ErpItem` interface in that file must be kept in sync with the fields actually used from the ERP response.

### Path alias

`@` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`).

### HTTPS / camera

In dev (`npm run dev`), the app runs HTTP on port 8080 — browsers allow camera access on `localhost` over HTTP. The `basicSsl` Vite plugin is only activated in production builds, enabling HTTPS required for camera access on non-localhost devices.
