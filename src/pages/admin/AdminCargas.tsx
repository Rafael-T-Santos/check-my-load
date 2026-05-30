import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Package, CheckCircle, Clock, TrendingUp, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
import CargaDetalheModal from '@/components/admin/CargaDetalheModal';

export interface Carga {
  id: string;
  placa: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
}

const AdminCargas = () => {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCargaId, setSelectedCargaId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;
  type SortKey = 'id' | 'placa' | 'status' | 'criado_em' | 'atualizado_em';
  const [sortKey, setSortKey] = useState<SortKey>('atualizado_em');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchCargas = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/admin/cargas');
      if (res.ok) setCargas(await res.json());
    } catch {
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCargas(); }, []);

  const stats = useMemo(() => {
    const total = cargas.length;
    const finalizadas = cargas.filter(c => c.status === 'finalizada').length;
    const emAndamento = cargas.filter(c => c.status === 'em_andamento').length;
    const taxa = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
    return { total, finalizadas, emAndamento, taxa };
  }, [cargas]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPagina(1);
  };

  const filteredCargas = useMemo(() => {
    const filtered = cargas.filter(c => {
      const matchSearch = !search ||
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        (c.placa?.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });

    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = sortKey === 'id'
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [cargas, search, statusFilter, sortKey, sortDir]);

  // Reset página ao mudar filtros
  useEffect(() => { setPagina(1); }, [search, statusFilter]);

  const totalPaginas = Math.max(1, Math.ceil(filteredCargas.length / POR_PAGINA));
  const cargasPagina = filteredCargas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const formatarData = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '-';

  const selectedCarga = cargas.find(c => c.id === selectedCargaId) ?? null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cargas</h2>
          <p className="text-sm text-muted-foreground">Acompanhe o progresso das conferências em tempo real</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCargas} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Cargas', value: stats.total, sub: 'cargas registradas', icon: Package, color: '' },
          { label: 'Em Andamento', value: stats.emAndamento, sub: 'aguardando conclusão', icon: Clock, color: 'text-amber-600' },
          { label: 'Finalizadas', value: stats.finalizadas, sub: 'conferências concluídas', icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Taxa de Conclusão', value: `${stats.taxa}%`, sub: 'do total finalizado', icon: TrendingUp, color: '' },
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por ordem ou placa..."
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando cargas...</div>
          ) : filteredCargas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma carga encontrada.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {([
                        { key: 'id',           label: 'Ordem',        className: '' },
                        { key: 'placa',        label: 'Placa',        className: '' },
                        { key: 'status',       label: 'Status',       className: '' },
                        { key: 'criado_em',    label: 'Criado em',    className: '' },
                        { key: 'atualizado_em',label: 'Atualizado em',className: 'text-right' },
                      ] as { key: SortKey; label: string; className: string }[]).map(col => {
                        const active = sortKey === col.key;
                        const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                        return (
                          <TableHead
                            key={col.key}
                            className={cn('font-semibold cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap', col.className)}
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
                    {cargasPagina.map(carga => (
                      <TableRow
                        key={carga.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedCargaId(carga.id)}
                      >
                        <TableCell className="font-medium">#{carga.id}</TableCell>
                        <TableCell>{carga.placa || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={carga.status === 'finalizada' ? 'default' : 'secondary'}
                            className={cn(carga.status === 'finalizada' && 'bg-emerald-500 hover:bg-emerald-600')}
                          >
                            {carga.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatarData(carga.criado_em)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatarData(carga.atualizado_em)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                  <span>
                    {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, filteredCargas.length)} de {filteredCargas.length} cargas
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

      {selectedCarga && (
        <CargaDetalheModal
          carga={selectedCarga}
          onClose={() => setSelectedCargaId(null)}
          onStatusChange={(id, newStatus) => {
            setCargas(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
          }}
        />
      )}
    </div>
  );
};

export default AdminCargas;
