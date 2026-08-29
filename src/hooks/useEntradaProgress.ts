import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { API_URL as API } from '@/lib/api';
import type {
  CartaoEntrada, ItemEntrada, EntradaStep, EntradaLock,
  ResultadoLeitura, DesfechoFinalizacao,
} from '@/types/entrada';

function getLoggedUserId(): number {
  try {
    const userStr = localStorage.getItem('usuario');
    if (userStr) return JSON.parse(userStr).id;
  } catch { /* ignore */ }
  return 1;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new Error(corpo.error || `Falha na requisição (${res.status})`);
  }
  return res.json();
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return pedir<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Estado da conferência de entrada.
 *
 * Diferente de cargas e de estoque, aqui NÃO há contagem acumulada no
 * aparelho nem sincronização periódica de um lote. Cada leitura e cada
 * quantidade vai para o servidor na hora e volta com o veredicto — é o que
 * mantém a conferência cega, já que a comparação nunca pode acontecer no
 * telemóvel. O que sobra de "sync" é só recarregar a lista para ver o
 * trabalho de quem está na mesma nota.
 */
export function useEntradaProgress() {
  const [cartoes, setCartoes]       = useState<CartaoEntrada[]>([]);
  const [cartaoAtual, setCartaoAtual] = useState<CartaoEntrada | null>(null);
  const [itens, setItens]           = useState<ItemEntrada[]>([]);
  const [lock, setLock]             = useState<EntradaLock | null>(null);
  const [podeContar, setPodeContar] = useState(false);
  const [currentStep, setCurrentStep] = useState<EntradaStep>('fila');
  const [desfecho, setDesfecho]     = useState<DesfechoFinalizacao | null>(null);

  const [loadingFila, setLoadingFila]   = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);

  // Guarda contra recarregamentos concorrentes (o intervalo automático e um
  // toque no botão podem cair ao mesmo tempo).
  const recarregandoRef = useRef(false);

  const dispositivo = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 250) : null;

  const carregarFila = useCallback(async () => {
    setLoadingFila(true);
    try {
      const dados = await pedir<{ cartoes: CartaoEntrada[]; erpErro: string | null }>(
        `${API}/entrada/fila`
      );
      setCartoes(dados.cartoes ?? []);
      if (dados.erpErro) toast.warning('Sankhya indisponível', { description: dados.erpErro });
    } finally {
      setLoadingFila(false);
    }
  }, []);

  const aplicarResposta = useCallback((
    cartao: CartaoEntrada,
    dados: { itens: ItemEntrada[]; lock: EntradaLock; podeContar: boolean },
  ) => {
    setCartaoAtual(cartao);
    setItens(dados.itens ?? []);
    setLock(dados.lock);
    setPodeContar(dados.podeContar);
  }, []);

  /**
   * Abre a marca. Sem `assumir`, o servidor não tira a marca de quem já a
   * tem — devolve a lista com `podeContar: false` para a tela poder avisar
   * antes de alguém contar por cima do trabalho do colega.
   */
  const abrirMarca = useCallback(async (cartao: CartaoEntrada, assumir = false) => {
    setLoadingItens(true);
    try {
      const dados = await postJson<{ itens: ItemEntrada[]; lock: EntradaLock; podeContar: boolean }>(
        `${API}/entrada/conferencias/${cartao.nuconf}/marcas/${encodeURIComponent(cartao.marca)}/abrir`,
        { usuario_id: getLoggedUserId(), assumir }
      );
      aplicarResposta(cartao, dados);
      setCurrentStep('itens');
      return dados;
    } finally {
      setLoadingItens(false);
    }
  }, [aplicarResposta]);

  const recarregarItens = useCallback(async () => {
    if (!cartaoAtual || recarregandoRef.current) return;
    recarregandoRef.current = true;
    try {
      const dados = await postJson<{ itens: ItemEntrada[]; lock: EntradaLock; podeContar: boolean }>(
        `${API}/entrada/conferencias/${cartaoAtual.nuconf}/marcas/${encodeURIComponent(cartaoAtual.marca)}/abrir`,
        { usuario_id: getLoggedUserId() }
      );
      aplicarResposta(cartaoAtual, dados);
    } catch (err) {
      console.error('Erro ao recarregar itens da entrada:', err);
    } finally {
      recarregandoRef.current = false;
    }
  }, [cartaoAtual, aplicarResposta]);

  /** Aplica na lista o que o servidor devolveu para um item. */
  const atualizarItem = useCallback((itemId: number, patch: Partial<ItemEntrada>) => {
    setItens(prev => prev.map(i => (i.id === itemId ? { ...i, ...patch } : i)));
  }, []);

  const registrarLeitura = useCallback(async (itemId: number, codbarras: string) => {
    const r = await postJson<ResultadoLeitura>(`${API}/entrada/itens/${itemId}/leituras`, {
      codbarras,
      usuario_id: getLoggedUserId(),
      dispositivo,
    });
    // Ler o EAN13 só identifica o produto e libera a digitação; quem marca o
    // item como conferido é a leitura da caixa ou a quantidade digitada.
    atualizarItem(itemId, {
      qtdConferida: r.qtdConferida,
      statusItem:   r.statusItem,
      ean13Lido:    true,
      ...(r.tipo === 'ean14' ? { conferidoEm: new Date().toISOString() } : {}),
    });
    return r;
  }, [atualizarItem, dispositivo]);

  const salvarQuantidade = useCallback(async (itemId: number, quantidade: number) => {
    const r = await postJson<{ qtdConferida: number; statusItem: ItemEntrada['statusItem'] }>(
      `${API}/entrada/itens/${itemId}/quantidade`,
      { quantidade, usuario_id: getLoggedUserId(), dispositivo }
    );
    atualizarItem(itemId, {
      qtdConferida: r.qtdConferida,
      statusItem:   r.statusItem,
      conferidoEm:  new Date().toISOString(),
    });
    return r;
  }, [atualizarItem, dispositivo]);

  const zerarItem = useCallback(async (itemId: number) => {
    await postJson(`${API}/entrada/itens/${itemId}/zerar`, {
      usuario_id: getLoggedUserId(), dispositivo,
    });
    atualizarItem(itemId, { qtdConferida: 0, statusItem: 'pendente', conferidoEm: null });
  }, [atualizarItem, dispositivo]);

  const salvarObservacao = useCallback(async (itemId: number, observacao: string) => {
    await postJson(`${API}/entrada/itens/${itemId}/observacao`, {
      observacao, usuario_id: getLoggedUserId(),
    });
    atualizarItem(itemId, { observacao: observacao || null });
  }, [atualizarItem]);

  const adicionarFoto = useCallback(async (
    itemId: number, imageData: string, observation: string,
  ) => {
    await postJson(`${API}/entrada/itens/${itemId}/fotos`, {
      id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      imageData,
      observation,
      usuario_id: getLoggedUserId(),
    });
    setItens(prev => prev.map(i => (i.id === itemId ? { ...i, totalFotos: i.totalFotos + 1 } : i)));
  }, []);

  const buscarFotos = useCallback(async (itemId: number) => {
    return pedir<{ id: string; imageData: string; observation: string; capturedAt: string }[]>(
      `${API}/entrada/itens/${itemId}/fotos`
    );
  }, []);

  /**
   * Pede a finalização da conferência inteira (todas as marcas da nota).
   *
   * O servidor recusa enquanto houver item pendente, e é ele que decide se a
   * nota fecha sozinha ou vai para a fila de liberação do administrativo.
   */
  const finalizar = useCallback(async () => {
    if (!cartaoAtual) return null;
    const r = await postJson<DesfechoFinalizacao>(
      `${API}/entrada/conferencias/${cartaoAtual.nuconf}/finalizar`,
      { usuario_id: getLoggedUserId() }
    );
    setDesfecho(r);
    setCurrentStep('concluido');
    return r;
  }, [cartaoAtual]);

  const voltarParaFila = useCallback(() => {
    setCartaoAtual(null);
    setItens([]);
    setLock(null);
    setPodeContar(false);
    setDesfecho(null);
    setCurrentStep('fila');
  }, []);

  /**
   * Progresso desta marca. `divergentes` fica de fora de propósito: um
   * contador de divergências na tela do conferente diria, item a item, o que
   * bateu e o que não bateu — e a partir daí a quantidade da nota se deduz
   * por tentativa.
   */
  const getStats = useCallback(() => {
    const total     = itens.length;
    const conferidos = itens.filter(i => i.statusItem !== 'pendente').length;
    return { total, conferidos, restantes: total - conferidos };
  }, [itens]);

  return {
    cartoes,
    cartaoAtual,
    itens,
    lock,
    podeContar,
    currentStep,
    desfecho,
    loadingFila,
    loadingItens,
    carregarFila,
    abrirMarca,
    recarregarItens,
    registrarLeitura,
    salvarQuantidade,
    zerarItem,
    salvarObservacao,
    adicionarFoto,
    buscarFotos,
    finalizar,
    voltarParaFila,
    getStats,
  };
}
