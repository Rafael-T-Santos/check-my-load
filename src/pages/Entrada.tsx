import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PackageCheck, LogOut, Search, ChevronRight, ChevronLeft, RefreshCw,
  CheckCircle, Loader2, AlertTriangle, Truck, Lock, Camera, MessageSquare, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useEntradaProgress } from '@/hooks/useEntradaProgress';
import { EntradaItemModal } from '@/components/entrada/EntradaItemModal';
import { EntradaFotoModal } from '@/components/entrada/EntradaFotoModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CartaoEntrada, ItemEntrada } from '@/types/entrada';

const formatarData = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null;

// ---------------------------------------------------------------------------
// Cartão da fila — uma marca dentro de uma conferência
// ---------------------------------------------------------------------------
const CartaoFila = ({ cartao, onClick }: { cartao: CartaoEntrada; onClick: () => void }) => {
  const pct = cartao.totalItens > 0 ? (cartao.itensConferidos / cartao.totalItens) * 100 : 0;
  const aguardando = cartao.status === 'aguardando_liberacao';

  return (
    <Card className="cursor-pointer hover:border-primary transition-colors" onClick={onClick}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-base">{cartao.marca}</span>
              <Badge
                variant="secondary"
                className={cn('text-xs', aguardando && 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}
              >
                {aguardando ? 'Aguardando liberação' : 'Em conferência'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {cartao.fornecedor || 'Fornecedor não informado'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conferência #{cartao.nuconf}
              {cartao.numnota && <> · Nota {cartao.numnota}</>}
              {cartao.nunota && <> · Pré-entrada {cartao.nunota}</>}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {formatarData(cartao.dtPrevista) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Prevista {formatarData(cartao.dtPrevista)}
            </span>
          )}
          {cartao.qtdVolumes != null && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {/* Volumes da nota inteira, não desta marca. */}
              {cartao.qtdVolumes} vol. na nota
            </span>
          )}
          {cartao.conferente && (
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {cartao.conferente}
            </span>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Progresso desta marca</span>
            <span className="text-xs font-semibold">
              {cartao.itensConferidos}/{cartao.totalItens} itens
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Cartão de item — a cor É o resultado; nunca aparece a quantidade esperada
// ---------------------------------------------------------------------------
const CartaoItem = ({ item, onClick }: { item: ItemEntrada; onClick: () => void }) => (
  <Card
    className={cn(
      'cursor-pointer transition-colors active:scale-[0.99]',
      item.statusItem === 'ok'         && 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20',
      item.statusItem === 'divergente' && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20',
      item.statusItem === 'pendente'   && 'hover:border-primary/50',
    )}
    onClick={onClick}
  >
    <CardContent className="p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs text-muted-foreground">{item.codprod}</span>
          {item.statusItem === 'ok' && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          {item.statusItem === 'divergente' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
        </div>
        <p className="font-medium text-sm leading-tight truncate">{item.descrprod}</p>

        <div className="flex items-center gap-3 mt-1 text-xs">
          {item.statusItem === 'pendente' ? (
            <span className="text-muted-foreground">Não contado</span>
          ) : (
            <span
              className={cn(
                'font-semibold',
                item.statusItem === 'ok' ? 'text-emerald-600' : 'text-amber-600',
              )}
            >
              {item.qtdConferida} {item.unidade || 'un'} ·{' '}
              {item.statusItem === 'ok' ? 'correto' : 'divergente'}
            </span>
          )}
          {item.totalFotos > 0 && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Camera className="h-3 w-3" />{item.totalFotos}
            </span>
          )}
          {item.observacao && <MessageSquare className="h-3 w-3 text-muted-foreground" />}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
const Entrada = () => {
  const navigate = useNavigate();
  const {
    cartoes, cartaoAtual, itens, lock, podeContar, currentStep, desfecho,
    loadingFila, loadingItens,
    carregarFila, abrirMarca, recarregarItens, registrarLeitura, salvarQuantidade,
    zerarItem, salvarObservacao, adicionarFoto, buscarFotos, finalizar,
    voltarParaFila, getStats,
  } = useEntradaProgress();

  const [search, setSearch]                   = useState('');
  const [itemAberto, setItemAberto]           = useState<ItemEntrada | null>(null);
  const [itemFotos, setItemFotos]             = useState<ItemEntrada | null>(null);
  const [finalizando, setFinalizando]         = useState(false);
  const [confirmarAssumir, setConfirmarAssumir] = useState(false);

  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('usuario') || '{}'); }
    catch { return {}; }
  })();

  useEffect(() => {
    carregarFila().catch(() => toast.error('Erro ao carregar a fila de conferências'));
  }, [carregarFila]);

  // Recarrega periodicamente para trazer o que os colegas conferiram na mesma
  // nota. O ref evita recriar o intervalo a cada render.
  const recarregarRef = useRef(recarregarItens);
  useEffect(() => { recarregarRef.current = recarregarItens; }, [recarregarItens]);
  useEffect(() => {
    if (currentStep !== 'itens') return;
    const id = setInterval(() => { void recarregarRef.current(); }, 30_000);
    return () => clearInterval(id);
  }, [currentStep]);

  const handleLogout = () => {
    localStorage.removeItem('usuario');
    navigate('/');
  };

  const handleAbrirCartao = async (cartao: CartaoEntrada) => {
    try {
      const dados = await abrirMarca(cartao);
      const bloqueadaPorColega = !dados.podeContar
        && !!dados.lock.conferenteNome
        && cartao.status === 'em_conferencia';
      if (bloqueadaPorColega) setConfirmarAssumir(true);
    } catch (err) {
      toast.error('Erro ao abrir a marca', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleAssumir = async () => {
    if (!cartaoAtual) return;
    setConfirmarAssumir(false);
    try {
      await abrirMarca(cartaoAtual, true);
      toast.success('Marca assumida', { description: 'A tomada ficou registada no histórico.' });
    } catch {
      toast.error('Não foi possível assumir a marca');
    }
  };

  const handleFinalizar = async () => {
    setFinalizando(true);
    try {
      const r = await finalizar();
      if (r?.status === 'aguardando_liberacao') {
        toast.warning('Conferência com divergência', {
          description: 'Enviada ao administrativo para liberação.',
        });
      } else {
        toast.success('Conferência concluída sem divergências!');
      }
    } catch (err) {
      toast.error('Não foi possível finalizar', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setFinalizando(false);
    }
  };

  const handleVoltar = async () => {
    voltarParaFila();
    await carregarFila().catch(() => {});
  };

  const stats = getStats();

  // Duas coisas diferentes impedem a contagem, e dizer a errada confunde:
  // a marca pertencer a outra pessoa tem conserto (assumir); a conferência já
  // ter saído do estado editável não tem, e quem resolve é o administrativo.
  const aguardandoLiberacao = cartaoAtual?.status === 'aguardando_liberacao';
  const motivoBloqueio = podeContar
    ? null
    : aguardandoLiberacao
      ? 'Esta conferência está aguardando liberação do administrativo e não aceita mais alterações.'
      : lock?.conferenteNome
        ? `Esta marca está sob responsabilidade de ${lock.conferenteNome}. Assuma a marca para poder contar.`
        : 'Esta conferência não aceita mais alterações.';

  const itensFiltrados = itens.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.descrprod.toLowerCase().includes(q) || i.codprod.toLowerCase().includes(q);
  });

  const renderHeader = () => (
    <header className="border-b px-4 py-3 flex items-center justify-between bg-card shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {currentStep !== 'fila' && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleVoltar}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <PackageCheck className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight truncate">
            {currentStep === 'itens' && cartaoAtual
              ? `${cartaoAtual.marca} · #${cartaoAtual.nuconf}`
              : 'Conferência de Entrada'}
          </p>
          <p className="text-xs text-muted-foreground truncate">{usuario.nome}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 px-2 shrink-0">
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );

  // ---------------------------------------------------------------------------
  // Passo 1 — fila
  // ---------------------------------------------------------------------------
  if (currentStep === 'fila') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recebimentos a conferir</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregarFila().catch(() => toast.error('Erro ao atualizar'))}
              disabled={loadingFila}
            >
              <RefreshCw className={cn('h-4 w-4', loadingFila && 'animate-spin')} />
            </Button>
          </div>

          {loadingFila ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : cartoes.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhuma conferência na fila</p>
              <p className="text-sm mt-1">
                As notas aparecem aqui depois de o administrativo lançar a conferência
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartoes.map(c => (
                <CartaoFila
                  key={`${c.nuconf}-${c.marca}`}
                  cartao={c}
                  onClick={() => void handleAbrirCartao(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Passo 2 — itens da marca
  // ---------------------------------------------------------------------------
  if (currentStep === 'itens') {
    const pct = stats.total > 0 ? (stats.conferidos / stats.total) * 100 : 0;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}

        {!podeContar && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center gap-2 shrink-0">
            {aguardandoLiberacao
              ? <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              : <Lock className="h-4 w-4 text-amber-600 shrink-0" />}
            <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
              {aguardandoLiberacao
                ? 'Aguardando liberação do administrativo'
                : <>Marca sob responsabilidade de <strong>{lock?.conferenteNome}</strong></>}
            </span>
            {!aguardandoLiberacao && lock?.conferenteNome && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmarAssumir(true)}>
                Assumir
              </Button>
            )}
          </div>
        )}

        <div className="bg-card border-b px-4 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground text-xs truncate">
              {cartaoAtual?.fornecedor || 'Fornecedor não informado'}
            </span>
            <span className="font-semibold text-sm shrink-0">
              {stats.conferidos}/{stats.total} itens
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary rounded-full h-2 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="px-4 py-3 border-b bg-card shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por produto ou código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingItens ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{search ? `Nenhum item encontrado para "${search}"` : 'Nenhum item nesta marca'}</p>
            </div>
          ) : (
            itensFiltrados.map(item => (
              <CartaoItem key={item.id} item={item} onClick={() => setItemAberto(item)} />
            ))
          )}
        </div>

        <div className="border-t px-4 py-3 bg-card flex gap-3 shrink-0">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void recarregarItens()}
            disabled={loadingItens}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', loadingItens && 'animate-spin')} />
            Atualizar
          </Button>
          <Button
            className="flex-1"
            onClick={handleFinalizar}
            disabled={finalizando || !podeContar || stats.total === 0 || stats.restantes > 0}
          >
            {finalizando
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <CheckCircle className="h-4 w-4 mr-2" />}
            {stats.restantes > 0 ? `Faltam ${stats.restantes}` : 'Finalizar'}
          </Button>
        </div>

        {/* O item que o modal mostra vem sempre da lista, para refletir a
            resposta do servidor logo após cada gravação. */}
        <EntradaItemModal
          item={itemAberto ? (itens.find(i => i.id === itemAberto.id) ?? itemAberto) : null}
          isOpen={!!itemAberto}
          podeContar={podeContar}
          motivoBloqueio={motivoBloqueio}
          onClose={() => setItemAberto(null)}
          onLeitura={registrarLeitura}
          onQuantidade={salvarQuantidade}
          onZerar={zerarItem}
          onObservacao={salvarObservacao}
          onAbrirFotos={setItemFotos}
        />

        <EntradaFotoModal
          item={itemFotos}
          isOpen={!!itemFotos}
          onClose={() => setItemFotos(null)}
          onAddPhoto={adicionarFoto}
          onLoadPhotos={buscarFotos}
        />

        <AlertDialog open={confirmarAssumir} onOpenChange={setConfirmarAssumir}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Assumir esta marca?</AlertDialogTitle>
              <AlertDialogDescription>
                {lock?.conferenteNome} está responsável por esta marca. Ao assumir, você passa a
                ser o conferente e a troca fica registada no histórico. A contagem já feita
                é preservada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Só quero ver</AlertDialogCancel>
              <AlertDialogAction onClick={handleAssumir}>Assumir marca</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Passo 3 — concluído
  // ---------------------------------------------------------------------------
  const comDivergencia = desfecho?.status === 'aguardando_liberacao';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {renderHeader()}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div
          className={cn(
            'h-20 w-20 rounded-full flex items-center justify-center',
            comDivergencia
              ? 'bg-amber-100 dark:bg-amber-900/30'
              : 'bg-emerald-100 dark:bg-emerald-900/30',
          )}
        >
          {comDivergencia
            ? <AlertTriangle className="h-10 w-10 text-amber-600" />
            : <CheckCircle className="h-10 w-10 text-emerald-600" />}
        </div>
        <div>
          <h2 className="text-2xl font-bold">
            {comDivergencia ? 'Aguardando liberação' : 'Conferência concluída!'}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-sm">
            {comDivergencia
              ? `${desfecho?.divergentes} ${desfecho?.divergentes === 1 ? 'item divergiu' : 'itens divergiram'} da nota. O administrativo vai analisar e decidir.`
              : 'Todos os itens bateram com a nota. A entrada já pode seguir.'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
          <Button onClick={handleVoltar}>
            <PackageCheck className="h-4 w-4 mr-2" />
            Voltar à fila
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Entrada;
