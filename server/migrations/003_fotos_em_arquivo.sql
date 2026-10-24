-- ------------------------------------------------------------------
-- 003 — Fotos em arquivo no disco, fora do banco
--
-- As três tabelas de foto ganham a coluna `arquivo` (caminho relativo a
-- FOTOS_DIR, ver server/fotos.js), e `imagem_base64` deixa de ser
-- obrigatória. Fotos novas entram só com `arquivo`; as antigas mantêm o
-- base64 até o script server/scripts/migrar-fotos.js convertê-las.
--
-- Rodar ANTES de subir o backend novo, que já lê e grava `arquivo`:
--   docker compose exec -T db psql -U checkmyload -d checkmyloaddb \
--     < server/migrations/003_fotos_em_arquivo.sql
--
-- Pode rodar mais de uma vez. ADD COLUMN sem DEFAULT não reescreve a tabela,
-- então é instantâneo mesmo com GBs de fotos.
-- ------------------------------------------------------------------

ALTER TABLE fotos                      ADD COLUMN IF NOT EXISTS arquivo TEXT;
ALTER TABLE sacolas_fotos              ADD COLUMN IF NOT EXISTS arquivo TEXT;
ALTER TABLE conferencias_entrada_fotos ADD COLUMN IF NOT EXISTS arquivo TEXT;

ALTER TABLE fotos                      ALTER COLUMN imagem_base64 DROP NOT NULL;
ALTER TABLE sacolas_fotos              ALTER COLUMN imagem_base64 DROP NOT NULL;
ALTER TABLE conferencias_entrada_fotos ALTER COLUMN imagem_base64 DROP NOT NULL;
