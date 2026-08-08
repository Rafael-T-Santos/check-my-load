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

const SANKHYA_URL = 'http://192.168.255.6:5000';

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

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));