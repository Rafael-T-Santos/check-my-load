# Migração 003: fotos fora do banco

Em out/2026 o banco tinha 8,7 GB, e 99% disso eram fotos em base64
(`sacolas_fotos` 5,9 GB, `fotos` 2,7 GB). Depois desta migração:

- foto nova vai para um arquivo WebP em disco, recomprimida pelo backend;
- o banco guarda só o caminho do arquivo (coluna `arquivo`);
- as fotos antigas são recomprimidas e movidas pelo script `scripts/migrar-fotos.js`.

Nenhuma foto é apagada. O base64 só sai do banco na etapa 6, e só das fotos
cujo arquivo foi conferido no disco.

## 0. Antes de começar: espaço livre

Durante a migração as fotos existem em dois lugares (base64 no banco e
arquivo em disco) até a etapa 7. Precisa de folga para os arquivos novos
(estimativa: 35–45% dos 8,7 GB, ou seja ~3–4 GB) mais ~2 GB para o log do
Postgres durante a limpeza. **Tenha pelo menos 6 GB livres.**

```bash
df -h /var/lib/docker
```

Se não houver espaço, dá para rodar a etapa 4 e a etapa 6 em partes
(interromper com Ctrl+C e repetir): cada `limpar` + `VACUUM FULL` devolve o
espaço das fotos já convertidas.

## 1. Atualizar o banco (antes do backend novo)

O backend novo já lê e grava a coluna `arquivo`, então ela tem que existir
antes. O comando é instantâneo, não reescreve a tabela.

```bash
docker compose exec -T db psql -U checkmyload -d checkmyloaddb < server/migrations/003_fotos_em_arquivo.sql
```

## 2. Subir o backend e o frontend novos

```bash
docker compose up -d --build backend frontend
```

O `docker-compose.yml` cria o volume `fotos`, montado em `/app/fotos` no backend.

**Confira:** tire uma foto de carga pelo app e abra a carga no painel admin.
A foto deve aparecer e, ao abrir em nova aba, o endereço deve ser
`http://192.168.255.6:3000/arquivos-fotos/cargas/...webp`.

## 3. Amostra: conferir a qualidade

```bash
docker compose exec backend node scripts/migrar-fotos.js amostra 20
docker compose cp backend:/app/fotos/_amostra ./amostra-fotos
```

Mostra o tamanho médio antes e depois, e grava pares `-original.jpg` /
`-novo.webp` para comparar. Abra principalmente fotos de pedido/documento e
veja se dá para ler.

Se quiser outra qualidade, defina no `docker-compose.yml`, no serviço
`backend`, e repita a amostra:

```yaml
      - FOTO_QUALIDADE=70     # padrão 60 (WebP, 0–100)
      - FOTO_MAX_LADO=1600    # padrão 1280 px
```

O mesmo valor vale para as fotos novas. Depois de decidir:

```bash
docker compose exec backend rm -rf /app/fotos/_amostra
```

## 4. Migrar

```bash
docker compose exec backend node scripts/migrar-fotos.js migrar
```

Mostra progresso e tempo restante. **Pode interromper e rodar de novo**: ele
continua de onde parou. O app segue funcionando durante a migração, e fotos
ainda não convertidas aparecem pelo base64.

Fotos que não forem imagem válida aparecem como "erro" e ficam em base64. Não
são perdidas.

## 5. Conferir

Abra no painel admin algumas cargas antigas (Fotos, Sacolas) e uma entrada.
Até aqui nada saiu do banco: se algo estiver errado, pare e investigue.

## 6. Limpar o base64 (etapa sem volta)

```bash
docker compose exec backend node scripts/migrar-fotos.js limpar
```

Antes de apagar, confere se cada arquivo existe no disco. Se algum faltar, a
foto volta a usar o base64. Nesse caso rode `migrar` de novo e depois `limpar`.

## 7. Devolver o espaço ao disco

O Postgres não libera o espaço sozinho. Rode **fora do horário de trabalho**,
porque a tabela fica travada enquanto isso roda e o app não consegue salvar foto:

```bash
docker compose exec db psql -U checkmyload -d checkmyloaddb \
  -c "VACUUM (FULL, ANALYZE) fotos, sacolas_fotos, conferencias_entrada_fotos;"
```

Como as tabelas ficam pequenas, deve levar poucos minutos. Para conferir:

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;
```

## Backup daqui em diante

As imagens não estão mais no banco. Um backup só do Postgres não tem fotos:
inclua o volume `fotos` (`docker volume ls | grep fotos` mostra o nome, e
`docker volume inspect <nome>` mostra a pasta no host).
