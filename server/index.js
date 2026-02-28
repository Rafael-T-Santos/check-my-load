const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limite aumentado para aceitar fotos em Base64

// Ligação ao banco de dados
const pool = new Pool({
  user: 'checkmyload',
  host: 'db',
  database: 'checkmyloaddb',
  password: 'supersecretpassword',
  port: 5432,
});

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'Backend a funcionar!' }));

// 1. Buscar progresso salvo da carga
app.get('/cargas/:id/progresso', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT produto_codigo, quantidade_conferida, marca FROM conferencias_produtos WHERE carga_id = $1',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro na consulta de progresso:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 2. Sincronizar (Salvar) os produtos conferidos
app.post('/cargas/:id/sincronizar', async (req, res) => {
  const { id } = req.params;
  const { produtos, usuario_id } = req.body; 

  try {
    await pool.query('BEGIN');

    await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id]
    );

    for (const prod of produtos) {
      await pool.query(
        `INSERT INTO conferencias_produtos (carga_id, produto_codigo, quantidade_conferida, conferido_por_usuario_id, marca)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (carga_id, produto_codigo) 
         DO UPDATE SET quantidade_conferida = EXCLUDED.quantidade_conferida, 
                       conferido_por_usuario_id = EXCLUDED.conferido_por_usuario_id,
                       atualizado_em = CURRENT_TIMESTAMP`,
        [id, prod.codigo, prod.quantidade, usuario_id || 1, prod.marca]
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

  try {
    await pool.query('BEGIN');
    
    await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id]
    );

    for (const foto of fotos) {
      await pool.query(
        `INSERT INTO fotos (id, carga_id, usuario_id, imagem_base64, observacao)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [foto.id, id, usuario_id || 1, foto.imageData, foto.observation]
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

  try {
    await pool.query(
      `UPDATE conferencias_cargas SET status = 'finalizada', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao finalizar carga:', err);
    res.status(500).json({ error: 'Erro ao finalizar carga' });
  }
});

// Rota de Login (com Usuário e Senha)
app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;

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

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));