import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ContagemPendente, ItemEstoque, EstoqueStep } from '@/types/estoque';

function getLoggedUserId(): number {
  try {
    const userStr = localStorage.getItem('usuario');
    if (userStr) return JSON.parse(userStr).id;
  } catch { /* ignore */ }
  return 1;
}

export function useEstoqueProgress() {
  const [contagens, setContagens] = useState<ContagemPendente[]>([]);
  const [contagemAtual, setContagemAtual] = useState<ContagemPendente | null>(null);
  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [currentStep, setCurrentStep] = useState<EstoqueStep>('selecionar-contagem');
  const [loadingContagens, setLoadingContagens] = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);

  const carregarContagens = useCallback(async () => {
    setLoadingContagens(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/sankhya/contagens-pendentes');
      if (!res.ok) throw new Error('Falha ao buscar contagens');
      const raw = await res.json();
      // Sankhya pode retornar { sucesso: true, dados: [...] } ou diretamente []
      const lista = Array.isArray(raw) ? raw : (raw.dados ?? []);
      setContagens(lista);
    } finally {
      setLoadingContagens(false);
    }
  }, []);

  const selecionarContagem = useCallback(async (contagem: ContagemPendente) => {
    setLoadingItens(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/sankhya/itens-contagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuContagem: contagem.nucontagem }),
      });
      if (!res.ok) throw new Error('Falha ao buscar itens da contagem');
      const rawItens = await res.json();
      // Normaliza: Sankhya pode retornar { sucesso: true, dados: [...] } ou diretamente []
      const sankhyaItens: any[] = Array.isArray(rawItens) ? rawItens : (rawItens.dados ?? []);

      let progressoDB: any[] = [];
      try {
        const dbRes = await fetch(`http://192.168.255.6:3000/estoque/contagens/${contagem.nucontagem}/progresso`);
        if (dbRes.ok) progressoDB = await dbRes.json();
      } catch {
        console.warn('Progresso não encontrado no banco local');
      }

      const itensMesclados: ItemEstoque[] = sankhyaItens.map(item => {
        const codprod = item.codprod.toString();
        const salvo   = progressoDB.find((p: any) => p.codprod === codprod);
        return {
          nucontagem:      item.nucontagem,
          sequencia:       item.sequencia,
          codprod,
          descrprod:       item.descrprod,
          referencia:      item.referencia ?? '',
          referencia2:     item.ad_referencia2 ?? undefined,
          hasBarcode:      item.ad_validabarra === 'S',
          estoqueatual:    item.estoqueatual,
          estoquecontagem: salvo ? salvo.estoque_contagem : null,
          contado:         !!salvo,
        };
      });

      setContagemAtual(contagem);
      setItens(itensMesclados);
      setCurrentStep('contar-itens');
    } finally {
      setLoadingItens(false);
    }
  }, []);

  const updateItem = useCallback((codprod: string, quantidade: number) => {
    setItens(prev =>
      prev.map(i =>
        i.codprod === codprod
          ? { ...i, estoquecontagem: quantidade, contado: true }
          : i
      )
    );
  }, []);

  const syncWithServer = useCallback(async (itensAtual?: ItemEstoque[], contagemAtualParam?: ContagemPendente | null) => {
    const contagem = contagemAtualParam !== undefined ? contagemAtualParam : contagemAtual;
    if (!contagem) return;
    if (!navigator.onLine) {
      toast.warning('Sem conexão', { description: 'Dados salvos localmente. Sincronizaremos quando a rede voltar.' });
      return;
    }

    try {
      const itensSalvar = (itensAtual ?? itens)
        .filter(i => i.contado && i.estoquecontagem !== null)
        .map(i => ({
          codprod:         i.codprod,
          estoquecontagem: i.estoquecontagem,
          sequencia:       i.sequencia,
          descrprod:       i.descrprod,
          referencia:      i.referencia,
          estoqueatual:    i.estoqueatual,
        }));

      if (itensSalvar.length > 0) {
        await fetch(`http://192.168.255.6:3000/estoque/contagens/${contagem.nucontagem}/sincronizar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itens:      itensSalvar,
            usuario_id: getLoggedUserId(),
            contagem: {
              codigo:          contagem.codigo,
              descricao_marca: contagem.descricao_marca,
              codlocal:        contagem.codlocal,
            },
          }),
        });
      }

      const dbRes = await fetch(`http://192.168.255.6:3000/estoque/contagens/${contagem.nucontagem}/progresso`);
      if (dbRes.ok) {
        const progressoDB: any[] = await dbRes.json();
        setItens(prev => prev.map(item => {
          const salvo = progressoDB.find((p: any) => p.codprod === item.codprod);
          return salvo ? { ...item, estoquecontagem: salvo.estoque_contagem, contado: true } : item;
        }));
      }
    } catch (err) {
      console.error('Erro na sincronização de estoque:', err);
      toast.warning('Conexão fraca', { description: 'Não foi possível sincronizar agora.' });
    }
  }, [contagemAtual, itens]);

  const finalizar = useCallback(async () => {
    if (!contagemAtual) return;
    await syncWithServer();

    const res = await fetch(`http://192.168.255.6:3000/estoque/contagens/${contagemAtual.nucontagem}/finalizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: getLoggedUserId() }),
    });
    if (!res.ok) throw new Error('Falha ao finalizar contagem');
    setCurrentStep('concluido');
  }, [contagemAtual, syncWithServer]);

  const limpar = useCallback(() => {
    setContagemAtual(null);
    setItens([]);
    setContagens([]);
    setCurrentStep('selecionar-contagem');
  }, []);

  const getStats = useCallback(() => {
    const total    = itens.length;
    const contados = itens.filter(i => i.contado).length;
    return { total, contados, restantes: total - contados };
  }, [itens]);

  return {
    contagens,
    contagemAtual,
    itens,
    currentStep,
    loadingContagens,
    loadingItens,
    carregarContagens,
    selecionarContagem,
    updateItem,
    syncWithServer,
    finalizar,
    limpar,
    getStats,
  };
}
