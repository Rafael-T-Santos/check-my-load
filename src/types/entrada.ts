/**
 * Conferência de Entrada — recebimento de mercadorias.
 *
 * O que estes tipos NÃO têm é tão importante quanto o que têm: em nenhum
 * lugar existe `qtdEsperada`. A conferência é cega — o conferente conta o
 * que está na doca e o servidor responde apenas `ok` ou `divergente`. Se a
 * quantidade da nota chegasse até aqui, deixaria de ser contagem e passaria
 * a ser confirmação induzida, que é exactamente o que este módulo evita.
 *
 * O valor esperado só aparece no painel administrativo, que consome
 * /admin/entradas/* e tem os seus próprios tipos.
 */

export type EntradaStatus =
  | 'em_conferencia'
  | 'aguardando_liberacao'
  | 'concluida_sem_divergencia'
  | 'concluida_com_divergencia'
  | 'cancelada';

export type StatusItem = 'pendente' | 'ok' | 'divergente';

/** Um cartão da fila = uma marca dentro de uma conferência. */
export interface CartaoEntrada {
  conferenciaId: number;
  nuconf: number;
  nunota: number | null;
  numnota: string | null;
  fornecedor: string | null;
  dtPrevista: string | null;
  /** Volumes da NOTA, não da marca — só referência operacional do recebimento. */
  qtdVolumes: number | null;
  status: EntradaStatus;
  marca: string;
  totalItens: number;
  itensConferidos: number;
  /** Quem abriu esta marca; outro conferente precisa assumir para contar. */
  conferente: string | null;
}

export interface ItemEntrada {
  id: number;
  sequencia: number;
  codprod: string;
  descrprod: string;
  unidade: string | null;
  ean13: string | null;
  ean14: string | null;
  /** Unidades por caixa. Cada leitura do EAN14 soma este valor. */
  fatorEan14: number | null;
  qtdConferida: number;
  statusItem: StatusItem;
  observacao: string | null;
  conferidoEm: string | null;
  /** Já houve leitura válida do produto — libera a digitação manual. */
  ean13Lido: boolean;
  totalFotos: number;
}

export interface EntradaLock {
  conferenteId: number | null;
  conferenteNome: string | null;
  seu: boolean;
}

/** Resposta do servidor a uma leitura de código de barras. */
export interface ResultadoLeitura {
  tipo: 'ean13' | 'ean14';
  incremento: number;
  qtdConferida: number;
  statusItem: StatusItem;
  manualLiberado: boolean;
}

export type EntradaStep = 'fila' | 'itens' | 'concluido';

/** Desfecho da finalização, para a tela de conclusão. */
export interface DesfechoFinalizacao {
  status: EntradaStatus;
  divergentes: number;
}
