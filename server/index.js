const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limite aumentado para aceitar fotos em Base64

// A ligação ao banco de dados usa o nome 'db' definido no docker-compose
const pool = new Pool({
  user: 'checkmyload',
  host: 'db',
  database: 'checkmyloaddb',
  password: 'supersecretpassword',
  port: 5432,
});

app.get('/health', (req, res) => res.json({ status: 'ok', message: 'Backend a funcionar!' }));

// 1. Rota para buscar o progresso atual de uma carga
app.get('/cargas/:id/progresso', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT produto_codigo, quantidade_conferida, conferido_por_usuario_id, marca FROM conferencias_produtos WHERE carga_id = $1',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro na consulta de progresso:', err);
    res.status(500).json({ error: 'Erro interno ao buscar progresso' });
  }
});

// 2. Rota para Sincronizar (Salvar) os produtos conferidos
app.post('/cargas/:id/sincronizar', async (req, res) => {
  const { id } = req.params;
  const { produtos, usuario_id } = req.body; 

  try {
    await pool.query('BEGIN'); // Inicia a transação

    // Garante que a carga existe na tabela principal
    await pool.query(
      `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id]
    );

    // Faz o "Upsert" (Insere ou Atualiza) de cada produto conferido
    for (const prod of produtos) {
      await pool.query(
        `INSERT INTO conferencias_produtos (carga_id, produto_codigo, quantidade_conferida, conferido_por_usuario_id, marca)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (carga_id, produto_codigo) 
         DO UPDATE SET quantidade_conferida = EXCLUDED.quantidade_conferida, 
                       conferido_por_usuario_id = EXCLUDED.conferido_por_usuario_id,
                       atualizado_em = CURRENT_TIMESTAMP`,
        [id, prod.codigo, prod.quantidade, usuario_id, prod.marca]
      );
    }

    await pool.query('COMMIT'); // Confirma as alterações no banco
    res.json({ sucesso: true });
  } catch (err) {
    await pool.query('ROLLBACK'); // Desfaz tudo em caso de erro
    console.error('Erro ao sincronizar:', err);
    res.status(500).json({ error: 'Erro interno ao sincronizar' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend local rodando na porta ${PORT}`);
});