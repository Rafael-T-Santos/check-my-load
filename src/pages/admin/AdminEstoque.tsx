import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Search, BarChart3, CheckCircle, Clock,
  TrendingUp, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ContagemAdmin {
  id: number;
  nucontagem: number;
  codigo: string;
  descricao_marca: string;
  codlocal: string;
  status: string;
  usuario: string;
  criado_em: string;
  atualizado_em: string;
}

interface ItemDetalhe {
  codprod: string;
  descrprod: string;
  referencia: string;
  estoque_atual: number;
  estoque_contagem: number | null;
  sequencia: number;
  atualizado_em: string;
  conferente: string;
}

// ---------------------------------------------------------------------------
// Modal de detalhe
// ---------------------------------------------------------------------------
const ContagemDetalheModal = ({
  contagem,
  onClose,
}: {
  contagem: ContagemAdmin;
  onClose: () => void;
}) => {
  const [itens, setItens] = useState<ItemDetalhe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchItem, setSearchItem] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`http://192.168.255.6:3000/admin/contagens-estoque/${contagem.id}`)
      .then(r => r.json())
      .then(d => setItens(d.itens ?? []))
      .catch(() => toast.error('Erro ao carregar detalhes'))
      .finally(() => setLoading(false));
  }, [contagem.id]);

  const itensFiltrados = itens.filter(i => {
    if (!searchItem) return true;
    const q = searchItem.toLowerCase();
    return (
      i.codprod.toLowerCase().includes(q) ||
      i.descrprod.toLowerCase().includes(q) ||
      (i.referencia?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalContados = itens.filter(i => i.estoque_contagem !== null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl border">
        <div className="px-6 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Contagem #{contagem.nucontagem}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary">{contagem.descricao_marca || contagem.codigo || '-'}</Badge>
              {contagem.codlocal && (
                <span className="text-xs text-muted-foreground">Local: {contagem.codlocal}</span>
              )}
              <Badge
                variant={contagem.status === 'finalizada' ? 'default' : 'secondary'}
                className={cn(contagem.status === 'finalizada' && 'bg-emerald-500 hover:bg-emerald-600')}
              >
                {contagem.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
              </Badge>
              {contagem.usuario && (
                <span className="text-xs text-muted-foreground">por {contagem.usuario}</span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-3 border-b bg-muted/30 flex gap-6 text-sm">
          <span>
            <span className="font-semibold">{itens.length}</span>{' '}
            <span className="text-muted-foreground">itens totais</span>
          </span>
          <span>
            <span className="font-semibold text-emerald-600">{totalContados}</span>{' '}
            <span className="text-muted-foreground">contados</span>
          </span>
          <span>
            <span className="font-semibold text-amber-600">{itens.length - totalContados}</span>{' '}
            <span className="text-muted-foreground">pendentes</span>
          </span>
        </div>

        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar item..."
              value={searchItem}
              onChange={e => setSearchItem(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-10 text-muted-foreground">Carregando itens...</div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Nenhum item encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Código</TableHead>
                  <TableHead className="font-semibold">Descrição</TableHead>
                  <TableHead className="font-semibold text-right">Atual</TableHead>
                  <TableHead className="font-semibold text-right">Contado</TableHead>
                  <TableHead className="font-semibold">Conferente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensFiltrados.map(item => {
                  const diverge =
                    item.estoque_contagem !== null &&
                    item.estoque_contagem !== item.estoque_atual;
                  return (
                    <TableRow key={item.codprod}>
                      <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{item.descrprod}</p>
                        {item.referencia && (
                          <p className="text-xs text-muted-foreground font-mono">{item.referencia}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{item.estoque_atual ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {item.estoque_contagem !== null ? (
                          <span className={cn('font-semibold', diverge && 'text-amber-600')}>
                            {item.estoque_contagem}
                            {diverge && (
                              <span className="ml-1 text-xs font-normal">
                                ({item.estoque_contagem > item.estoque_atual ? '+' : ''}
                                {(item.estoque_contagem - item.estoque_atual).toFixed(0)})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.conferente || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AdminEstoque page
// ---------------------------------------------------------------------------
const AdminEstoque = () => {
  const [contagens, setContagens] = useState<ContagemAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedContagem, setSelectedContagem] = useState<ContagemAdmin | null>(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;

  type SortKey = 'nucontagem' | 'descricao_marca' | 'status' | 'criado_em' | 'atualizado_em';
  const [sortKey, setSortKey] = useState<SortKey>('atualizado_em');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchContagens = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/admin/contagens-estoque');
      if (res.ok) setContagens(await res.json());
    } catch {
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContagens(); }, []);

  const stats = useMemo(() => {
    const total       = contagens.length;
    const finalizadas = contagens.filter(c => c.status === 'finalizada').length;
    const emAndamento = contagens.filter(c => c.status === 'em_andamento').length;
    const taxa        = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
    return { total, finalizadas, emAndamento, taxa };
  }, [contagens]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPagina(1);
  };

  const filteredContagens = useMemo(() => {
    const filtered = contagens.filter(c => {
      const matchSearch =
        !search ||
        c.nucontagem.toString().includes(search) ||
        (c.descricao_marca?.toLowerCase().includes(search.toLowerCase())) ||
        (c.codlocal?.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });

    return [...filtered].sort((a, b) => {
      const va = (a as any)[sortKey] ?? '';
      const vb = (b as any)[sortKey] ?? '';
      const cmp = sortKey === 'nucontagem'
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [contagens, search, statusFilter, sortKey, sortDir]);

  useEffect(() => { setPagina(1); }, [search, statusFilter]);

  const totalPaginas    = Math.max(1, Math.ceil(filteredContagens.length / POR_PAGINA));
  const contagensPagina = filteredContagens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const formatarData    = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '-';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Contagens de Estoque</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe o progresso das contagens de estoque
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchContagens} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Contagens', value: stats.total,       sub: 'contagens registradas', icon: BarChart3,   color: '' },
          { label: 'Em Andamento',       value: stats.emAndamento, sub: 'aguardando conclusão',  icon: Clock,       color: 'text-amber-600' },
          { label: 'Finalizadas',        value: stats.finalizadas, sub: 'contagens concluídas',  icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Taxa de Conclusão',  value: `${stats.taxa}%`,  sub: 'do total finalizado',   icon: TrendingUp,  color: '' },
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
            placeholder="Buscar por número, marca ou local..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="em_andamento">Em Andamento</SelectItem>
            <SelectItem value="finalizada">Finalizada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando contagens...</div>
          ) : filteredContagens.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma contagem encontrada.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {([
                        { key: 'nucontagem',     label: 'Nº Contagem',   className: '' },
                        { key: 'descricao_marca', label: 'Marca / Local', className: '' },
                        { key: 'status',         label: 'Status',        className: '' },
                        { key: 'criado_em',      label: 'Criado em',     className: '' },
                        { key: 'atualizado_em',  label: 'Atualizado em', className: 'text-right' },
                      ] as { key: SortKey; label: string; className: string }[]).map(col => {
                        const active = sortKey === col.key;
                        const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className={cn(
                              'font-semibold cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap',
                              col.className,
                            )}
                            onClick={() => handleSort(col.key)}
                          >
                            <span className={cn('inline-flex items-center gap-1', col.className)}>
                              {col.label}
                              <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-40')} />
                            </span>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contagensPagina.map(c => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedContagem(c)}
                      >
                        <TableCell className="font-medium">#{c.nucontagem}</TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{c.descricao_marca || '-'}</p>
                          {c.codlocal && (
                            <p className="text-xs text-muted-foreground">Local: {c.codlocal}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={c.status === 'finalizada' ? 'default' : 'secondary'}
                            className={cn(c.status === 'finalizada' && 'bg-emerald-500 hover:bg-emerald-600')}
                          >
                            {c.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatarData(c.criado_em)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatarData(c.atualizado_em)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1 pb-2">
                  <span>
                    {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filteredContagens.length)} de {filteredContagens.length} contagens
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

      {selectedContagem && (
        <ContagemDetalheModal
          contagem={selectedContagem}
          onClose={() => setSelectedContagem(null)}
        />
      )}
    </div>
  );
};

export default AdminEstoque;
