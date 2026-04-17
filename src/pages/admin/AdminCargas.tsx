import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Package, CheckCircle, Clock, TrendingUp } from 'lucide-react';
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

  const filteredCargas = useMemo(() =>
    cargas.filter(c => {
      const matchSearch = !search ||
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        (c.placa?.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    [cargas, search, statusFilter]
  );

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
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Ordem</TableHead>
                    <TableHead className="font-semibold">Placa</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Criado em</TableHead>
                    <TableHead className="text-right font-semibold">Atualizado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCargas.map(carga => (
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
          )}
        </CardContent>
      </Card>

      {selectedCarga && (
        <CargaDetalheModal
          carga={selectedCarga}
          onClose={() => setSelectedCargaId(null)}
        />
      )}
    </div>
  );
};

export default AdminCargas;
