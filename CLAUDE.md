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

### Two modules

**Conferência de Cargas** (`/cargo`) — the main feature. A "conferente" loads a cargo by ID, checks products against expected quantities, creates bags ("sacolas"), takes photos, and finalizes. State is managed entirely in `src/hooks/useCargoProgress.ts`.

**Contagem de Estoque** (`/estoque`) — stock counting flow. Managed in `src/hooks/useEstoqueProgress.ts`, mirrors the cargo flow pattern but simpler (no bags, no photos).

### Data flow

```
ERP (port 5000)  ──POST /api/consultar-ordem-carga──▶  Frontend
                                                         │
Local Backend (port 3000)  ◀──── reads/writes ──────────┘
PostgreSQL  ◀──── pg pool ────────────────────────────── Backend
```

- **ERP** (`192.168.255.6:5000`): read-only source of truth for cargo/product data and stock counts. The backend proxies some ERP calls.
- **Local backend** (`192.168.255.6:3000`): stores progress, photos (as base64 TEXT), bags, and history.
- **`/api-local` proxy**: Vite dev server proxies `/api-local/*` → `http://192.168.255.6:3000/*` to avoid CORS in dev, but production code calls the backend IP directly.

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
- Passwords are stored in plain text (`usuarios.senha`).
- Auth is `localStorage`-based (`'usuario'` key); no JWT or server sessions.
- `usuarios.perfil` is either `'conferente'` or `'admin'`. Admins go to `/admin`, conferentes go to `/selecionar`.

### Admin panel

`src/components/admin/CargaDetalheModal.tsx` is a large self-contained modal that fetches and cross-references data from both the local backend and ERP. It has tabs: Resumo, Produtos, Pendências, Sacolas, Fotos, Atividade, Observações. The `ErpItem` interface in that file must be kept in sync with the fields actually used from the ERP response.

### Path alias

`@` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`).

### HTTPS / camera

In dev (`npm run dev`), the app runs HTTP on port 8080 — browsers allow camera access on `localhost` over HTTP. The `basicSsl` Vite plugin is only activated in production builds, enabling HTTPS required for camera access on non-localhost devices.
