import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Search, PackageCheck, CheckCircle, Clock, AlertTriangle, X,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Loader2, Undo2, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { API_URL as API } from '@/lib/api';

interface EntradaAdmin {
  id: number;
  nuconf: number;
  nunota: number | null;
  numnota: string | null;
  fornecedor: string | null;
  dt_prevista: string | null;
  qtd_volumes: number | null;
  status: string;
  marcas: string | null;
  total_itens: number;
  conferidos: number;
  divergentes: number;
  criado_em: string;
  atualizado_em: string;
  dh_inicio: string | null;
  dh_fim: string | null;
  justificativa: string | null;
  liberado_por: string | null;
}

interface ItemAdmin {
  id: number;
  sequencia: number;
  codprod: string;
  descrprod: string;
  marca: string;
  unidade: string | null;
  ean13: string | null;
  ean14: string | null;
  fator_ean14: number | null;
  qtd_esperada: number;
  qtd_conferida: number;
  status_item: 'pendente' | 'ok' | 'divergente';
  observacao: string | null;
  conferido_em: string | null;
  conferente: string | null;
  total_fotos: number;
}

interface LeituraAdmin {
  item_id: number;
  codbarras: string | null;
  tipo: string;
  qtd_incremento: number | null;
  qtd_resultante: number | null;
  criado_em: string;
  dispositivo: string | null;
  usuario: string | null;
}

interface FotoAdmin {
  id: string;
  itemId: number | null;
  imageData: string;
  observation: string | null;
  capturedAt: string;
  usuario: string | null;
}

interface HistoricoAdmin {
  acao: string;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
  usuario: string | null;
}

