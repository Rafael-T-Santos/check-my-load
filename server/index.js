const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limite aumentado para aceitar fotos em Base64

// Ligação ao banco de dados
const pool = new Pool({
  user: process.env.DB_USER || 'checkmyload',
  host: process.env.DB_HOST || 'db', // Alterado de 127.0.0.1
  database: process.env.DB_NAME || 'checkmyloaddb',
  password: process.env.DB_PASSWORD || 'supersecretpassword',
  port: 5432,
});

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'Backend a funcionar!' }));

// 1. Buscar progresso salvo da carga
app.get('/cargas/:id/progresso', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT produto_codigo, quantidade_conferida::FLOAT as quantidade_conferida, marca FROM conferencias_produtos WHERE carga_id = $1',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro na consulta de progresso:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Buscar fotos já salvas da carga
app.get('/cargas/:id/fotos', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, imagem_base64 as "imageData", observacao as "observation", capturado_em as "capturedAt" FROM fotos WHERE carga_id = $1',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar fotos:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 2. Sincronizar (Salvar) os produtos conferidos
app.post('/cargas/:id/sincronizar', async (req, res) => {
  const { id } = req.params;
  const { produtos, usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    await pool.query('BEGIN');

    const cargaResult = await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id]
    );
    const cargaNova = cargaResult.rowCount > 0;

    // Busca quantidades anteriores para registrar no histórico
    const qtdAnteriorResult = await pool.query(
      `SELECT produto_codigo, quantidade_conferida::FLOAT FROM conferencias_produtos WHERE carga_id = $1`,
      [id]
    );
    const qtdAnteriorMap = new Map(qtdAnteriorResult.rows.map(r => [r.produto_codigo, r.quantidade_conferida]));

    for (const prod of produtos) {
      await pool.query(
        `INSERT INTO conferencias_produtos (carga_id, produto_codigo, quantidade_conferida, conferido_por_usuario_id, marca)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (carga_id, produto_codigo)
         DO UPDATE SET quantidade_conferida = EXCLUDED.quantidade_conferida,
                       conferido_por_usuario_id = EXCLUDED.conferido_por_usuario_id,
                       atualizado_em = CURRENT_TIMESTAMP`,
        [id, prod.codigo, prod.quantidade, uid, prod.marca]
      );

      await pool.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'produto_conferido', JSON.stringify({
          produto_codigo: prod.codigo,
          marca: prod.marca,
          qtd_anterior: qtdAnteriorMap.get(prod.codigo) ?? null,
          qtd_nova: prod.quantidade
        })]
      );
    }

    if (cargaNova) {
      await pool.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'carga_aberta', JSON.stringify({})]
      );
    }

    await pool.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Erro ao sincronizar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 3. Salvar Fotos da Conferência
app.post('/cargas/:id/fotos', async (req, res) => {
  const { id } = req.params;
  const { fotos, usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    await pool.query('BEGIN');

    const cargaResult = await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id]
    );
    const cargaNova = cargaResult.rowCount > 0;

    for (const foto of fotos) {
      const fotoResult = await pool.query(
        `INSERT INTO fotos (id, carga_id, usuario_id, imagem_base64, observacao)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [foto.id, id, uid, foto.imageData, foto.observation]
      );

      if (fotoResult.rowCount > 0) {
        await pool.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'foto_adicionada', JSON.stringify({
            foto_id: foto.id,
            observacao: foto.observation || null
          })]
        );
      }
    }

    if (cargaNova) {
      await pool.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'carga_aberta', JSON.stringify({})]
      );
    }

    await pool.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Erro ao salvar fotos:', err);
    res.status(500).json({ error: 'Erro ao salvar fotos' });
  }
});

// 4. Finalizar a Carga
app.post('/cargas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    await pool.query('BEGIN');

    await pool.query(
      `UPDATE conferencias_cargas SET status = 'finalizada', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
      [id, uid, 'carga_finalizada', JSON.stringify({})]
    );

    await pool.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Erro ao finalizar carga:', err);
    res.status(500).json({ error: 'Erro ao finalizar carga' });
  }
});

