-- Usuários (Conferentes)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) UNIQUE NOT NULL, -- O login (ex: 'admin')
    matricula VARCHAR(50) UNIQUE,
    perfil VARCHAR(20) DEFAULT 'conferente', -- 'conferente', 'admin'        
    senha VARCHAR(255) NOT NULL,         -- A senha real
    ativo BOOLEAN DEFAULT TRUE
);

-- Inserir um usuário padrão para os testes (com usuário e senha)
INSERT INTO usuarios (nome, usuario, matricula, senha, perfil)
VALUES ('Toshiba', 'toshiba', '0001', '1251', 'admin') 
ON CONFLICT DO NOTHING;

-- Inserir um conferente padrão para testes
INSERT INTO usuarios (nome, usuario, matricula, senha, perfil) 
VALUES ('João Conferente', 'conferente', '0002', '1234', 'conferente') 
ON CONFLICT DO NOTHING;

-- Controle de Cargas (Cabeçalho)
CREATE TABLE IF NOT EXISTS conferencias_cargas (
    id VARCHAR(50) PRIMARY KEY, -- A ordemCarga (ex: '1251')
    placa VARCHAR(20),
    status VARCHAR(20) DEFAULT 'em_andamento', -- 'em_andamento', 'finalizada'
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Produtos Conferidos (O detalhe da concorrência)
-- Aqui garantimos que sabemos quem bipou qual marca/produto
CREATE TABLE IF NOT EXISTS conferencias_produtos (
    id SERIAL PRIMARY KEY,
    carga_id VARCHAR(50) REFERENCES conferencias_cargas(id),
    produto_codigo VARCHAR(50) NOT NULL,
    quantidade_conferida NUMERIC(10,3) NOT NULL,
    conferido_por_usuario_id INTEGER REFERENCES usuarios(id),
    marca VARCHAR(100),
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(carga_id, produto_codigo) -- Evita duplicatas do mesmo produto na mesma carga
);

-- Registro de Fotos
CREATE TABLE IF NOT EXISTS fotos (
    id VARCHAR(100) PRIMARY KEY,
    carga_id VARCHAR(50) REFERENCES conferencias_cargas(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    arquivo TEXT,                 -- caminho em FOTOS_DIR (server/fotos.js)
    imagem_base64 TEXT,           -- legado: fotos anteriores à migração 003
    observacao TEXT,
    capturado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registro das Sacolas
CREATE TABLE IF NOT EXISTS sacolas (
    id VARCHAR(50) PRIMARY KEY, -- O código de barras da sacola
    carga_id VARCHAR(50) REFERENCES conferencias_cargas(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vínculo dos Pedidos à Sacola
CREATE TABLE IF NOT EXISTS sacolas_pedidos (
    id SERIAL PRIMARY KEY,
    sacola_id VARCHAR(50) REFERENCES sacolas(id) ON DELETE CASCADE,
    pedido_id VARCHAR(50) NOT NULL,
    UNIQUE(sacola_id, pedido_id)
);

-- Produtos dentro da Sacola
CREATE TABLE IF NOT EXISTS sacolas_produtos (
    id SERIAL PRIMARY KEY,
    sacola_id VARCHAR(50) REFERENCES sacolas(id) ON DELETE CASCADE,
    produto_codigo VARCHAR(50) NOT NULL,
    descricao TEXT,
    quantidade NUMERIC(10,3) NOT NULL
);

-- Vínculo de Fotos à Sacola
CREATE TABLE IF NOT EXISTS sacolas_fotos (
    id VARCHAR(100) PRIMARY KEY,
    sacola_id VARCHAR(50) REFERENCES sacolas(id) ON DELETE CASCADE,
    arquivo TEXT,                 -- caminho em FOTOS_DIR (server/fotos.js)
    imagem_base64 TEXT,           -- legado: fotos anteriores à migração 003
    observacao TEXT,
    capturado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Histórico de Ações por Carga
CREATE TABLE IF NOT EXISTS historico_acoes (
    id         SERIAL PRIMARY KEY,
    carga_id   VARCHAR(50) REFERENCES conferencias_cargas(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    acao       VARCHAR(50) NOT NULL,
    detalhes   JSONB,
    criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_historico_carga
    ON historico_acoes(carga_id, criado_em DESC);

-- ------------------------------------------------------------------
-- CONTAGEM DE ESTOQUE
-- ------------------------------------------------------------------

-- Sessões de Contagem de Estoque
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

-- Itens das Contagens de Estoque
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

-- Histórico de Ações das Contagens de Estoque
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

-- ------------------------------------------------------------------
-- CONFERÊNCIA DE ENTRADA (ver server/migrations/002_conferencias_entrada.sql)
-- ------------------------------------------------------------------


-- ------------------------------------------------------------------
-- Cabeçalho da conferência (1 por pré-entrada lançada no Sankhya)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conferencias_entrada (
    id              SERIAL PRIMARY KEY,
    nuconf          INTEGER NOT NULL UNIQUE,   -- NUCONF gerado pelo Sankhya
    nunota          INTEGER,                   -- pré-entrada de origem
    codemp          INTEGER,
    numnota         VARCHAR(30),
    fornecedor      VARCHAR(255),
    dt_prevista     DATE,
    qtd_volumes     INTEGER,

    -- em_conferencia | aguardando_liberacao | concluida_sem_divergencia
    -- | concluida_com_divergencia | cancelada
    status          VARCHAR(30) NOT NULL DEFAULT 'em_conferencia',

    dh_inicio       TIMESTAMP,
    dh_fim          TIMESTAMP,

    -- auditoria da liberação de divergência
    liberado_por    INTEGER REFERENCES usuarios(id),
    liberado_em     TIMESTAMP,
    justificativa   TEXT,

    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- Itens — snapshot congelado da pré-entrada.
--
-- qtd_esperada NUNCA sai desta tabela em direção ao aplicativo. Toda rota
-- sob /entrada/* (usada pelo conferente) devolve apenas status_item.
-- Só as rotas /admin/entradas/* expõem o valor esperado.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conferencias_entrada_itens (
    id              SERIAL PRIMARY KEY,
    conferencia_id  INTEGER NOT NULL REFERENCES conferencias_entrada(id) ON DELETE CASCADE,
    nuconf          INTEGER NOT NULL,
    sequencia       INTEGER NOT NULL,          -- SEQCONF
    sequencia_orig  INTEGER,                   -- sequência do item na pré-entrada
    codprod         VARCHAR(50) NOT NULL,
    descrprod       TEXT,
    marca           VARCHAR(120),
    unidade         VARCHAR(20),
    ean13           VARCHAR(20),
    ean14           VARCHAR(20),
    fator_ean14     NUMERIC(14,3),

    qtd_esperada    NUMERIC(14,3) NOT NULL,
    qtd_conferida   NUMERIC(14,3) NOT NULL DEFAULT 0,

    -- pendente | ok | divergente
    status_item     VARCHAR(15) NOT NULL DEFAULT 'pendente',

    observacao      TEXT,
    conferido_por   INTEGER REFERENCES usuarios(id),
    conferido_em    TIMESTAMP,

    UNIQUE (conferencia_id, sequencia)
);

CREATE INDEX IF NOT EXISTS idx_conf_entrada_itens_marca
    ON conferencias_entrada_itens(conferencia_id, marca);

-- ------------------------------------------------------------------
-- Marcas — unidade de trabalho do aplicativo (1 cartão = 1 marca de 1
-- conferência). Guarda o lock lógico exigido pela regra de negócio:
-- quem abriu a marca é o responsável, e assumir de outro é auditado.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conferencias_entrada_marcas (
    id              SERIAL PRIMARY KEY,
    conferencia_id  INTEGER NOT NULL REFERENCES conferencias_entrada(id) ON DELETE CASCADE,
    marca           VARCHAR(120) NOT NULL,
    conferente_id   INTEGER REFERENCES usuarios(id),
    dh_inicio       TIMESTAMP,
    dh_fim          TIMESTAMP,
    UNIQUE (conferencia_id, marca)
);

-- ------------------------------------------------------------------
-- Leituras — trilha de auditoria de cada bipagem.
--
-- Sem esta tabela não dá para saber se 120 foi digitado à mão ou se foram
-- 10 leituras de uma caixa de 12.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conferencias_entrada_leituras (
    id              SERIAL PRIMARY KEY,
    conferencia_id  INTEGER NOT NULL REFERENCES conferencias_entrada(id) ON DELETE CASCADE,
    item_id         INTEGER NOT NULL REFERENCES conferencias_entrada_itens(id) ON DELETE CASCADE,
    codbarras       VARCHAR(30),
    tipo            VARCHAR(10) NOT NULL,      -- ean13 | ean14 | manual | zerar
    qtd_incremento  NUMERIC(14,3),
    qtd_resultante  NUMERIC(14,3),
    usuario_id      INTEGER REFERENCES usuarios(id),
    dispositivo     VARCHAR(255),
    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conf_entrada_leituras_item
    ON conferencias_entrada_leituras(item_id, criado_em DESC);

-- ------------------------------------------------------------------
-- Fotos — item_id NULL = foto da conferência inteira.
--
-- A especificação sugere repositório de anexos externo. Aqui mantemos o
-- padrão já usado por cargas e sacolas (base64 em tabela dedicada, nunca
-- na tabela principal) para não introduzir uma dependência nova.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conferencias_entrada_fotos (
    id              VARCHAR(100) PRIMARY KEY,
    conferencia_id  INTEGER NOT NULL REFERENCES conferencias_entrada(id) ON DELETE CASCADE,
    item_id         INTEGER REFERENCES conferencias_entrada_itens(id) ON DELETE CASCADE,
    usuario_id      INTEGER REFERENCES usuarios(id),
    arquivo         TEXT,         -- caminho em FOTOS_DIR (server/fotos.js)
    imagem_base64   TEXT,         -- legado: fotos anteriores à migração 003
    observacao      TEXT,
    capturado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conf_entrada_fotos_item
    ON conferencias_entrada_fotos(conferencia_id, item_id);

-- ------------------------------------------------------------------
-- Histórico de ações
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico_conferencias_entrada (
    id              SERIAL PRIMARY KEY,
    conferencia_id  INTEGER REFERENCES conferencias_entrada(id) ON DELETE CASCADE,
    usuario_id      INTEGER REFERENCES usuarios(id),
    acao            VARCHAR(50) NOT NULL,
    detalhes        JSONB,
    criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historico_conf_entrada
    ON historico_conferencias_entrada(conferencia_id, criado_em DESC);
