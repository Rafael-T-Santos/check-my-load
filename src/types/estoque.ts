export interface ContagemPendente {
  nucontagem: number;
  codigo: string;
  descricao_marca: string;
  codlocal: string;
  codusu: number;
  dtcad: string;
  observacao: string | null;
  processado: string | null;
}

export interface ItemEstoque {
  nucontagem: number;
  sequencia: number;
  codprod: string;
  descrprod: string;
  referencia: string;
  estoqueatual: number;
  estoquecontagem: number | null;
  contado: boolean;
}

export type EstoqueStep = 'selecionar-contagem' | 'contar-itens' | 'concluido';
