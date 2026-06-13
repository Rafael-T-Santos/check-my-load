import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, LogOut, BarChart3, Search, ChevronRight,
  RefreshCw, CheckCircle, Loader2, ChevronLeft, ScanBarcode, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEstoqueProgress } from '@/hooks/useEstoqueProgress';
import { EstoqueVerificationModal } from '@/components/estoque/EstoqueVerificationModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ItemEstoque, ContagemPendente } from '@/types/estoque';

// ---------------------------------------------------------------------------
// ItemCard — card clicável, sem mostrar estoque atual
// ---------------------------------------------------------------------------
const ItemCard = ({
  item,
  onClick,
}: {
  item: ItemEstoque;
  onClick: () => void;
}) => (
  <Card
    className={cn(
      'cursor-pointer transition-colors active:scale-[0.99]',
      item.contado
        ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
        : 'hover:border-primary/50',
    )}
    onClick={onClick}
  >
    <CardContent className="p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs text-muted-foreground">{item.codprod}</span>
          {item.contado && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
        </div>
        <p className="font-medium text-sm leading-tight truncate">{item.descrprod}</p>
        {item.referencia && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{item.referencia}</p>
        )}
        {item.contado && item.estoquecontagem !== null && (
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            Contado: {item.estoquecontagem}
          </p>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-center gap-1 text-muted-foreground">
        {item.hasBarcode
          ? <ScanBarcode className="h-4 w-4" />
          : <ChevronRight className="h-4 w-4" />
        }
      </div>
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Estoque page
// ---------------------------------------------------------------------------
const Estoque = () => {
  const navigate = useNavigate();
  const {
    contagens,
    contagemAtual,
    itens,
    currentStep,
    loadingContagens,
    loadingItens,
    loadingSync,
    carregarContagens,
    selecionarContagem,
    updateItem,
    syncWithServer,
    recarregarItens,
    finalizar,
    limpar,
    getStats,
  } = useEstoqueProgress();

  const [search, setSearch]               = useState('');
  const [finalizando, setFinalizando]     = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<ItemEstoque | null>(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false); // task #6

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('usuario') || '{}'); }
    catch { return {}; }
  })();

  useEffect(() => {
    carregarContagens().catch(() => toast.error('Erro ao carregar contagens pendentes'));
  }, [carregarContagens]);

  // task #2: ref mantém syncWithServer sempre atualizado sem recriar o interval
  const syncWithServerRef = useRef(syncWithServer);
  useEffect(() => { syncWithServerRef.current = syncWithServer; }, [syncWithServer]);

  useEffect(() => {
    if (currentStep !== 'contar-itens') return;
    const id = setInterval(() => syncWithServerRef.current(), 30_000);
    return () => clearInterval(id);
  }, [currentStep]); // sem syncWithServer nas deps — interval não é mais resetado

  const handleLogout = () => {
    localStorage.removeItem('usuario');
    navigate('/');
  };

  // task #6: pede confirmação se há itens contados
  const handleBack = async () => {
    const { contados } = getStats();
    if (contados > 0) {
      setShowBackConfirm(true);
      return;
    }
    await syncWithServer();
    limpar();
    carregarContagens().catch(() => {});
  };

  const confirmarBack = async () => {
    setShowBackConfirm(false);
    await syncWithServer();
    limpar();
    carregarContagens().catch(() => {});
  };

  const handleSelecionarContagem = async (contagem: ContagemPendente) => {
    try {
      await selecionarContagem(contagem);
    } catch {
      toast.error('Erro ao carregar itens da contagem');
    }
  };

  // task #1: passa itens já atualizados para evitar race condition com setState
  const handleConfirmarItem = (codprod: string, qty: number) => {
    updateItem(codprod, qty);
    const itensAtualizados = itens.map(i =>
      i.codprod === codprod ? { ...i, estoquecontagem: qty, contado: true } : i
    );
    syncWithServer(itensAtualizados);
    toast.success('Item registrado', { description: `${qty} unidades contadas.` });
  };

  const handleFinalizar = async () => {
    setFinalizando(true);
    try {
      await finalizar();
      toast.success('Contagem finalizada com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao finalizar contagem.', {
        description: err?.message || 'Verifique a conexão com o servidor.',
      });
    } finally {
      setFinalizando(false);
    }
  };

  // task #5: fecha modal antes de recarregarItens atualizar a lista
  const handleSincronizar = async () => {
    setItemSelecionado(null);
    await recarregarItens();
  };

  const stats = getStats();

  const itensFiltrados = itens.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.descrprod.toLowerCase().includes(q) ||
      i.codprod.toLowerCase().includes(q) ||
      (i.referencia?.toLowerCase().includes(q) ?? false)
    );
  });

  // ---------------------------------------------------------------------------
  // Header comum
  // ---------------------------------------------------------------------------
  const renderHeader = () => (
    <header className="border-b px-4 py-3 flex items-center justify-between bg-card shrink-0">
      <div className="flex items-center gap-2">
        {currentStep === 'contar-itens' && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="font-bold text-sm leading-tight">
            {currentStep === 'contar-itens' && contagemAtual
              ? `Contagem #${contagemAtual.nucontagem}`
              : 'Contagem de Estoque'}
          </p>
          <p className="text-xs text-muted-foreground">{usuario.nome}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 px-2">
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );

  // ---------------------------------------------------------------------------
  // Passo 1 — Selecionar contagem
  // ---------------------------------------------------------------------------
  if (currentStep === 'selecionar-contagem') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Contagens Pendentes</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregarContagens().catch(() => toast.error('Erro ao atualizar'))}
              disabled={loadingContagens}
            >
              <RefreshCw className={cn('h-4 w-4', loadingContagens && 'animate-spin')} />
            </Button>
          </div>

          {loadingContagens ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : contagens.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma contagem pendente</p>
              <p className="text-sm mt-1">Todas as contagens foram processadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contagens.map(c => (
                <Card
                  key={c.nucontagem}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelecionarContagem(c)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">#{c.nucontagem}</span>
                        <Badge variant="secondary" className="text-xs">
                          {c.descricao_marca || c.codigo || 'Sem marca'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Local: <span className="font-medium text-foreground">{c.codlocal || '-'}</span>
                        {c.dtcad && (
                          <span className="ml-2">
                            · {new Date(c.dtcad).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </p>
                      {c.observacao && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{c.observacao}</p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Passo 2 — Contar itens
  // ---------------------------------------------------------------------------
  if (currentStep === 'contar-itens') {
    const pct = stats.total > 0 ? (stats.contados / stats.total) * 100 : 0;

    // task #7: label contextual do botão Finalizar
    const finalizarLabel = (() => {
      if (finalizando) return null;
      if (stats.total === 0) return 'Sem itens';
      if (stats.contados < stats.total) return `Faltam ${stats.restantes}`;
      return 'Finalizar';
    })();

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}

        {/* Barra de progresso */}
        <div className="bg-card border-b px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground text-xs">
              {contagemAtual?.descricao_marca}
              {contagemAtual?.codlocal && ` · Local ${contagemAtual.codlocal}`}
            </span>
            <span className="font-semibold text-sm">
              {stats.contados}/{stats.total} itens
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary rounded-full h-2 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Busca */}
        <div className="px-4 py-3 border-b bg-card shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por produto, código ou referência..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Lista de itens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingItens ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : itens.length === 0 ? (
            // task #7: lista vazia vinda do Sankhya
            <div className="text-center py-16 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum item nesta contagem</p>
              <p className="text-sm mt-1">O Sankhya não retornou itens para esta contagem</p>
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum item encontrado para "{search}"</p>
            </div>
          ) : (
            itensFiltrados.map(item => (
              <ItemCard
                key={item.codprod}
                item={item}
                onClick={() => setItemSelecionado(item)}
              />
            ))
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t px-4 py-3 bg-card flex gap-3 shrink-0">
          <Button variant="outline" className="flex-1" onClick={handleSincronizar} disabled={loadingSync}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loadingSync && 'animate-spin')} />
            Sincronizar
          </Button>
          <Button
            className="flex-1"
            onClick={handleFinalizar}
            disabled={finalizando || stats.total === 0 || stats.contados < stats.total}
          >
            {finalizando
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <CheckCircle className="h-4 w-4 mr-2" />
            }
            {finalizarLabel}
          </Button>
        </div>

        {/* Modal de verificação */}
        <EstoqueVerificationModal
          item={itemSelecionado}
          isOpen={!!itemSelecionado}
          onClose={() => setItemSelecionado(null)}
          onConfirm={handleConfirmarItem}
        />

        {/* task #6: confirmação ao voltar com itens contados */}
        <AlertDialog open={showBackConfirm} onOpenChange={setShowBackConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sair da contagem?</AlertDialogTitle>
              <AlertDialogDescription>
                Você tem {stats.contados} item(ns) contado(s). O progresso será salvo antes de sair,
                mas você precisará continuar a contagem depois.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar contando</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarBack}>Salvar e sair</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Passo 3 — Concluído
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {renderHeader()}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Contagem Finalizada!</h2>
          <p className="text-muted-foreground mt-1">
            {stats.contados} {stats.contados === 1 ? 'item enviado' : 'itens enviados'} ao sistema.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
          <Button
            onClick={async () => {
              limpar();
              await carregarContagens().catch(() => {});
            }}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Nova Contagem
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Estoque;
