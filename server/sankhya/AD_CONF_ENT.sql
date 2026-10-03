-- ===================================================================
-- SANKHYA — Tabelas da Conferência de Entrada  (SUGESTÃO / ainda não criadas)
-- ===================================================================
--
-- Estas tabelas vivem no BANCO DO SANKHYA, não no Postgres do Check My Load.
-- Elas existem por dois motivos, e só por esses dois:
--
--   1. A ação "Lançar Conferência" (botão na pré-entrada) precisa gravar em
--      algum lugar o snapshot congelado da nota — o Sankhya é a origem.
--   2. O resultado final da conferência precisa voltar para o ERP para que a
--      entrada siga o fluxo fiscal.
--
-- Todo o trabalho operacional (leituras, fotos, lock por marca, progresso
-- parcial) fica no Postgres local — mesmo padrão de cargas e de estoque.
-- Ver server/migrations/002_conferencias_entrada.sql.
--
-- Dialeto: Oracle (padrão da maioria das bases Sankhya).
-- A seção final traz as diferenças para SQL Server.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. AD_CONF_ENT_CAB — cabeçalho da conferência
-- -------------------------------------------------------------------
CREATE TABLE AD_CONF_ENT_CAB (
    NUCONF          NUMBER(12)     NOT NULL,   -- PK, sequence AD_SEQ_CONF_ENT
    NUNOTA          NUMBER(12)     NOT NULL,   -- pré-entrada de origem (TGFCAB.NUNOTA)
    CODEMP          NUMBER(6)      NOT NULL,
    CODPARC         NUMBER(12),                -- fornecedor
    NUMNOTA         NUMBER(12),
    DTPREVISTA      DATE,
    QTDVOLUMES      NUMBER(10),

    -- EM_CONFERENCIA | AGUARDANDO_LIBERACAO | CONCLUIDA_SEM_DIVERGENCIA
    -- | CONCLUIDA_COM_DIVERGENCIA | CANCELADA
    STATUS          VARCHAR2(30)   DEFAULT 'EM_CONFERENCIA' NOT NULL,

    CODUSUCRIACAO   NUMBER(12),
    DHCRIACAO       DATE           DEFAULT SYSDATE,
    CODUSUCONF      NUMBER(12),
    DHINICIO        DATE,
    DHFIM           DATE,

    -- auditoria da liberação de divergência
    CODUSULIB       NUMBER(12),
    DHLIB           DATE,
    JUSTLIB         VARCHAR2(4000),

    CONSTRAINT PK_AD_CONF_ENT_CAB PRIMARY KEY (NUCONF)
);

CREATE SEQUENCE AD_SEQ_CONF_ENT START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE INDEX IX_CONF_ENT_CAB_NUNOTA ON AD_CONF_ENT_CAB (NUNOTA);
CREATE INDEX IX_CONF_ENT_CAB_STATUS ON AD_CONF_ENT_CAB (STATUS, DTPREVISTA);

-- Regra: uma pré-entrada não pode ter duas conferências ATIVAS ao mesmo tempo.
-- Índice único funcional — só indexa as linhas em andamento, então notas já
-- concluídas ou canceladas podem ser relançadas sem violar a restrição.
CREATE UNIQUE INDEX UX_CONF_ENT_CAB_ATIVA ON AD_CONF_ENT_CAB (
    CASE WHEN STATUS IN ('EM_CONFERENCIA', 'AGUARDANDO_LIBERACAO')
         THEN NUNOTA END
);


-- -------------------------------------------------------------------
-- 2. AD_CONF_ENT_ITE — itens (snapshot congelado)
--
-- QTD_ESPERADA é copiada da pré-entrada no momento do lançamento e nunca
-- mais muda. Alterações posteriores na nota não podem mudar em silêncio uma
-- conferência já iniciada — é o ponto central da conferência cega.
-- -------------------------------------------------------------------
CREATE TABLE AD_CONF_ENT_ITE (
    NUCONF          NUMBER(12)     NOT NULL,
    SEQCONF         NUMBER(10)     NOT NULL,
    SEQUENCIA_ORIG  NUMBER(10),                -- TGFITE.SEQUENCIA da pré-entrada
    CODPROD         NUMBER(12)     NOT NULL,
    MARCA           VARCHAR2(120),             -- agrupamento visual no app
    DESCRPROD_SNAP  VARCHAR2(255),
    UNIDADE         VARCHAR2(10),
    EAN13           VARCHAR2(20),
    EAN14           VARCHAR2(20),
    FATOR_EAN14     NUMBER(14,3),              -- unidades por caixa; > 0 se houver EAN14
    QTD_ESPERADA    NUMBER(14,3)   NOT NULL,
    QTD_CONFERIDA   NUMBER(14,3)   DEFAULT 0   NOT NULL,
    STATUS_ITEM     VARCHAR2(15)   DEFAULT 'PENDENTE' NOT NULL,  -- PENDENTE|OK|DIVERGENTE
    OBSERVACAO      VARCHAR2(4000),

    CONSTRAINT PK_AD_CONF_ENT_ITE PRIMARY KEY (NUCONF, SEQCONF),
    CONSTRAINT FK_CONF_ENT_ITE_CAB FOREIGN KEY (NUCONF)
        REFERENCES AD_CONF_ENT_CAB (NUCONF),
    CONSTRAINT CK_CONF_ENT_ITE_FATOR
        CHECK (EAN14 IS NULL OR FATOR_EAN14 > 0)
);

