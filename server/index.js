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

/**
 * Executa `fn` dentro de uma transação REAL, numa única conexão.
 *
 * Antes o código fazia `pool.query('BEGIN')`, e cada `pool.query` pode pegar uma
 * conexão diferente do pool: o BEGIN ia numa conexão, os INSERTs noutra e o
 * COMMIT noutra ainda. Com um utilizador só costumava funcionar por acidente
 * (o pool devolve a mesma conexão livre), mas com dois conferentes a
 * sincronizar ao mesmo tempo — que é a premissa deste sistema — o ROLLBACK
 * podia não desfazer nada e sobravam conexões presas em "idle in transaction".
 */
async function comTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

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
      'SELECT id, imagem_base64 as "imageData", observacao as "observation", capturado_em as "capturedAt", produto_codigo as "produtoCodigo", pedido_id as "pedidoId" FROM fotos WHERE carga_id = $1',
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
  const { produtos, usuario_id, placa } = req.body;
  const uid = usuario_id || 1;

  try {
    const correcoes = await comTransacao(async (client) => {
      const cargaResult = await client.query(
        `INSERT INTO conferencias_cargas (id, placa) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET placa = COALESCE(EXCLUDED.placa, conferencias_cargas.placa),
                                        atualizado_em = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserido`,
        [id, placa || null]
      );
      const cargaNova = cargaResult.rows[0]?.inserido === true;

      // Serializa os syncs da MESMA carga. Sem isto, dois conferentes que
      // sincronizam ao mesmo tempo leem o mesmo "valor anterior" e o segundo
      // grava por cima do primeiro sem nunca ver o que ele escreveu.
      await client.query(`SELECT id FROM conferencias_cargas WHERE id = $1 FOR UPDATE`, [id]);

      const atuaisResult = await client.query(
        `SELECT produto_codigo, quantidade_conferida::FLOAT AS quantidade, conferido_por_usuario_id
           FROM conferencias_produtos WHERE carga_id = $1`,
        [id]
      );
      const atual = new Map(atuaisResult.rows.map(r => [r.produto_codigo, r]));

      const correcoes = [];

      for (const prod of produtos) {
        const anterior = atual.get(prod.codigo);
        const qtdNova = Number(prod.quantidade);

        // Produto ainda não conferido por ninguém: entra normalmente.
        if (!anterior) {
          await client.query(
            `INSERT INTO conferencias_produtos (carga_id, produto_codigo, quantidade_conferida, conferido_por_usuario_id, marca)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (carga_id, produto_codigo) DO NOTHING`,
            [id, prod.codigo, qtdNova, uid, prod.marca]
          );
          await client.query(
            `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
            [id, uid, 'produto_conferido', JSON.stringify({
              produto_codigo: prod.codigo,
              marca: prod.marca,
              qtd_anterior: null,
              qtd_nova: qtdNova
            })]
          );
          continue;
        }

        // Mesma quantidade que já está gravada: nada a fazer. Acontece quando o
        // envio chegou mas a resposta perdeu-se, e o app repete; e continuará a
        // acontecer enquanto houver telemóveis com a versão antiga do app, que
        // reenvia tudo o que puxou dos colegas.
        if (anterior.quantidade === qtdNova) continue;

        // A própria pessoa a corrigir a contagem dela: pode.
        if (anterior.conferido_por_usuario_id === uid) {
          await client.query(
            `UPDATE conferencias_produtos
                SET quantidade_conferida = $3, atualizado_em = CURRENT_TIMESTAMP
              WHERE carga_id = $1 AND produto_codigo = $2`,
            [id, prod.codigo, qtdNova]
          );
          await client.query(
            `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
            [id, uid, 'produto_conferido', JSON.stringify({
              produto_codigo: prod.codigo,
              marca: prod.marca,
              qtd_anterior: anterior.quantidade,
              qtd_nova: qtdNova
            })]
          );
          continue;
        }

        // Número diferente do que outra pessoa contou. Isto agora só chega aqui
        // como ACTO DELIBERADO: o app envia apenas o que acabou de ser digitado
        // e ainda não foi confirmado, nunca o que recebeu na sincronização. Ou
        // seja, alguém contou este produto agora — e muitas vezes está a
        // corrigir um engano de quem contou antes, que é trabalho legítimo.
        //
        // Por isso a correção é ACEITE. O que não pode é acontecer em silêncio:
        // fica registada com os dois números e as duas pessoas, e volta ao app
        // para avisar quem corrigiu. O antigo problema não era a correção — era
        // o eco automático do aparelho a repetir o mesmo número sem ninguém
        // ter pedido nada.
        const dono = await client.query(`SELECT nome FROM usuarios WHERE id = $1`, [anterior.conferido_por_usuario_id]);
        const donoNome = dono.rows[0]?.nome || null;

        await client.query(
          `UPDATE conferencias_produtos
              SET quantidade_conferida = $3,
                  conferido_por_usuario_id = $4,
                  atualizado_em = CURRENT_TIMESTAMP
            WHERE carga_id = $1 AND produto_codigo = $2`,
          [id, prod.codigo, qtdNova, uid]
        );

        await client.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'quantidade_corrigida', JSON.stringify({
            produto_codigo: prod.codigo,
            marca: prod.marca,
            qtd_anterior: anterior.quantidade,
            qtd_nova: qtdNova,
            corrigiu_usuario_id: anterior.conferido_por_usuario_id,
            corrigiu_usuario_nome: donoNome
          })]
        );

        correcoes.push({
          produto_codigo: prod.codigo,
          marca: prod.marca || null,
          qtd_anterior: anterior.quantidade,
          qtd_nova: qtdNova,
          conferido_por_nome: donoNome
        });
      }

      if (cargaNova) {
        await client.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'carga_aberta', JSON.stringify({})]
        );
      }

      return correcoes;
    });

    res.json({ sucesso: true, correcoes });
  } catch (err) {
    console.error('Erro ao sincronizar:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 3. Salvar Fotos da Conferência
app.post('/cargas/:id/fotos', async (req, res) => {
  const { id } = req.params;
  const { fotos, usuario_id, placa } = req.body;
  const uid = usuario_id || 1;

  try {
    await comTransacao(async (client) => {
      const cargaResult = await client.query(
        `INSERT INTO conferencias_cargas (id, placa) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET placa = COALESCE(EXCLUDED.placa, conferencias_cargas.placa),
                                        atualizado_em = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserido`,
        [id, placa || null]
      );
      const cargaNova = cargaResult.rows[0]?.inserido === true;

      for (const foto of fotos) {
        const fotoResult = await client.query(
          `INSERT INTO fotos (id, carga_id, usuario_id, imagem_base64, observacao, produto_codigo, pedido_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [foto.id, id, uid, foto.imageData, foto.observation, foto.produtoCodigo || null, foto.pedidoId || null]
        );

        if (fotoResult.rowCount > 0) {
          await client.query(
            `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
            [id, uid, 'foto_adicionada', JSON.stringify({
              foto_id: foto.id,
              observacao: foto.observation || null
            })]
          );
        }
      }

      if (cargaNova) {
        await client.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'carga_aberta', JSON.stringify({})]
        );
      }
    });

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao salvar fotos:', err);
    res.status(500).json({ error: 'Erro ao salvar fotos' });
  }
});

