-- Migration 001: Contagem de Estoque
-- Executar UMA VEZ no banco de produção após o deploy.
-- Seguro re-executar (todos os comandos usam IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS contagens_estoque (
    id              SERIAL PRIMARY KEY,
    nucontagem      INTEGER NOT NULL UNIQUE,
    codigo          VARCHAR(50),
    descricao_marca VARCHAR(255),
    codlocal        VARCHAR(50),
    usuario_id      INTEGER REFERENCES usuarios(id),
    status          VARCHAR(20) DEFAULT 'em_andamento',
    observacao      TEXT,
    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contagens_estoque_produtos (
    id                        SERIAL PRIMARY KEY,
    contagem_id               INTEGER REFERENCES contagens_estoque(id),
    nucontagem                INTEGER NOT NULL,
    sequencia                 INTEGER,
    codprod                   VARCHAR(50) NOT NULL,
    descrprod                 TEXT,
    referencia                VARCHAR(100),
    estoque_atual             NUMERIC(10,3),
    estoque_contagem          NUMERIC(10,3),
    conferido_por_usuario_id  INTEGER REFERENCES usuarios(id),
    atualizado_em             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contagem_id, codprod)
);

CREATE TABLE IF NOT EXISTS historico_contagens_estoque (
    id           SERIAL PRIMARY KEY,
    contagem_id  INTEGER REFERENCES contagens_estoque(id),
    usuario_id   INTEGER REFERENCES usuarios(id),
    acao         VARCHAR(50) NOT NULL,
    detalhes     JSONB,
    criado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historico_contagem
    ON historico_contagens_estoque(contagem_id, criado_em DESC);