CREATE INDEX IX_CONF_ENT_ITE_MARCA ON AD_CONF_ENT_ITE (NUCONF, MARCA);
CREATE INDEX IX_CONF_ENT_ITE_PROD  ON AD_CONF_ENT_ITE (CODPROD);


-- -------------------------------------------------------------------
-- 3. AD_CONF_ENT_LEITURA — trilha de auditoria das bipagens
--
-- Opcional no Sankhya: o app grava toda leitura no Postgres local. Criar aqui
-- também só vale a pena se o administrativo precisar auditar dentro do ERP.
-- Se a auditoria puder viver só no Postgres, pule esta tabela.
-- -------------------------------------------------------------------
CREATE TABLE AD_CONF_ENT_LEITURA (
    IDLEITURA       NUMBER(18)     NOT NULL,
    NUCONF          NUMBER(12)     NOT NULL,
    SEQCONF         NUMBER(10)     NOT NULL,
    CODBARRAS       VARCHAR2(30),
    TIPO            VARCHAR2(10),              -- EAN13 | EAN14 | MANUAL | ZERAR
    QTD_INCREMENTO  NUMBER(14,3),
    QTD_RESULTANTE  NUMBER(14,3),
    DHLEITURA       DATE           DEFAULT SYSDATE,
    CODUSU          NUMBER(12),
    DISPOSITIVO     VARCHAR2(255),

    CONSTRAINT PK_AD_CONF_ENT_LEITURA PRIMARY KEY (IDLEITURA),
    CONSTRAINT FK_CONF_ENT_LEIT_ITE FOREIGN KEY (NUCONF, SEQCONF)
        REFERENCES AD_CONF_ENT_ITE (NUCONF, SEQCONF)
);

CREATE SEQUENCE AD_SEQ_CONF_ENT_LEITURA START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE INDEX IX_CONF_ENT_LEIT_ITEM ON AD_CONF_ENT_LEITURA (NUCONF, SEQCONF, DHLEITURA);


-- -------------------------------------------------------------------
-- 4. AD_CONF_ENT_ANEXO — NÃO criar por enquanto
--
-- A especificação prevê uma tabela de anexos. As fotos já são gravadas em
-- conferencias_entrada_fotos no Postgres local, com o mesmo padrão de cargas
-- e sacolas. Criar a tabela no Sankhya só faz sentido se o administrativo for
-- olhar as fotos DENTRO do ERP em vez do painel — e nesse caso o correto é
-- usar o repositório de anexos nativo do Sankhya, não uma coluna CLOB com
-- base64 (é justamente o que a especificação desaconselha).
-- -------------------------------------------------------------------


-- ===================================================================
-- Diferenças para SQL Server
-- ===================================================================
--   NUMBER(p,s)      -> DECIMAL(p,s)
--   VARCHAR2(n)      -> VARCHAR(n)
--   DATE             -> DATETIME2
--   SYSDATE          -> SYSDATETIME()
--   CREATE SEQUENCE ... NOCACHE -> CREATE SEQUENCE ... START WITH 1 INCREMENT BY 1
--   Índice único funcional -> índice filtrado:
--       CREATE UNIQUE INDEX UX_CONF_ENT_CAB_ATIVA
--           ON AD_CONF_ENT_CAB (NUNOTA)
--           WHERE STATUS IN ('EM_CONFERENCIA', 'AGUARDANDO_LIBERACAO');


-- ===================================================================
-- Registro no dicionário do Sankhya
-- ===================================================================
-- Depois do DDL, registrar as tabelas em TDDTAB / TDDCAM (ou via
-- "Construtor de Telas" > Nova Instância) para que a ação "Lançar
-- Conferência" e as consultas do Sankhya enxerguem os campos.
--
-- A ação "Lançar Conferência" (botão de ação na tela de pré-entrada) deve:
--   1. Validar que a nota não tem conferência ativa (o índice único cobre,
--      mas uma mensagem amigável é melhor que ORA-00001).
--   2. INSERT em AD_CONF_ENT_CAB com STATUS = 'EM_CONFERENCIA'.
--   3. INSERT dos itens em AD_CONF_ENT_ITE copiando QTD_ESPERADA de TGFITE,
--      e MARCA / EAN13 / EAN14 / FATOR_EAN14 do cadastro de produto.
--   4. Commit — a partir daí a conferência aparece na fila do aplicativo.
--
-- O contrato dos endpoints REST está em PLANEJAMENTO_ENTRADA.md, seção
-- "Endpoints que o Sankhya precisa expor".