const ROTULO_STATUS: Record<string, { label: string; className: string }> = {
  em_conferencia:            { label: 'Em conferência',        className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  aguardando_liberacao:      { label: 'Aguardando liberação',  className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  concluida_sem_divergencia: { label: 'Concluída',             className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  concluida_com_divergencia: { label: 'Concluída c/ divergência', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  cancelada:                 { label: 'Cancelada',             className: 'bg-muted text-muted-foreground' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = ROTULO_STATUS[status] ?? { label: status, className: '' };
  return <Badge variant="secondary" className={cn('whitespace-nowrap', cfg.className)}>{cfg.label}</Badge>;
};

const formatarDataHora = (d: string | null) => (d ? new Date(d).toLocaleString('pt-BR') : '-');

function getLoggedUserId(): number {
  try {
    const u = localStorage.getItem('usuario');
    if (u) return JSON.parse(u).id;
  } catch { /* ignore */ }
  return 1;
}

// ---------------------------------------------------------------------------
// Modal de detalhe — aqui, e só aqui, a quantidade esperada aparece
// ---------------------------------------------------------------------------
const EntradaDetalheModal = ({
  entrada, onClose, onMudou,
}: {
  entrada: EntradaAdmin;
  onClose: () => void;
  onMudou: () => void;
}) => {
  const [itens, setItens]         = useState<ItemAdmin[]>([]);
  const [leituras, setLeituras]   = useState<LeituraAdmin[]>([]);
  const [fotos, setFotos]         = useState<FotoAdmin[]>([]);
  const [historico, setHistorico] = useState<HistoricoAdmin[]>([]);
  const [loading, setLoading]     = useState(true);

  const [justificativa, setJustificativa] = useState('');
  const [motivo, setMotivo]               = useState('');
  const [zerarItens, setZerarItens]       = useState(false);
  const [acaoEmCurso, setAcaoEmCurso]     = useState<string | null>(null);

  const carregar = () => {
    setLoading(true);
    fetch(`${API}/admin/entradas/${entrada.id}`)
      .then(r => r.json())
      .then(d => {
        setItens(d.itens ?? []);
        setLeituras(d.leituras ?? []);
        setFotos(d.fotos ?? []);
        setHistorico(d.historico ?? []);
      })
      .catch(() => toast.error('Erro ao carregar detalhes'))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [entrada.id]);

  const executar = async (acao: string, corpo: Record<string, unknown>) => {
    setAcaoEmCurso(acao);
    try {
      const res = await fetch(`${API}/admin/entradas/${entrada.id}/${acao}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: getLoggedUserId(), ...corpo }),
      });
      const corpoRes = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpoRes.error || 'Falha na operação');
      toast.success('Operação registrada');
      setJustificativa('');
      setMotivo('');
      carregar();
      onMudou();
    } catch (err) {
      toast.error('Não foi possível concluir', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAcaoEmCurso(null);
    }
  };

  const divergentes = itens.filter(i => i.status_item === 'divergente');
  const podeLiberar = entrada.status === 'aguardando_liberacao';
  const podeDevolver = ['aguardando_liberacao', 'concluida_com_divergencia', 'concluida_sem_divergencia']
    .includes(entrada.status);
  const podeCancelar = !['cancelada'].includes(entrada.status);

  const leiturasPorItem = useMemo(() => {
    const mapa = new Map<number, LeituraAdmin[]>();
    for (const l of leituras) {
      if (!mapa.has(l.item_id)) mapa.set(l.item_id, []);
      mapa.get(l.item_id)!.push(l);
    }
    return mapa;
  }, [leituras]);

  const nomeItem = (id: number | null) => {
    const it = itens.find(i => i.id === id);
    return it ? `#${it.codprod} · ${it.descrprod}` : 'Conferência';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl shadow-2xl border">
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">
              Conferência #{entrada.nuconf}
              {entrada.numnota && <span className="text-muted-foreground font-normal"> · Nota {entrada.numnota}</span>}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
              <StatusBadge status={entrada.status} />
              {entrada.fornecedor && <span>{entrada.fornecedor}</span>}
              {entrada.marcas && <span>· {entrada.marcas}</span>}
              {entrada.qtd_volumes != null && <span>· {entrada.qtd_volumes} volumes</span>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-3 border-b bg-muted/30 flex gap-6 text-sm flex-wrap">
          <span><span className="font-semibold">{entrada.total_itens}</span> <span className="text-muted-foreground">itens</span></span>
          <span><span className="font-semibold text-emerald-600">{entrada.conferidos}</span> <span className="text-muted-foreground">conferidos</span></span>
          <span><span className="font-semibold text-amber-600">{entrada.divergentes}</span> <span className="text-muted-foreground">divergentes</span></span>
          <span className="text-muted-foreground">Início: {formatarDataHora(entrada.dh_inicio)}</span>
          <span className="text-muted-foreground">Fim: {formatarDataHora(entrada.dh_fim)}</span>
        </div>

        {entrada.justificativa && (
          <div className="px-6 py-3 border-b bg-orange-500/5 text-sm">
            <p className="font-medium text-orange-700 dark:text-orange-400">
              Divergência liberada{entrada.liberado_por && ` por ${entrada.liberado_por}`}
            </p>
            <p className="text-muted-foreground mt-0.5">{entrada.justificativa}</p>
          </div>
        )}

        <Tabs defaultValue="itens" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3">
            <TabsList>
              <TabsTrigger value="itens">Itens</TabsTrigger>
              <TabsTrigger value="divergencias">
                Divergências{divergentes.length > 0 && ` (${divergentes.length})`}
              </TabsTrigger>
              <TabsTrigger value="fotos">Fotos{fotos.length > 0 && ` (${fotos.length})`}</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
              <TabsTrigger value="acoes">Ações</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <TabsContent value="itens" className="mt-0">
                  <TabelaItens itens={itens} />
                </TabsContent>

                <TabsContent value="divergencias" className="mt-0">
                  {divergentes.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">
                      Nenhuma divergência nesta conferência.
                    </p>
                  ) : (
                    <TabelaItens itens={divergentes} />
                  )}
                </TabsContent>

                <TabsContent value="fotos" className="mt-0">
                  {fotos.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">Nenhuma foto registrada.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {fotos.map(f => (
                        <div key={f.id} className="border rounded-lg overflow-hidden">
                          <img src={f.imageData} alt="Foto da conferência" className="w-full h-44 object-cover" />
                          <div className="p-2 space-y-0.5">
                            <p className="text-xs font-medium truncate">{nomeItem(f.itemId)}</p>
                            {f.observation && <p className="text-xs text-muted-foreground">{f.observation}</p>}
                            <p className="text-[10px] text-muted-foreground">
                              {f.usuario} · {formatarDataHora(f.capturedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* A trilha de bipagens: sem ela não dá para saber se 120 foi
                    digitado à mão ou vieram 10 caixas de 12. */}
                <TabsContent value="auditoria" className="mt-0 space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Leituras ({leituras.length})</h4>
                    {leituras.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma leitura registrada.</p>
                    ) : (
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-semibold">Item</TableHead>
                              <TableHead className="font-semibold">Tipo</TableHead>
                              <TableHead className="font-semibold">Código</TableHead>
                              <TableHead className="font-semibold text-right">Incremento</TableHead>
                              <TableHead className="font-semibold text-right">Total</TableHead>
                              <TableHead className="font-semibold">Quem / Quando</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leituras.map((l, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="text-xs">{nomeItem(l.item_id)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px] uppercase">{l.tipo}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{l.codbarras || '-'}</TableCell>
                                <TableCell className="text-right text-xs">
                                  {l.qtd_incremento != null && l.qtd_incremento > 0 ? '+' : ''}
                                  {l.qtd_incremento ?? '-'}
                                </TableCell>
                                <TableCell className="text-right text-xs font-medium">{l.qtd_resultante ?? '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {l.usuario || '-'} · {formatarDataHora(l.criado_em)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Histórico</h4>
                    <div className="space-y-2">
                      {historico.map((h, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 py-0.5">
                          <span className="font-medium">{h.acao.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground text-xs flex-1">
                            {h.detalhes && Object.keys(h.detalhes).length > 0 && JSON.stringify(h.detalhes)}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {h.usuario || 'sistema'} · {formatarDataHora(h.criado_em)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="acoes" className="mt-0 space-y-6 max-w-2xl">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Liberar divergência</h4>
                    <p className="text-xs text-muted-foreground">
                      Aceita as quantidades físicas e conclui a conferência. A justificativa é
                      obrigatória e fica gravada com o seu nome e a data.
                    </p>
                    <Textarea
                      placeholder="Por que esta divergência está sendo aceita?"
                      value={justificativa}
                      onChange={e => setJustificativa(e.target.value)}
                      rows={3}
                      disabled={!podeLiberar}
                    />
                    <Button
                      onClick={() => executar('liberar', { justificativa })}
                      disabled={!podeLiberar || justificativa.trim().length < 5 || acaoEmCurso !== null}
                    >
                      {acaoEmCurso === 'liberar' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Liberar e concluir
                    </Button>
                    {!podeLiberar && (
                      <p className="text-xs text-muted-foreground">
                        Disponível apenas para conferências aguardando liberação.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-sm font-semibold">Devolver para nova conferência</h4>
                    <p className="text-xs text-muted-foreground">
                      Reabre a conferência no aplicativo. A contagem já feita é preservada, a menos
                      que você peça a recontagem do zero.
                    </p>
                    <Input
                      placeholder="Motivo (opcional)"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      disabled={!podeDevolver}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={zerarItens}
                        onChange={e => setZerarItens(e.target.checked)}
                        disabled={!podeDevolver}
                      />
                      Zerar todas as contagens (recontagem completa)
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => executar('devolver', { motivo, zerar_itens: zerarItens })}
                      disabled={!podeDevolver || acaoEmCurso !== null}
                    >
                      {acaoEmCurso === 'devolver' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Undo2 className="h-4 w-4 mr-2" />
                      Devolver ao conferente
                    </Button>
                  </div>

                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-sm font-semibold">Cancelar conferência</h4>
                    <p className="text-xs text-muted-foreground">
                      Anula a conferência preservando todo o histórico. Informe o motivo.
                    </p>
                    <Input
                      placeholder="Motivo do cancelamento"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      disabled={!podeCancelar}
                    />
                    <Button
                      variant="destructive"
                      onClick={() => executar('cancelar', { motivo })}
                      disabled={!podeCancelar || motivo.trim().length < 5 || acaoEmCurso !== null}
                    >
                      {acaoEmCurso === 'cancelar' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Ban className="h-4 w-4 mr-2" />
                      Cancelar conferência
                    </Button>
                  </div>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
};

const TabelaItens = ({ itens }: { itens: ItemAdmin[] }) => (
  <div className="rounded-md border overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="font-semibold">Código</TableHead>
          <TableHead className="font-semibold">Produto</TableHead>
          <TableHead className="font-semibold">Marca</TableHead>
          <TableHead className="font-semibold text-right">Nota</TableHead>
          <TableHead className="font-semibold text-right">Conferido</TableHead>
          <TableHead className="font-semibold">Status</TableHead>
          <TableHead className="font-semibold">Conferente</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map(item => {
          const diff = item.qtd_conferida - item.qtd_esperada;
          return (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
              <TableCell>
                <p className="font-medium text-sm">{item.descrprod}</p>
                {item.observacao && (
                  <p className="text-xs text-amber-600 mt-0.5">{item.observacao}</p>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.marca}</TableCell>
              <TableCell className="text-right text-sm">{item.qtd_esperada}</TableCell>
              <TableCell className="text-right text-sm">
                <span className={cn('font-semibold', item.status_item === 'divergente' && 'text-amber-600')}>
                  {item.status_item === 'pendente' ? '—' : item.qtd_conferida}
                </span>
                {item.status_item === 'divergente' && (
                  <span className="ml-1 text-xs font-normal text-amber-600">
                    ({diff > 0 ? '+' : ''}{diff})
                  </span>
                )}
              </TableCell>
              <TableCell>
                {item.status_item === 'ok' && (
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">OK</Badge>
                )}
                {item.status_item === 'divergente' && (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Divergente</Badge>
                )}
                {item.status_item === 'pendente' && (
                  <Badge variant="secondary">Pendente</Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.conferente || '-'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
const AdminEntradas = () => {
  const [entradas, setEntradas]     = useState<EntradaAdmin[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selecionada, setSelecionada]   = useState<EntradaAdmin | null>(null);
  const [pagina, setPagina]         = useState(1);
  const POR_PAGINA = 15;

  type SortKey = 'nuconf' | 'fornecedor' | 'status' | 'dt_prevista' | 'atualizado_em';
  const [sortKey, setSortKey] = useState<SortKey>('atualizado_em');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchEntradas = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/entradas`);
      if (res.ok) setEntradas(await res.json());
    } catch {
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntradas(); }, []);

  // Mantém o modal com os dados recém-carregados depois de liberar/devolver.
  useEffect(() => {
    if (!selecionada) return;
    const atual = entradas.find(e => e.id === selecionada.id);
    if (atual && atual !== selecionada) setSelecionada(atual);
  }, [entradas, selecionada]);

  const stats = useMemo(() => ({
    total:       entradas.length,
    emCurso:     entradas.filter(e => e.status === 'em_conferencia').length,
    aguardando:  entradas.filter(e => e.status === 'aguardando_liberacao').length,
    concluidas:  entradas.filter(e => e.status.startsWith('concluida')).length,
  }), [entradas]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPagina(1);
  };

  const filtradas = useMemo(() => {
    const q = search.toLowerCase();
    const base = entradas.filter(e => {
      const matchSearch = !search
        || String(e.nuconf).includes(search)
        || String(e.numnota ?? '').includes(search)
        || (e.fornecedor?.toLowerCase().includes(q) ?? false)
        || (e.marcas?.toLowerCase().includes(q) ?? false);
      const matchStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchSearch && matchStatus;
    });

    return [...base].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey] ?? '';
      const vb = (b as unknown as Record<string, unknown>)[sortKey] ?? '';
      const cmp = sortKey === 'nuconf'
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [entradas, search, statusFilter, sortKey, sortDir]);

  useEffect(() => { setPagina(1); }, [search, statusFilter]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const daPagina     = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Conferências de Entrada</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe os recebimentos e decida sobre as divergências
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEntradas} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',                value: stats.total,      sub: 'conferências lançadas',   icon: PackageCheck,  color: '' },
          { label: 'Em conferência',       value: stats.emCurso,    sub: 'na doca agora',           icon: Clock,         color: 'text-blue-600' },
          { label: 'Aguardando liberação', value: stats.aguardando, sub: 'esperando sua decisão',   icon: AlertTriangle, color: 'text-amber-600' },
          { label: 'Concluídas',           value: stats.concluidas, sub: 'entradas encerradas',     icon: CheckCircle,   color: 'text-emerald-600' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn('text-3xl font-bold', color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por conferência, nota, fornecedor ou marca..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(ROTULO_STATUS).map(([valor, cfg]) => (
              <SelectItem key={valor} value={valor}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando conferências...</div>
          ) : filtradas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma conferência encontrada.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {([
                        { key: 'nuconf',        label: 'Conferência' },
                        { key: 'fornecedor',    label: 'Fornecedor / Marcas' },
                        { key: 'status',        label: 'Status' },
                        { key: 'dt_prevista',   label: 'Prevista' },
                        { key: 'atualizado_em', label: 'Atualizada' },
                      ] as { key: SortKey; label: string }[]).map(col => {
                        const active = sortKey === col.key;
                        const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className="font-semibold cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap"
                            onClick={() => handleSort(col.key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-40')} />
                            </span>
                          </TableHead>
                        );
                      })}
                      <TableHead className="font-semibold text-right">Progresso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPagina.map(e => (
                      <TableRow
                        key={e.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelecionada(e)}
                      >
                        <TableCell className="font-medium">
                          #{e.nuconf}
                          {e.numnota && <p className="text-xs text-muted-foreground font-normal">Nota {e.numnota}</p>}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{e.fornecedor || '-'}</p>
                          {e.marcas && <p className="text-xs text-muted-foreground">{e.marcas}</p>}
                        </TableCell>
                        <TableCell><StatusBadge status={e.status} /></TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {e.dt_prevista ? new Date(e.dt_prevista).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatarDataHora(e.atualizado_em)}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {e.conferidos}/{e.total_itens}
                          {e.divergentes > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">{e.divergentes} div.</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1 pb-2">
                  <span>
                    {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filtradas.length)} de {filtradas.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 font-medium text-foreground">{pagina} / {totalPaginas}</span>
                    <Button variant="outline" size="sm" onClick={() => setPagina(p => p + 1)} disabled={pagina === totalPaginas}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selecionada && (
        <EntradaDetalheModal
          entrada={selecionada}
          onClose={() => setSelecionada(null)}
          onMudou={fetchEntradas}
        />
      )}
    </div>
  );
};

export default AdminEntradas;
