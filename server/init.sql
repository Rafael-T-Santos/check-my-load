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
    imagem_base64 TEXT NOT NULL,
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
    imagem_base64 TEXT NOT NULL,
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