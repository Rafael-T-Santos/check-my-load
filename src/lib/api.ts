/**
 * Endereços dos dois servidores que o app consome.
 *
 * O padrão é a produção, então um build sem configuração nenhuma continua
 * apontando para onde sempre apontou. Para desenvolver contra um backend
 * local, crie um `.env.local` (ignorado pelo git) na raiz do projeto:
 *
 *   VITE_API_URL=http://localhost:3000
 *   VITE_ERP_URL=http://localhost:5000
 *
 * Antes isto era o mesmo IP repetido em 44 lugares — apontar o app para outro
 * servidor exigia um search-and-replace que ninguém queria fazer duas vezes,
 * e que era fácil deixar pela metade antes de um commit.
 */

/** Backend local: progresso, fotos, sacolas, conferências e histórico. */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://192.168.255.6:3000';

/** ERP Sankhya: fonte de verdade de cargas, produtos e contagens. */
export const ERP_URL: string =
  import.meta.env.VITE_ERP_URL ?? 'http://192.168.255.6:5000';