// Rota de Login (com Usuário e Senha)
app.post('/login', async (req, res) => {
  let { usuario, senha } = req.body;
  usuario = usuario.toLowerCase();

  try {
    // Busca o usuário pelo campo "usuario" (login)
    const result = await pool.query(
      'SELECT id, nome, usuario, senha, perfil FROM usuarios WHERE usuario = $1 AND ativo = TRUE',
      [usuario]
    );

    if (result.rows.length > 0) {
      const userDB = result.rows[0];
      
      // Verifica se a senha bate 
      // (Nota: Em produção, o ideal é usar a biblioteca 'bcrypt' para senhas criptografadas. 
      // Aqui estamos usando texto limpo para facilitar os testes iniciais).
      if (userDB.senha === senha) {
        delete userDB.senha; // Removemos a senha antes de devolver pro frontend por segurança
        res.json({ sucesso: true, usuario: userDB });
      } else {
        res.status(401).json({ error: 'Senha incorreta' });
      }
    } else {
      res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao tentar fazer login' });
  }
});

// ------------------------------------------------------------------
// ROTAS DE SACOLAS
// ------------------------------------------------------------------

// Buscar sacolas da carga
app.get('/cargas/:id/sacolas', async (req, res) => {
  const { id } = req.params;
  try {
    const sacolasResult = await pool.query('SELECT * FROM sacolas WHERE carga_id = $1', [id]);
    const sacolas = [];

    for (const row of sacolasResult.rows) {
      const pedidosResult = await pool.query('SELECT pedido_id FROM sacolas_pedidos WHERE sacola_id = $1', [row.id]);
      const produtosResult = await pool.query('SELECT produto_codigo as code, descricao as description, quantidade::FLOAT as quantity FROM sacolas_produtos WHERE sacola_id = $1', [row.id]);
      const fotosResult = await pool.query('SELECT id, imagem_base64 as "imageData", observacao as observation, capturado_em as "capturedAt" FROM sacolas_fotos WHERE sacola_id = $1', [row.id]);

      // Busca quais pedidos deram origem a cada produto na sacola
      const produtosFormatados = produtosResult.rows.map(p => ({
         ...p,
         ordersOrigin: pedidosResult.rows.map(ped => ped.pedido_id) // Simplificação: vincula todos os pedidos da sacola aos produtos
      }));

      sacolas.push({
        id: row.id,
        createdAt: row.criado_em,
        orders: pedidosResult.rows.map(p => p.pedido_id),
        products: produtosFormatados,
        photos: fotosResult.rows
      });
    }

    res.json(sacolas);
  } catch (err) {
    console.error('Erro ao buscar sacolas:', err);
    res.status(500).json({ error: 'Erro ao buscar sacolas' });
  }
});

// Salvar/Sincronizar sacolas da carga
app.post('/cargas/:id/sacolas', async (req, res) => {
  const { id } = req.params;
  const { sacolas, usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    await pool.query('BEGIN');

    const cargaResult = await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id]
    );
    const cargaNova = cargaResult.rowCount > 0;

    for (const sacola of sacolas) {
      // 1. Insere a sacola — RETURNING detecta se é nova
      const sacolaResult = await pool.query(
        `INSERT INTO sacolas (id, carga_id, usuario_id, criado_em)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [sacola.id, id, uid, sacola.createdAt]
      );

      if (sacolaResult.rowCount > 0) {
        await pool.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'sacola_criada', JSON.stringify({
            sacola_id: sacola.id,
            pedidos: sacola.orders
          })]
        );
      }

      // 2. Insere os pedidos da sacola
      for (const pedidoId of sacola.orders) {
        await pool.query(
          `INSERT INTO sacolas_pedidos (sacola_id, pedido_id)
           VALUES ($1, $2)
           ON CONFLICT (sacola_id, pedido_id) DO NOTHING`,
          [sacola.id, pedidoId]
        );
      }

      // 3. Insere os produtos (limpa antes para evitar duplicidade na sincronização)
      await pool.query(`DELETE FROM sacolas_produtos WHERE sacola_id = $1`, [sacola.id]);
      for (const prod of sacola.products) {
        await pool.query(
          `INSERT INTO sacolas_produtos (sacola_id, produto_codigo, descricao, quantidade)
           VALUES ($1, $2, $3, $4)`,
          [sacola.id, prod.code, prod.description, prod.quantity]
        );
      }

      // 4. Insere as fotos
      for (const foto of sacola.photos) {
        await pool.query(
          `INSERT INTO sacolas_fotos (id, sacola_id, imagem_base64, observacao, capturado_em)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [foto.id, sacola.id, foto.imageData, foto.observation || null, foto.capturedAt || new Date()]
        );
      }
    }

    if (cargaNova) {
      await pool.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'carga_aberta', JSON.stringify({})]
      );
    }

    await pool.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Erro ao salvar sacolas:', err);
    res.status(500).json({ error: 'Erro ao salvar sacolas' });
  }
});

