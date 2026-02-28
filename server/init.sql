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
    quantidade_conferida INTEGER NOT NULL,
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