// 4. Finalizar a Carga
app.post('/cargas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, via_admin, motivo_admin } = req.body;
  const uid = usuario_id || 1;

  const detalhes = via_admin
    ? { via_admin: true, motivo: motivo_admin || 'Finalizado pelo painel administrativo' }
    : {};

  try {
    await comTransacao(async (client) => {
      await client.query(
        `UPDATE conferencias_cargas SET status = 'finalizada', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      await client.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'carga_finalizada', JSON.stringify(detalhes)]
      );
    });

    res.json({ sucesso: true });
  } catch (err) {
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
  const { sacolas, usuario_id, placa } = req.body;
  const uid = usuario_id || 1;

  try {
    await comTransacao(async (client) => {
      const cargaResult = await client.query(
        `INSERT INTO conferencias_cargas (id, placa) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET placa = COALESCE(EXCLUDED.placa, conferencias_cargas.placa),
                                        atualizado_em = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserido`,
        [id, placa || null]
      );
      const cargaNova = cargaResult.rows[0]?.inserido === true;

      for (const sacola of sacolas) {
        // 1. Insere a sacola — RETURNING detecta se é nova
        const sacolaResult = await client.query(
          `INSERT INTO sacolas (id, carga_id, usuario_id, criado_em)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [sacola.id, id, uid, sacola.createdAt]
        );

        if (sacolaResult.rowCount > 0) {
          await client.query(
            `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
            [id, uid, 'sacola_criada', JSON.stringify({
              sacola_id: sacola.id,
              pedidos: sacola.orders
            })]
          );
        }

        // 2. Insere os pedidos da sacola
        for (const pedidoId of sacola.orders) {
          await client.query(
            `INSERT INTO sacolas_pedidos (sacola_id, pedido_id)
             VALUES ($1, $2)
             ON CONFLICT (sacola_id, pedido_id) DO NOTHING`,
            [sacola.id, pedidoId]
          );
        }

        // 3. Insere os produtos (limpa antes para evitar duplicidade na sincronização)
        await client.query(`DELETE FROM sacolas_produtos WHERE sacola_id = $1`, [sacola.id]);
        for (const prod of sacola.products) {
          await client.query(
            `INSERT INTO sacolas_produtos (sacola_id, produto_codigo, descricao, quantidade)
             VALUES ($1, $2, $3, $4)`,
            [sacola.id, prod.code, prod.description, prod.quantity]
          );
        }

        // 4. Insere as fotos
        for (const foto of sacola.photos) {
          await client.query(
            `INSERT INTO sacolas_fotos (id, sacola_id, imagem_base64, observacao, capturado_em)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [foto.id, sacola.id, foto.imageData, foto.observation || null, foto.capturedAt || new Date()]
          );
        }
      }

      if (cargaNova) {
        await client.query(
          `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
          [id, uid, 'carga_aberta', JSON.stringify({})]
        );
      }
    });

    res.json({ sucesso: true });
  } catch (err) {
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
      `SELECT f.id, f.imagem_base64, f.observacao, f.capturado_em, f.produto_codigo, f.pedido_id, u.nome as conferente
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

// Registrar observação / justificativa fora do padrão
app.post('/cargas/:id/observacoes', async (req, res) => {
  const { id } = req.params;
  const { justificativa, usuario_id } = req.body;
  const uid = usuario_id || 1;
  if (!justificativa || justificativa.trim().length < 10) {
    return res.status(400).json({ error: 'Justificativa muito curta' });
  }
  try {
    await comTransacao(async (client) => {
      await client.query(
        `INSERT INTO conferencias_cargas (id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [id]
      );
      await client.query(
        `INSERT INTO historico_acoes (carga_id, usuario_id, acao, detalhes) VALUES ($1, $2, $3, $4)`,
        [id, uid, 'finalizacao_justificada', JSON.stringify({ justificativa: justificativa.trim() })]
      );
    });
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao salvar observação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Buscar dados do cliente para etiqueta da sacola
app.post('/sacolas/etiqueta-cliente', async (req, res) => {
  const { pedido } = req.body;
  console.log('etiqueta-cliente recebeu pedido:', pedido, typeof pedido);
  if (!pedido) return res.status(400).json({ error: 'pedido é obrigatório' });

  try {
    const erpRes = await fetch('http://192.168.255.6:5000/api/consultar-cliente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numnota: Number(pedido) }),
    });

    if (!erpRes.ok) {
      const errBody = await erpRes.text();
      console.error(`ERP /consultar-cliente retornou ${erpRes.status}:`, errBody);
      return res.status(502).json({ error: 'Erro ao consultar ERP', status: erpRes.status, detail: errBody });
    }

    const data = await erpRes.json();
    console.log('ERP /consultar-cliente resposta:', JSON.stringify(data));
    if (!data.sucesso) return res.status(404).json({ error: 'Cliente não encontrado', erp: data });

    res.json(data.dados);
  } catch (err) {
    console.error('Erro ao buscar cliente para etiqueta:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Sincronizar placa de uma carga a partir do ERP
app.post('/admin/cargas/:id/sincronizar-placa', async (req, res) => {
  const { id } = req.params;
  try {
    const erpRes = await fetch('http://192.168.255.6:5000/api/consultar-ordem-carga', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordemCarga: Number(id) }),
    });
    if (!erpRes.ok) return res.status(503).json({ error: 'ERP indisponível' });
    const erpData = await erpRes.json();
    if (!erpData.sucesso || !Array.isArray(erpData.dados) || !erpData.dados[0]?.placa) {
      return res.status(404).json({ error: 'Placa não encontrada no ERP' });
    }
    const novaPlaca = erpData.dados[0].placa;
    const result = await pool.query(
      'UPDATE conferencias_cargas SET placa = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING placa',
      [novaPlaca, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Carga não encontrada' });
    res.json({ sucesso: true, placa: novaPlaca });
  } catch (err) {
    console.error('Erro ao sincronizar placa:', err);
    res.status(500).json({ error: 'Erro ao sincronizar placa' });
  }
});

// ------------------------------------------------------------------
// ROTAS DE CONTAGEM DE ESTOQUE
// ------------------------------------------------------------------

// Produção por padrão; SANKHYA_URL aponta para outro ERP em teste ou noutra
// rede sem recompilar nada.
const SANKHYA_URL = process.env.SANKHYA_URL || 'http://192.168.255.6:5000';

// Proxy: buscar contagens pendentes no Sankhya
app.get('/sankhya/contagens-pendentes', async (req, res) => {
  try {
    const erpRes = await fetch(`${SANKHYA_URL}/api/contagens-pendentes`);
    if (!erpRes.ok) return res.status(502).json({ error: 'ERP indisponível' });
    const data = await erpRes.json();
    res.json(data);
  } catch (err) {
    console.error('Erro ao buscar contagens pendentes:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Proxy: buscar itens de uma contagem no Sankhya
app.post('/sankhya/itens-contagem', async (req, res) => {
  const { nuContagem } = req.body;
  if (!nuContagem) return res.status(400).json({ error: 'nuContagem é obrigatório' });
  try {
    const erpRes = await fetch(`${SANKHYA_URL}/api/itens-contagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuContagem }),
    });
    if (!erpRes.ok) return res.status(502).json({ error: 'ERP indisponível' });
    const data = await erpRes.json();
    res.json(data);
  } catch (err) {
    console.error('Erro ao buscar itens da contagem:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Buscar progresso salvo da contagem de estoque
app.get('/estoque/contagens/:nucontagem/progresso', async (req, res) => {
  const { nucontagem } = req.params;
  try {
    const result = await pool.query(
      `SELECT cep.codprod, cep.estoque_contagem::FLOAT as estoque_contagem, cep.sequencia
       FROM contagens_estoque_produtos cep
       JOIN contagens_estoque ce ON ce.id = cep.contagem_id
       WHERE ce.nucontagem = $1`,
      [nucontagem]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar progresso do estoque:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Sincronizar itens contados no banco local
app.post('/estoque/contagens/:nucontagem/sincronizar', async (req, res) => {
  const { nucontagem } = req.params;
  const { itens, usuario_id, contagem } = req.body;
  const uid = usuario_id || 1;

  // NOTA: este endpoint tem a MESMA forma de sobrescrita cega do /cargas/:id/sincronizar
  // (último a gravar vence). Aqui só se corrigiu a transação, porque não há indício de
  // dano nos dados e a contagem de estoque parece ter um dono só por sessão — mas isso
  // ainda não foi verificado. Ver a consulta de conferência no relatório da investigação.
  try {
    await comTransacao(async (client) => {
      const contagemResult = await client.query(
        `INSERT INTO contagens_estoque (nucontagem, codigo, descricao_marca, codlocal, usuario_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (nucontagem) DO UPDATE
           SET descricao_marca = COALESCE(EXCLUDED.descricao_marca, contagens_estoque.descricao_marca),
               status          = 'em_andamento',
               atualizado_em   = CURRENT_TIMESTAMP
         RETURNING id, (xmax = 0) AS inserido`,
        [nucontagem, contagem?.codigo || null, contagem?.descricao_marca || null, contagem?.codlocal || null, uid]
      );

      const contagemId   = contagemResult.rows[0].id;
      const contagemNova = contagemResult.rows[0].inserido === true;

      const qtdAnteriorResult = await client.query(
        `SELECT codprod, estoque_contagem::FLOAT FROM contagens_estoque_produtos WHERE contagem_id = $1`,
        [contagemId]
      );
      const qtdAnteriorMap = new Map(qtdAnteriorResult.rows.map(r => [r.codprod, r.estoque_contagem]));

      for (const item of itens) {
        const qtdAnterior = qtdAnteriorMap.get(item.codprod) ?? null;
        const qtdMudou    = qtdAnterior === null || qtdAnterior !== Number(item.estoquecontagem);

        await client.query(
          `INSERT INTO contagens_estoque_produtos
             (contagem_id, nucontagem, sequencia, codprod, descrprod, referencia,
              estoque_atual, estoque_contagem, conferido_por_usuario_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (contagem_id, codprod) DO UPDATE SET
             estoque_contagem         = EXCLUDED.estoque_contagem,
             conferido_por_usuario_id = CASE
               WHEN contagens_estoque_produtos.estoque_contagem IS DISTINCT FROM EXCLUDED.estoque_contagem
               THEN EXCLUDED.conferido_por_usuario_id
               ELSE contagens_estoque_produtos.conferido_por_usuario_id
             END,
             atualizado_em = CURRENT_TIMESTAMP`,
          [contagemId, nucontagem, item.sequencia, item.codprod, item.descrprod,
           item.referencia, item.estoqueatual, item.estoquecontagem, uid]
        );

        if (qtdMudou) {
          await client.query(
            `INSERT INTO historico_contagens_estoque (contagem_id, usuario_id, acao, detalhes)
             VALUES ($1, $2, $3, $4)`,
            [contagemId, uid, 'item_contado', JSON.stringify({
              codprod:      item.codprod,
              qtd_anterior: qtdAnterior,
              qtd_nova:     item.estoquecontagem,
            })]
          );
        }
      }

      if (contagemNova) {
        await client.query(
          `INSERT INTO historico_contagens_estoque (contagem_id, usuario_id, acao, detalhes)
           VALUES ($1, $2, $3, $4)`,
          [contagemId, uid, 'contagem_aberta', JSON.stringify({})]
        );
      }
    });

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao sincronizar contagem de estoque:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Finalizar contagem de estoque (envia ao Sankhya + marca como finalizada)
app.post('/estoque/contagens/:nucontagem/finalizar', async (req, res) => {
  const { nucontagem } = req.params;
  const { usuario_id, total_itens } = req.body;
  const uid = usuario_id || 1;

  try {
    const itenResult = await pool.query(
      `SELECT cep.codprod, cep.estoque_contagem::FLOAT as estoque_contagem, ce.id as contagem_id
       FROM contagens_estoque_produtos cep
       JOIN contagens_estoque ce ON ce.id = cep.contagem_id
       WHERE ce.nucontagem = $1 AND cep.estoque_contagem IS NOT NULL`,
      [nucontagem]
    );

    if (itenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum item contado para finalizar' });
    }

    // Valida se todos os itens do app chegaram ao banco antes de finalizar
    if (total_itens !== undefined && itenResult.rows.length < Number(total_itens)) {
      return res.status(400).json({
        error: `Sincronização incompleta: ${itenResult.rows.length} de ${total_itens} itens salvos no banco. Sincronize e tente novamente.`,
      });
    }

    const contagemId       = itenResult.rows[0].contagem_id;
    const itensParaSankhya = itenResult.rows.map(r => ({
      codProd:         Number(r.codprod),
      estoqueContagem: r.estoque_contagem,
    }));

    const erpRes = await fetch(`${SANKHYA_URL}/api/registrar-contagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuContagem: Number(nucontagem), itens: itensParaSankhya }),
    });

    if (!erpRes.ok) {
      const errBody = await erpRes.text();
      console.error(`Sankhya /api/registrar-contagem retornou ${erpRes.status}:`, errBody);
      return res.status(502).json({ error: 'Erro ao registrar contagem no ERP', detail: errBody });
    }

    await comTransacao(async (client) => {
      await client.query(
        `UPDATE contagens_estoque
         SET status = 'finalizada', atualizado_em = CURRENT_TIMESTAMP
         WHERE nucontagem = $1`,
        [nucontagem]
      );
      await client.query(
        `INSERT INTO historico_contagens_estoque (contagem_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [contagemId, uid, 'contagem_finalizada',
         JSON.stringify({ itens_enviados: itensParaSankhya.length })]
      );
    });

    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao finalizar contagem de estoque:', err);
    res.status(500).json({ error: 'Erro ao finalizar contagem' });
  }
});

// ------------------------------------------------------------------
// ADMIN: CONTAGENS DE ESTOQUE
// ------------------------------------------------------------------

app.get('/admin/contagens-estoque', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ce.id, ce.nucontagem, ce.codigo, ce.descricao_marca, ce.codlocal,
              ce.status, ce.criado_em, ce.atualizado_em, u.nome as usuario
       FROM contagens_estoque ce
       LEFT JOIN usuarios u ON u.id = ce.usuario_id
       ORDER BY ce.atualizado_em DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar contagens de estoque (admin):', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/admin/contagens-estoque/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const itens = await pool.query(
      `SELECT cep.codprod, cep.descrprod, cep.referencia,
              cep.estoque_atual::FLOAT    as estoque_atual,
              cep.estoque_contagem::FLOAT as estoque_contagem,
              cep.sequencia, cep.atualizado_em, u.nome as conferente
       FROM contagens_estoque_produtos cep
       LEFT JOIN usuarios u ON u.id = cep.conferido_por_usuario_id
       WHERE cep.contagem_id = $1
       ORDER BY cep.sequencia ASC NULLS LAST`,
      [id]
    );

    const historico = await pool.query(
      `SELECT h.acao, h.detalhes, h.criado_em, u.nome as usuario
       FROM historico_contagens_estoque h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.contagem_id = $1
       ORDER BY h.criado_em ASC`,
      [id]
    );

    res.json({ itens: itens.rows, historico: historico.rows });
  } catch (err) {
    console.error('Erro ao buscar detalhes da contagem:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ------------------------------------------------------------------
// CONFERÊNCIA DE ENTRADA
// ------------------------------------------------------------------
//
// Regra que governa tudo nesta secção: a conferência é CEGA. Nenhuma rota
// sob /entrada/* pode devolver qtd_esperada — nem em campo próprio, nem
// dentro de uma mensagem de erro, nem por diferença ("faltam 3"). O aparelho
// recebe apenas o que o conferente contou e um veredicto: ok ou divergente.
//
// A comparação acontece aqui, no servidor, contra o snapshot congelado no
// momento em que a conferência foi lançada. Se ela acontecesse no aparelho,
// a quantidade esperada teria de viajar até lá — e bastaria abrir o DevTools
// ou farejar a rede para transformar contagem em confirmação induzida.
//
// Só /admin/entradas/* expõe o valor esperado, para quem tem de decidir
// sobre a divergência.

/** PENDENTE enquanto ninguém registou quantidade; depois OK ou DIVERGENTE. */
function statusDoItem(qtdConferida, qtdEsperada, foiConferido) {
  if (!foiConferido) return 'pendente';
  return Number(qtdConferida) === Number(qtdEsperada) ? 'ok' : 'divergente';
}

/**
 * Condição SQL de "o produto já foi identificado por bipagem".
 *
 * Vale qualquer leitura de EAN13 ou EAN14 — as duas provam que o conferente
 * teve o produto na mão — mas só as posteriores ao último `zerar`. Sem esse
 * corte, uma recontagem do zero herdaria a bipagem antiga e deixaria digitar a
 * quantidade sem voltar a ler nada, que é o oposto de recontar.
 *
 * Fica aqui numa constante porque a regra é usada em dois sítios: a tela
 * consulta-a para decidir se mostra o leitor, e /quantidade aplica-a para
 * aceitar ou recusar. Quando estavam escritas separadamente, divergiram — a
 * tela exigia uma leitura que o servidor já dispensava.
 *
 * `$ITEM` é substituído pela referência da coluna do item no contexto de cada
 * consulta.
 */
const SQL_JA_IDENTIFICADO = `
  EXISTS (
    SELECT 1 FROM conferencias_entrada_leituras l
     WHERE l.item_id = $ITEM
       AND l.tipo IN ('ean13', 'ean14')
       AND l.criado_em > COALESCE(
             (SELECT MAX(z.criado_em) FROM conferencias_entrada_leituras z
               WHERE z.item_id = $ITEM AND z.tipo = 'zerar'),
             '-infinity'::timestamp)
  )`;

/** Status do cabeçalho que ainda aceitam escrita vinda do aplicativo. */
const STATUS_ABERTOS = ['em_conferencia'];

// ---- Integração com o Sankhya -------------------------------------
// Os endpoints abaixo AINDA NÃO EXISTEM no ERP. O contrato esperado está
// em PLANEJAMENTO_ENTRADA.md > "Endpoints que o Sankhya precisa expor".
// Enquanto não existirem, a fila funciona só com o que já foi importado
// localmente (ver POST /entrada/conferencias/importar).

async function erpConferenciasPendentes() {
  const r = await fetch(`${SANKHYA_URL}/api/conferencias-entrada-pendentes`);
  if (!r.ok) throw new Error(`ERP respondeu ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : (data.dados ?? []);
}

async function erpItensConferencia(nuconf) {
  const r = await fetch(`${SANKHYA_URL}/api/itens-conferencia-entrada`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nuConf: Number(nuconf) }),
  });
  if (!r.ok) throw new Error(`ERP respondeu ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : (data.dados ?? []);
}

async function erpRegistrarConferencia(nuconf, status, itens) {
  const r = await fetch(`${SANKHYA_URL}/api/registrar-conferencia-entrada`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nuConf: Number(nuconf), status, itens }),
  });
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error(`ERP respondeu ${r.status}: ${corpo}`);
  }
  return r.json().catch(() => ({}));
}

/**
 * Grava o cabeçalho e — só na primeira vez — o snapshot dos itens.
 *
 * Reimportar itens de uma conferência já existente sobrescreveria a contagem
 * em curso e violaria o congelamento da quantidade esperada, por isso os
 * itens só são inseridos quando ainda não há nenhum.
 */
async function importarConferencia(client, cab, itens) {
  const cabResult = await client.query(
    `INSERT INTO conferencias_entrada
       (nuconf, nunota, codemp, numnota, fornecedor, dt_prevista, qtd_volumes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (nuconf) DO UPDATE SET
       fornecedor    = COALESCE(EXCLUDED.fornecedor,  conferencias_entrada.fornecedor),
       dt_prevista   = COALESCE(EXCLUDED.dt_prevista, conferencias_entrada.dt_prevista),
       qtd_volumes   = COALESCE(EXCLUDED.qtd_volumes, conferencias_entrada.qtd_volumes),
       atualizado_em = CURRENT_TIMESTAMP
     RETURNING id, (xmax = 0) AS inserido`,
    [cab.nuconf,
     cab.nunota ?? null,
     cab.codemp ?? null,
     cab.numnota ?? null,
     // `nomeparc` aparece quando o endpoint do ERP faz JOIN em TGFPAR.
     cab.fornecedor  ?? cab.nomeparc   ?? null,
     cab.dt_prevista ?? cab.dtprevista ?? null,
     cab.qtd_volumes ?? cab.qtdvolumes ?? null]
  );

  const conferenciaId = cabResult.rows[0].id;

  if (cabResult.rows[0].inserido === true) {
    await client.query(
      `INSERT INTO historico_conferencias_entrada (conferencia_id, acao, detalhes)
       VALUES ($1, $2, $3)`,
      [conferenciaId, 'conferencia_lancada',
       JSON.stringify({ nunota: cab.nunota ?? null, numnota: cab.numnota ?? null })]
    );
  }

  const jaTemItens = await client.query(
    `SELECT 1 FROM conferencias_entrada_itens WHERE conferencia_id = $1 LIMIT 1`,
    [conferenciaId]
  );
  if (jaTemItens.rowCount > 0 || !Array.isArray(itens) || itens.length === 0) {
    return { conferenciaId, itensImportados: 0 };
  }

  let seq = 0;
  for (const it of itens) {
    seq += 1;
    const fator = Number(it.fator_ean14 ?? it.fatorEan14 ?? 0);
    await client.query(
      `INSERT INTO conferencias_entrada_itens
         (conferencia_id, nuconf, sequencia, sequencia_orig, codprod, descrprod,
          marca, unidade, ean13, ean14, fator_ean14, qtd_esperada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (conferencia_id, sequencia) DO NOTHING`,
      [
        conferenciaId,
        cab.nuconf,
        // A internal-api-sankhya devolve as colunas do Oracle em minúsculas,
        // então um SELECT * em AD_CONF_ENT_ITE chega como `seqconf` e
        // `descrprod_snap`. Aceitar as duas grafias evita que a fila apareça
        // com a descrição dos produtos em branco caso o SQL não use alias.
        it.sequencia ?? it.seqconf ?? seq,
        it.sequencia_orig ?? it.sequenciaOrig ?? it.sequencia_orig ?? null,
        String(it.codprod),
        it.descrprod ?? it.descrprod_snap ?? null,
        it.marca ?? 'SEM MARCA',
        it.unidade ?? null,
        it.ean13 ?? null,
        it.ean14 ?? null,
        fator > 0 ? fator : null,
        Number(it.qtd_esperada ?? it.qtdEsperada ?? 0),
      ]
    );
  }

  await client.query(
    `INSERT INTO historico_conferencias_entrada (conferencia_id, acao, detalhes)
     VALUES ($1, $2, $3)`,
    [conferenciaId, 'itens_importados', JSON.stringify({ total: itens.length })]
  );

  return { conferenciaId, itensImportados: itens.length };
}

/** Cartões da fila, montados só a partir do banco local. */
async function montarFila() {
  const result = await pool.query(
    `SELECT ce.id                AS conferencia_id,
            ce.nuconf,
            ce.nunota,
            ce.numnota,
            ce.fornecedor,
            ce.dt_prevista,
            ce.qtd_volumes,
            ce.status,
            i.marca,
            COUNT(*)                                              AS total_itens,
            COUNT(*) FILTER (WHERE i.status_item <> 'pendente')    AS itens_conferidos,
            u.nome                                                AS conferente
       FROM conferencias_entrada ce
       JOIN conferencias_entrada_itens i ON i.conferencia_id = ce.id
       LEFT JOIN conferencias_entrada_marcas m
              ON m.conferencia_id = ce.id AND m.marca = i.marca
       LEFT JOIN usuarios u ON u.id = m.conferente_id
      WHERE ce.status IN ('em_conferencia', 'aguardando_liberacao')
      GROUP BY ce.id, i.marca, u.nome
      ORDER BY ce.dt_prevista NULLS LAST, ce.nuconf, i.marca`
  );

  // itens_divergentes fica de fora de propósito: contar divergências por
  // cartão já entregaria parte da quantidade esperada ao conferente.
  return result.rows.map(r => ({
    conferenciaId:   r.conferencia_id,
    nuconf:          r.nuconf,
    nunota:          r.nunota,
    numnota:         r.numnota,
    fornecedor:      r.fornecedor,
    dtPrevista:      r.dt_prevista,
    qtdVolumes:      r.qtd_volumes,
    status:          r.status,
    marca:           r.marca,
    totalItens:      Number(r.total_itens),
    itensConferidos: Number(r.itens_conferidos),
    conferente:      r.conferente,
  }));
}

/**
 * Fila do aplicativo. Puxa o que há de novo no ERP e devolve os cartões.
 *
 * Se o ERP estiver fora do ar a fila ainda responde com o que já está no
 * banco local — um recebimento em curso no pátio não pode parar porque a
 * integração caiu.
 */
app.get('/entrada/fila', async (req, res) => {
  let erpErro = null;

  try {
    const cabecalhos = await erpConferenciasPendentes();
    for (const cab of cabecalhos) {
      const nuconf = Number(cab.nuconf ?? cab.NUCONF);
      if (!nuconf) continue;

      const local = await pool.query(
        `SELECT 1 FROM conferencias_entrada ce
          WHERE ce.nuconf = $1
            AND EXISTS (SELECT 1 FROM conferencias_entrada_itens i
                         WHERE i.conferencia_id = ce.id)`,
        [nuconf]
      );

      const itens = local.rowCount > 0 ? [] : await erpItensConferencia(nuconf);
      await comTransacao(client => importarConferencia(client, {
        nuconf,
        nunota:      cab.nunota      ?? cab.NUNOTA      ?? null,
        codemp:      cab.codemp      ?? cab.CODEMP      ?? null,
        numnota:     cab.numnota     ?? cab.NUMNOTA     ?? null,
        fornecedor:  cab.fornecedor ?? cab.nomeparc  ?? cab.NOMEPARC  ?? null,
        dt_prevista: cab.dtprevista ?? cab.dt_prevista ?? cab.DTPREVISTA ?? null,
        qtd_volumes: cab.qtdvolumes ?? cab.qtd_volumes ?? cab.QTDVOLUMES ?? null,
      }, itens));
    }
  } catch (err) {
    console.error('ERP indisponível ao montar fila de entrada:', err.message);
    erpErro = 'Não foi possível falar com o Sankhya. A lista pode estar desatualizada.';
  }

  try {
    res.json({ cartoes: await montarFila(), erpErro });
  } catch (err) {
    console.error('Erro ao montar fila de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * Importa uma conferência manualmente, sem passar pelo Sankhya.
 *
 * Existe para o módulo poder ser testado e demonstrado antes de as tabelas
 * AD_CONF_ENT_* e os endpoints do ERP ficarem prontos. Quando estiverem,
 * esta rota continua útil como porta de entrada para um push do Sankhya.
 */
app.post('/entrada/conferencias/importar', async (req, res) => {
  const { cabecalho, itens } = req.body;
  if (!cabecalho?.nuconf) return res.status(400).json({ error: 'cabecalho.nuconf é obrigatório' });
  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'itens é obrigatório e não pode ser vazio' });
  }

  try {
    const r = await comTransacao(client => importarConferencia(client, cabecalho, itens));
    res.json({ sucesso: true, ...r });
  } catch (err) {
    console.error('Erro ao importar conferência de entrada:', err);
    res.status(500).json({ error: 'Erro ao importar conferência' });
  }
});

/**
 * Abre uma marca para contagem e devolve os itens — sem quantidade esperada.
 *
 * A marca tem dono: quem abre primeiro fica responsável. Outro conferente vê
 * a lista, mas só conta depois de assumir explicitamente (`assumir: true`),
 * e essa tomada fica registada no histórico. É um lock consultivo — não
 * bloqueia o galpão quando alguém sai para o almoço com a marca aberta.
 */
app.post('/entrada/conferencias/:nuconf/marcas/:marca/abrir', async (req, res) => {
  const { nuconf, marca } = req.params;
  const { usuario_id, assumir } = req.body;
  const uid = usuario_id || 1;

  try {
    const resposta = await comTransacao(async (client) => {
      const cab = await client.query(
        `SELECT id, status FROM conferencias_entrada WHERE nuconf = $1`,
        [nuconf]
      );
      if (cab.rowCount === 0) return { erro: 404, msg: 'Conferência não encontrada' };

      const conferenciaId = cab.rows[0].id;
      const statusCab     = cab.rows[0].status;

      const marcaRow = await client.query(
        `INSERT INTO conferencias_entrada_marcas (conferencia_id, marca)
         VALUES ($1, $2)
         ON CONFLICT (conferencia_id, marca) DO UPDATE SET marca = EXCLUDED.marca
         RETURNING id, conferente_id`,
        [conferenciaId, marca]
      );

      const donoAtual = marcaRow.rows[0].conferente_id;
      const livre     = donoAtual === null || donoAtual === uid;
      const podeContar = STATUS_ABERTOS.includes(statusCab) && (livre || assumir === true);

      if (podeContar && donoAtual !== uid) {
        await client.query(
          `UPDATE conferencias_entrada_marcas
              SET conferente_id = $1,
                  dh_inicio     = COALESCE(dh_inicio, CURRENT_TIMESTAMP)
            WHERE id = $2`,
          [uid, marcaRow.rows[0].id]
        );
        await client.query(
          `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
           VALUES ($1, $2, $3, $4)`,
          [conferenciaId, uid, donoAtual === null ? 'marca_aberta' : 'marca_assumida',
           JSON.stringify({ marca, conferente_anterior: donoAtual })]
        );
        await client.query(
          `UPDATE conferencias_entrada
              SET dh_inicio = COALESCE(dh_inicio, CURRENT_TIMESTAMP),
                  atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [conferenciaId]
        );
      }

      const dono = await client.query(
        `SELECT m.conferente_id, u.nome
           FROM conferencias_entrada_marcas m
           LEFT JOIN usuarios u ON u.id = m.conferente_id
          WHERE m.id = $1`,
        [marcaRow.rows[0].id]
      );

      // Sem qtd_esperada, sem qtd_restante, sem nada que a deduza.
      const itens = await client.query(
        `SELECT i.id, i.sequencia, i.codprod, i.descrprod, i.unidade,
                i.ean13, i.ean14, i.fator_ean14::FLOAT   AS fator_ean14,
                i.qtd_conferida::FLOAT                   AS qtd_conferida,
                i.status_item, i.observacao, i.conferido_em,
                ${SQL_JA_IDENTIFICADO.replace(/\$ITEM/g, 'i.id')} AS ean13_lido,
                (SELECT COUNT(*) FROM conferencias_entrada_fotos f
                  WHERE f.item_id = i.id)                AS total_fotos
           FROM conferencias_entrada_itens i
          WHERE i.conferencia_id = $1 AND i.marca = $2
          ORDER BY i.sequencia`,
        [conferenciaId, marca]
      );

      return {
        conferenciaId,
        status: statusCab,
        marca,
        lock: {
          conferenteId:   dono.rows[0]?.conferente_id ?? null,
          conferenteNome: dono.rows[0]?.nome ?? null,
          seu:            dono.rows[0]?.conferente_id === uid,
        },
        podeContar,
        itens: itens.rows.map(i => ({
          id:           i.id,
          sequencia:    i.sequencia,
          codprod:      i.codprod,
          descrprod:    i.descrprod,
          unidade:      i.unidade,
          ean13:        i.ean13,
          ean14:        i.ean14,
          fatorEan14:   i.fator_ean14,
          qtdConferida: i.qtd_conferida,
          statusItem:   i.status_item,
          observacao:   i.observacao,
          conferidoEm:  i.conferido_em,
          ean13Lido:    i.ean13_lido,
          totalFotos:   Number(i.total_fotos),
        })),
      };
    });

    if (resposta.erro) return res.status(resposta.erro).json({ error: resposta.msg });
    res.json(resposta);
  } catch (err) {
    console.error('Erro ao abrir marca da conferência de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * Carrega o item bloqueando a linha, e recusa escrita se a conferência já
 * saiu do estado editável. A validação repete-se aqui de propósito: a
 * interface pode estar desatualizada, o servidor não pode confiar nela.
 */
async function carregarItemParaEscrita(client, itemId) {
  const r = await client.query(
    `SELECT i.*, ce.status AS status_cab, ce.id AS conferencia_id
       FROM conferencias_entrada_itens i
       JOIN conferencias_entrada ce ON ce.id = i.conferencia_id
      WHERE i.id = $1
      FOR UPDATE OF i`,
    [itemId]
  );
  if (r.rowCount === 0) return { erro: 404, msg: 'Item não encontrado' };
  const item = r.rows[0];
  if (!STATUS_ABERTOS.includes(item.status_cab)) {
    return { erro: 409, msg: 'Esta conferência já foi finalizada e não aceita alterações.' };
  }
  return { item };
}

async function gravarQuantidade(client, item, novaQtd, foiConferido, leitura, uid) {
  const status = statusDoItem(novaQtd, item.qtd_esperada, foiConferido);

  await client.query(
    `UPDATE conferencias_entrada_itens
        SET qtd_conferida = $1,
            status_item   = $2,
            conferido_por = $3,
            conferido_em  = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = $5`,
    [novaQtd, status, uid, foiConferido, item.id]
  );

  await client.query(
    `INSERT INTO conferencias_entrada_leituras
       (conferencia_id, item_id, codbarras, tipo, qtd_incremento, qtd_resultante,
        usuario_id, dispositivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [item.conferencia_id, item.id, leitura.codbarras ?? null, leitura.tipo,
     leitura.incremento, novaQtd, uid, leitura.dispositivo ?? null]
  );

  await client.query(
    `UPDATE conferencias_entrada SET atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
    [item.conferencia_id]
  );

  return status;
}

/**
 * Leitura de código de barras.
 *
 * EAN13 identifica o produto e libera a digitação manual — não soma nada.
 * EAN14 é a caixa: cada leitura acrescenta o fator de conversão, então três
 * leituras de uma caixa de 12 dão 36. Código de outro produto não altera
 * coisa nenhuma e volta como 422.
 */
app.post('/entrada/itens/:itemId/leituras', async (req, res) => {
  const { itemId } = req.params;
  const { codbarras, usuario_id, dispositivo } = req.body;
  const uid = usuario_id || 1;
  const codigo = String(codbarras ?? '').trim();

  if (!codigo) return res.status(400).json({ error: 'codbarras é obrigatório' });

  try {
    const r = await comTransacao(async (client) => {
      const carga = await carregarItemParaEscrita(client, itemId);
      if (carga.erro) return carga;
      const item = carga.item;

      const ehEan14 = !!item.ean14 && codigo === item.ean14;
      const ehEan13 = !!item.ean13 && codigo === item.ean13;

      if (!ehEan13 && !ehEan14) {
        return { erro: 422, msg: 'Este código de barras não pertence ao item selecionado.' };
      }

      if (ehEan14) {
        const fator = Number(item.fator_ean14 ?? 0);
        if (!(fator > 0)) {
          return {
            erro: 422,
            msg: 'A caixa deste produto está sem fator de conversão cadastrado. Conte pela unidade.',
          };
        }

        const novaQtd = Number(item.qtd_conferida) + fator;
        const status  = await gravarQuantidade(
          client, item, novaQtd, true,
          { codbarras: codigo, tipo: 'ean14', incremento: fator, dispositivo }, uid
        );

        return {
          tipo: 'ean14',
          incremento: fator,
          qtdConferida: novaQtd,
          statusItem: status,
          manualLiberado: true,
        };
      }

      // EAN13: valida o produto e abre o campo manual. Sem incremento — a
      // leitura fica registada para provar que o conferente teve o produto
      // na mão antes de digitar um número.
      await client.query(
        `INSERT INTO conferencias_entrada_leituras
           (conferencia_id, item_id, codbarras, tipo, qtd_incremento, qtd_resultante,
            usuario_id, dispositivo)
         VALUES ($1, $2, $3, 'ean13', 0, $4, $5, $6)`,
        [item.conferencia_id, item.id, codigo, item.qtd_conferida, uid, dispositivo ?? null]
      );

      return {
        tipo: 'ean13',
        incremento: 0,
        qtdConferida: Number(item.qtd_conferida),
        statusItem: item.status_item,
        manualLiberado: true,
      };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao registar leitura de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/**
 * Quantidade digitada à mão. Só é aceite depois de uma leitura válida de
 * EAN13 — ou quando o produto não tem EAN13 cadastrado, caso em que não há
 * nada para bipar e exigir a leitura seria pedir o impossível.
 */
app.post('/entrada/itens/:itemId/quantidade', async (req, res) => {
  const { itemId } = req.params;
  const { quantidade, usuario_id, dispositivo } = req.body;
  const uid = usuario_id || 1;
  const qtd = Number(quantidade);

  if (!Number.isFinite(qtd) || qtd < 0) {
    return res.status(400).json({ error: 'quantidade inválida' });
  }

  try {
    const r = await comTransacao(async (client) => {
      const carga = await carregarItemParaEscrita(client, itemId);
      if (carga.erro) return carga;
      const item = carga.item;

      if (item.ean13) {
        const leu = await client.query(
          `SELECT ${SQL_JA_IDENTIFICADO.replace(/\$ITEM/g, '$1')} AS identificado`,
          [itemId]
        );
        if (leu.rows[0].identificado !== true) {
          return { erro: 409, msg: 'Leia o código de barras do produto antes de digitar a quantidade.' };
        }
      }

      const status = await gravarQuantidade(
        client, item, qtd, true,
        { tipo: 'manual', incremento: qtd - Number(item.qtd_conferida), dispositivo }, uid
      );

      return { qtdConferida: qtd, statusItem: status };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao gravar quantidade de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Zera a contagem do item e devolve-o a PENDENTE. Fica no histórico. */
app.post('/entrada/itens/:itemId/zerar', async (req, res) => {
  const { itemId } = req.params;
  const { usuario_id, dispositivo } = req.body;
  const uid = usuario_id || 1;

  try {
    const r = await comTransacao(async (client) => {
      const carga = await carregarItemParaEscrita(client, itemId);
      if (carga.erro) return carga;
      const item = carga.item;

      await gravarQuantidade(
        client, item, 0, false,
        { tipo: 'zerar', incremento: -Number(item.qtd_conferida), dispositivo }, uid
      );

      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [item.conferencia_id, uid, 'item_zerado',
         JSON.stringify({ codprod: item.codprod, qtd_anterior: Number(item.qtd_conferida) })]
      );

      return { qtdConferida: 0, statusItem: 'pendente' };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao zerar item de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Observação do conferente sobre o item (avaria, embalagem violada, etc.). */
app.post('/entrada/itens/:itemId/observacao', async (req, res) => {
  const { itemId } = req.params;
  const { observacao, usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    const r = await comTransacao(async (client) => {
      const carga = await carregarItemParaEscrita(client, itemId);
      if (carga.erro) return carga;
      const item = carga.item;

      await client.query(
        `UPDATE conferencias_entrada_itens SET observacao = $1 WHERE id = $2`,
        [observacao || null, itemId]
      );
      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [item.conferencia_id, uid, 'observacao_item',
         JSON.stringify({ codprod: item.codprod, observacao: observacao || null })]
      );
      return { sucesso: true };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao gravar observação de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Fotos do item. */
app.get('/entrada/itens/:itemId/fotos', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT f.id, f.imagem_base64, f.observacao, f.capturado_em, u.nome AS usuario
         FROM conferencias_entrada_fotos f
         LEFT JOIN usuarios u ON u.id = f.usuario_id
        WHERE f.item_id = $1
        ORDER BY f.capturado_em`,
      [req.params.itemId]
    );
    res.json(r.rows.map(f => ({
      id: f.id, imageData: f.imagem_base64, observation: f.observacao,
      capturedAt: f.capturado_em, usuario: f.usuario,
    })));
  } catch (err) {
    console.error('Erro ao buscar fotos de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/entrada/itens/:itemId/fotos', async (req, res) => {
  const { itemId } = req.params;
  const { id, imageData, observation, usuario_id } = req.body;
  const uid = usuario_id || 1;

  if (!id || !imageData) return res.status(400).json({ error: 'id e imageData são obrigatórios' });

  try {
    const r = await comTransacao(async (client) => {
      const item = await client.query(
        `SELECT id, conferencia_id, codprod FROM conferencias_entrada_itens WHERE id = $1`,
        [itemId]
      );
      if (item.rowCount === 0) return { erro: 404, msg: 'Item não encontrado' };

      const gravou = await client.query(
        `INSERT INTO conferencias_entrada_fotos
           (id, conferencia_id, item_id, usuario_id, imagem_base64, observacao)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [id, item.rows[0].conferencia_id, itemId, uid, imageData, observation || null]
      );

      if (gravou.rowCount > 0) {
        await client.query(
          `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
           VALUES ($1, $2, $3, $4)`,
          [item.rows[0].conferencia_id, uid, 'foto_adicionada',
           JSON.stringify({ foto_id: id, codprod: item.rows[0].codprod, observacao: observation || null })]
        );
      }
      return { sucesso: true };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao salvar foto de entrada:', err);
    res.status(500).json({ error: 'Erro ao salvar foto' });
  }
});

/**
 * Finalização pedida pelo conferente.
 *
 * Tudo certo, fecha sozinha. Havendo uma divergência que seja, vai para
 * AGUARDANDO_LIBERAÇÃO e passa a depender do administrativo — o conferente
 * não fecha uma nota que não bateu.
 *
 * A resposta conta quantos itens divergiram, nunca em que medida.
 */
app.post('/entrada/conferencias/:nuconf/finalizar', async (req, res) => {
  const { nuconf } = req.params;
  const { usuario_id } = req.body;
  const uid = usuario_id || 1;

  try {
    const desfecho = await comTransacao(async (client) => {
      const cab = await client.query(
        `SELECT id, status FROM conferencias_entrada WHERE nuconf = $1 FOR UPDATE`,
        [nuconf]
      );
      if (cab.rowCount === 0) return { erro: 404, msg: 'Conferência não encontrada' };
      if (!STATUS_ABERTOS.includes(cab.rows[0].status)) {
        return { erro: 409, msg: 'Esta conferência já foi finalizada.' };
      }

      const conferenciaId = cab.rows[0].id;
      const resumo = await client.query(
        `SELECT COUNT(*)                                          AS total,
                COUNT(*) FILTER (WHERE status_item = 'pendente')   AS pendentes,
                COUNT(*) FILTER (WHERE status_item = 'divergente') AS divergentes
           FROM conferencias_entrada_itens WHERE conferencia_id = $1`,
        [conferenciaId]
      );

      const pendentes   = Number(resumo.rows[0].pendentes);
      const divergentes = Number(resumo.rows[0].divergentes);

      if (pendentes > 0) {
        return {
          erro: 400,
          msg: `Ainda há ${pendentes} ${pendentes === 1 ? 'item não contado' : 'itens não contados'}.`,
        };
      }

      const novoStatus = divergentes > 0 ? 'aguardando_liberacao' : 'concluida_sem_divergencia';

      await client.query(
        `UPDATE conferencias_entrada
            SET status = $1, dh_fim = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [novoStatus, conferenciaId]
      );
      await client.query(
        `UPDATE conferencias_entrada_marcas
            SET dh_fim = CURRENT_TIMESTAMP WHERE conferencia_id = $1 AND dh_fim IS NULL`,
        [conferenciaId]
      );
      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [conferenciaId, uid, 'conferencia_finalizada',
         JSON.stringify({ status: novoStatus, divergentes, total: Number(resumo.rows[0].total) })]
      );

      return { conferenciaId, status: novoStatus, divergentes };
    });

    if (desfecho.erro) return res.status(desfecho.erro).json({ error: desfecho.msg });

    // Sem divergência a entrada já pode seguir no ERP. Com divergência,
    // espera-se a liberação — o envio acontece em /admin/entradas/:id/liberar.
    if (desfecho.status === 'concluida_sem_divergencia') {
      await enviarConferenciaAoErp(desfecho.conferenciaId, nuconf, desfecho.status, uid)
        .catch(err => console.error('Falha ao enviar conferência ao ERP:', err.message));
    }

    res.json({ status: desfecho.status, divergentes: desfecho.divergentes });
  } catch (err) {
    console.error('Erro ao finalizar conferência de entrada:', err);
    res.status(500).json({ error: 'Erro ao finalizar conferência' });
  }
});

/**
 * Devolve o resultado ao Sankhya.
 *
 * A falha fica registada no histórico em vez de derrubar a operação: a
 * conferência física já aconteceu e o seu resultado está gravado aqui. Se o
 * ERP não aceitou, isso é um problema de integração para reprocessar, não
 * motivo para o conferente refazer a contagem.
 */
async function enviarConferenciaAoErp(conferenciaId, nuconf, status, uid) {
  const itens = await pool.query(
    `SELECT sequencia, codprod, qtd_conferida::FLOAT AS qtd_conferida, status_item, observacao
       FROM conferencias_entrada_itens WHERE conferencia_id = $1 ORDER BY sequencia`,
    [conferenciaId]
  );

  try {
    await erpRegistrarConferencia(nuconf, status.toUpperCase(), itens.rows.map(i => ({
      seqConf:       i.sequencia,
      codProd:       Number(i.codprod),
      qtdConferida:  i.qtd_conferida,
      statusItem:    i.status_item.toUpperCase(),
      observacao:    i.observacao,
    })));

    await pool.query(
      `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
       VALUES ($1, $2, $3, $4)`,
      [conferenciaId, uid, 'enviada_ao_erp', JSON.stringify({ itens: itens.rowCount })]
    );
  } catch (err) {
    await pool.query(
      `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
       VALUES ($1, $2, $3, $4)`,
      [conferenciaId, uid, 'falha_envio_erp', JSON.stringify({ erro: err.message })]
    );
    throw err;
  }
}

// ------------------------------------------------------------------
// ADMIN: CONFERÊNCIAS DE ENTRADA
//
// Daqui para baixo a quantidade esperada aparece — é o painel de quem
// precisa decidir sobre a divergência.
// ------------------------------------------------------------------

app.get('/admin/entradas', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ce.id, ce.nuconf, ce.nunota, ce.numnota, ce.fornecedor,
              ce.dt_prevista, ce.qtd_volumes, ce.status,
              ce.criado_em, ce.atualizado_em, ce.dh_inicio, ce.dh_fim,
              ce.justificativa, ul.nome AS liberado_por,
              COUNT(i.id)                                            AS total_itens,
              COUNT(i.id) FILTER (WHERE i.status_item <> 'pendente')  AS conferidos,
              COUNT(i.id) FILTER (WHERE i.status_item = 'divergente') AS divergentes,
              STRING_AGG(DISTINCT i.marca, ', ' ORDER BY i.marca)     AS marcas
         FROM conferencias_entrada ce
         LEFT JOIN conferencias_entrada_itens i ON i.conferencia_id = ce.id
         LEFT JOIN usuarios ul ON ul.id = ce.liberado_por
        GROUP BY ce.id, ul.nome
        ORDER BY ce.atualizado_em DESC`
    );
    res.json(r.rows.map(row => ({
      ...row,
      total_itens: Number(row.total_itens),
      conferidos:  Number(row.conferidos),
      divergentes: Number(row.divergentes),
    })));
  } catch (err) {
    console.error('Erro ao listar conferências de entrada (admin):', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/admin/entradas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const itens = await pool.query(
      `SELECT i.id, i.sequencia, i.codprod, i.descrprod, i.marca, i.unidade,
              i.ean13, i.ean14, i.fator_ean14::FLOAT   AS fator_ean14,
              i.qtd_esperada::FLOAT                    AS qtd_esperada,
              i.qtd_conferida::FLOAT                   AS qtd_conferida,
              i.status_item, i.observacao, i.conferido_em,
              u.nome                                   AS conferente,
              (SELECT COUNT(*) FROM conferencias_entrada_fotos f WHERE f.item_id = i.id) AS total_fotos
         FROM conferencias_entrada_itens i
         LEFT JOIN usuarios u ON u.id = i.conferido_por
        WHERE i.conferencia_id = $1
        ORDER BY i.marca, i.sequencia`,
      [id]
    );

    const leituras = await pool.query(
      `SELECT l.item_id, l.codbarras, l.tipo,
              l.qtd_incremento::FLOAT AS qtd_incremento,
              l.qtd_resultante::FLOAT AS qtd_resultante,
              l.criado_em, l.dispositivo, u.nome AS usuario
         FROM conferencias_entrada_leituras l
         LEFT JOIN usuarios u ON u.id = l.usuario_id
        WHERE l.conferencia_id = $1
        ORDER BY l.criado_em`,
      [id]
    );

    const fotos = await pool.query(
      `SELECT f.id, f.item_id, f.imagem_base64, f.observacao, f.capturado_em, u.nome AS usuario
         FROM conferencias_entrada_fotos f
         LEFT JOIN usuarios u ON u.id = f.usuario_id
        WHERE f.conferencia_id = $1
        ORDER BY f.capturado_em`,
      [id]
    );

    const historico = await pool.query(
      `SELECT h.acao, h.detalhes, h.criado_em, u.nome AS usuario
         FROM historico_conferencias_entrada h
         LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.conferencia_id = $1
        ORDER BY h.criado_em`,
      [id]
    );

    res.json({
      itens: itens.rows.map(i => ({ ...i, total_fotos: Number(i.total_fotos) })),
      leituras:  leituras.rows,
      fotos:     fotos.rows.map(f => ({
        id: f.id, itemId: f.item_id, imageData: f.imagem_base64,
        observation: f.observacao, capturedAt: f.capturado_em, usuario: f.usuario,
      })),
      historico: historico.rows,
    });
  } catch (err) {
    console.error('Erro ao buscar detalhes da conferência de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Libera a divergência. Justificativa é obrigatória — a regra é do processo. */
app.post('/admin/entradas/:id/liberar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, justificativa } = req.body;
  const uid = usuario_id || 1;
  const texto = String(justificativa ?? '').trim();

  if (texto.length < 5) {
    return res.status(400).json({ error: 'A justificativa é obrigatória para liberar uma divergência.' });
  }

  try {
    const r = await comTransacao(async (client) => {
      const cab = await client.query(
        `SELECT nuconf, status FROM conferencias_entrada WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cab.rowCount === 0) return { erro: 404, msg: 'Conferência não encontrada' };
      if (cab.rows[0].status !== 'aguardando_liberacao') {
        return { erro: 409, msg: 'Só é possível liberar uma conferência aguardando liberação.' };
      }

      await client.query(
        `UPDATE conferencias_entrada
            SET status = 'concluida_com_divergencia',
                liberado_por = $1, liberado_em = CURRENT_TIMESTAMP,
                justificativa = $2, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $3`,
        [uid, texto, id]
      );
      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [id, uid, 'divergencia_liberada', JSON.stringify({ justificativa: texto })]
      );

      return { nuconf: cab.rows[0].nuconf };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });

    await enviarConferenciaAoErp(Number(id), r.nuconf, 'concluida_com_divergencia', uid)
      .catch(err => console.error('Falha ao enviar conferência liberada ao ERP:', err.message));

    res.json({ sucesso: true, status: 'concluida_com_divergencia' });
  } catch (err) {
    console.error('Erro ao liberar divergência:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Devolve para nova conferência: volta a EM_CONFERÊNCIA, contagem preservada. */
app.post('/admin/entradas/:id/devolver', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, motivo, zerar_itens } = req.body;
  const uid = usuario_id || 1;

  try {
    const r = await comTransacao(async (client) => {
      const cab = await client.query(
        `SELECT status FROM conferencias_entrada WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cab.rowCount === 0) return { erro: 404, msg: 'Conferência não encontrada' };
      if (!['aguardando_liberacao', 'concluida_com_divergencia', 'concluida_sem_divergencia']
            .includes(cab.rows[0].status)) {
        return { erro: 409, msg: 'Esta conferência não está num estado que permita devolução.' };
      }

      // A liberação anterior tem de ser apagada junto com o estado. Se ficasse,
      // a conferência voltaria à fila de liberação já exibindo "Divergência
      // liberada por Fulano" — o administrativo veria como resolvido aquilo
      // que está justamente à espera da decisão dele.
      await client.query(
        `UPDATE conferencias_entrada
            SET status        = 'em_conferencia',
                dh_fim        = NULL,
                liberado_por  = NULL,
                liberado_em   = NULL,
                justificativa = NULL,
                atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [id]
      );

      // Recontagem do zero é opcional: às vezes só um item precisa ser
      // revisto, e apagar tudo obrigaria a bipar a nota inteira de novo.
      if (zerar_itens === true) {
        await client.query(
          `UPDATE conferencias_entrada_itens
              SET qtd_conferida = 0, status_item = 'pendente', conferido_em = NULL
            WHERE conferencia_id = $1`,
          [id]
        );

        // Marca o corte na trilha de leituras. Sem isto a bipagem antiga
        // continuaria valendo e uma recontagem "do zero" deixaria o conferente
        // digitar a quantidade sem voltar a ler o produto — que é o oposto do
        // que uma recontagem completa quer dizer.
        await client.query(
          `INSERT INTO conferencias_entrada_leituras
             (conferencia_id, item_id, tipo, qtd_incremento, qtd_resultante, usuario_id)
           SELECT $1, i.id, 'zerar', 0, 0, $2
             FROM conferencias_entrada_itens i
            WHERE i.conferencia_id = $1`,
          [id, uid]
        );
      }

      await client.query(
        `UPDATE conferencias_entrada_marcas SET dh_fim = NULL WHERE conferencia_id = $1`,
        [id]
      );
      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [id, uid, 'devolvida_para_conferencia',
         JSON.stringify({ motivo: motivo || null, itens_zerados: zerar_itens === true })]
      );

      return { sucesso: true };
    });

    if (r.erro) return res.status(r.erro).json({ error: r.msg });
    res.json(r);
  } catch (err) {
    console.error('Erro ao devolver conferência de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/** Cancela a conferência preservando todo o histórico. */
app.post('/admin/entradas/:id/cancelar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, motivo } = req.body;
  const uid = usuario_id || 1;
  const texto = String(motivo ?? '').trim();

  if (texto.length < 5) {
    return res.status(400).json({ error: 'Informe o motivo do cancelamento.' });
  }

  try {
    await comTransacao(async (client) => {
      await client.query(
        `UPDATE conferencias_entrada
            SET status = 'cancelada', atualizado_em = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      await client.query(
        `INSERT INTO historico_conferencias_entrada (conferencia_id, usuario_id, acao, detalhes)
         VALUES ($1, $2, $3, $4)`,
        [id, uid, 'conferencia_cancelada', JSON.stringify({ motivo: texto })]
      );
    });
    res.json({ sucesso: true });
  } catch (err) {
    console.error('Erro ao cancelar conferência de entrada:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));