// ------------------------------------------------------------------
// ROTAS DO PAINEL ADMINISTRATIVO
// ------------------------------------------------------------------

// 1. Listar todas as cargas
app.get('/admin/cargas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, placa, status, criado_em, atualizado_em FROM conferencias_cargas ORDER BY atualizado_em DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar cargas pro admin:', err);
    res.status(500).json({ error: 'Erro ao buscar cargas' });
  }
});

// 2. Listar todos os usuários
app.get('/admin/usuarios', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, usuario, matricula, perfil, ativo FROM usuarios ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar usuários pro admin:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// 3. Criar um novo utilizador
app.post('/admin/usuarios', async (req, res) => {
  let { nome, usuario, matricula, senha, perfil } = req.body;
  usuario = usuario.toLowerCase();

  // Validação básica
  if (!nome || !usuario || !senha) {
    return res.status(400).json({ error: 'Nome, utilizador e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nome, usuario, matricula, senha, perfil) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, nome, usuario, matricula, perfil, ativo`,
      [nome, usuario, matricula || null, senha, perfil || 'conferente']
    );
    res.json({ sucesso: true, usuario: result.rows[0] });
  } catch (err) {
    // Código 23505 é o erro do Postgres para violação de UNIQUE (utilizador ou matrícula repetida)
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Já existe um registo com este utilizador ou matrícula' });
    }
    console.error('Erro ao cadastrar utilizador:', err);
    res.status(500).json({ error: 'Erro interno ao cadastrar utilizador' });
  }
});

// 4. Editar/Inativar um utilizador existente
app.put('/admin/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  let { nome, usuario, matricula, senha, perfil, ativo } = req.body;
  usuario = usuario.toLowerCase();

  try {
    let query = '';
    let params = [];

    // Se a senha foi preenchida, atualizamos ela também. 
    // Se veio vazia, significa que o admin não quer mudar a senha da pessoa.
    if (senha && senha.trim() !== '') {
      query = `UPDATE usuarios SET nome = $1, usuario = $2, matricula = $3, senha = $4, perfil = $5, ativo = $6 WHERE id = $7 RETURNING id, nome, usuario, matricula, perfil, ativo`;
      params = [nome, usuario, matricula || null, senha, perfil, ativo, id];
    } else {
      query = `UPDATE usuarios SET nome = $1, usuario = $2, matricula = $3, perfil = $4, ativo = $5 WHERE id = $6 RETURNING id, nome, usuario, matricula, perfil, ativo`;
      params = [nome, usuario, matricula || null, perfil, ativo, id];
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    res.json({ sucesso: true, usuario: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Já existe um registo com este utilizador ou matrícula' });
    }
    console.error('Erro ao atualizar utilizador:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar utilizador' });
  }
});

// 1.5 Buscar detalhes de uma carga específica (Admin)
app.get('/admin/cargas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Busca os produtos conferidos e o nome de quem conferiu
    const produtos = await pool.query(
      `SELECT cp.produto_codigo, cp.quantidade_conferida::FLOAT as quantidade_conferida, cp.marca, cp.atualizado_em, u.nome as conferente
       FROM conferencias_produtos cp
       LEFT JOIN usuarios u ON cp.conferido_por_usuario_id = u.id
       WHERE cp.carga_id = $1
       ORDER BY cp.atualizado_em DESC`,
      [id]
    );

    // Busca as fotos da carga
    const fotos = await pool.query(
      `SELECT f.id, f.imagem_base64, f.observacao, f.capturado_em, u.nome as conferente
       FROM fotos f
       LEFT JOIN usuarios u ON f.usuario_id = u.id
       WHERE f.carga_id = $1
       ORDER BY f.capturado_em DESC`,
      [id]
    );

    res.json({
      produtos: produtos.rows,
      fotos: fotos.rows
    });
  } catch (err) {
    console.error('Erro ao buscar detalhes da carga:', err);
    res.status(500).json({ error: 'Erro ao buscar detalhes' });
  }
});

// Histórico de ações de uma carga
app.get('/admin/cargas/:id/historico', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT h.id, h.acao, h.detalhes, h.criado_em, u.nome AS usuario
       FROM historico_acoes h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.carga_id = $1
       ORDER BY h.criado_em ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));