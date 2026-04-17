import { useState, useEffect, useMemo } from 'react';
import {
  Package, Image, ShoppingBag, AlertTriangle, LayoutList,
  CheckCircle, XCircle, AlertCircle, MinusCircle, Loader2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CargaInfo {
  id: string;
  placa: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
}

interface ProdutoDB {
  produto_codigo: string;
  quantidade_conferida: number;
  marca: string;
  conferente: string;
  atualizado_em: string;
}

interface FotoDB {
  id: string;
  imagem_base64: string;
  observacao: string;
  conferente: string;
  capturado_em: string;
}

interface SacolaProduto {
  code: string;
  description: string;
  quantity: number;
}

interface SacolaDB {
  id: string;
  createdAt: string;
  orders: string[];
  products: SacolaProduto[];
  photos: { id: string }[];
}

interface ErpItem {
  codProd: string;
  descrProd: string;
  marca: string;
  qtdNeg: number;
}

type StatusConferencia = 'conferido' | 'pendente' | 'divergente' | 'excedente' | 'sem_previsao';

interface ProdutoCruzado {
  codigo: string;
  descricao: string;
  marca: string;
  qtdEsperada: number | null;
  qtdConferida: number | null;
  conferente: string;
  status: StatusConferencia;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusConferencia, { label: string; color: string; icon: React.ElementType }> = {
  conferido:    { label: 'Conferido',    color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  pendente:     { label: 'Pendente',     color: 'bg-amber-100 text-amber-800',     icon: MinusCircle },
  divergente:   { label: 'Divergente',   color: 'bg-red-100 text-red-800',         icon: XCircle },
  excedente:    { label: 'Excedente',    color: 'bg-blue-100 text-blue-800',       icon: AlertCircle },
  sem_previsao: { label: 'Sem Previsão', color: 'bg-gray-100 text-gray-700',       icon: AlertTriangle },
};

const STATUS_ORDER: StatusConferencia[] = ['pendente', 'divergente', 'excedente', 'sem_previsao', 'conferido'];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  carga: CargaInfo;
  onClose: () => void;
}

const CargaDetalheModal = ({ carga, onClose }: Props) => {
  const [localData, setLocalData] = useState<{ produtos: ProdutoDB[]; fotos: FotoDB[] } | null>(null);
  const [sacolas, setSacolas] = useState<SacolaDB[] | null>(null);
  const [erpData, setErpData] = useState<ErpItem[] | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [loadingERP, setLoadingERP] = useState(true);
  const [erpError, setErpError] = useState(false);

  useEffect(() => {
    const fetchLocal = async () => {
      try {
        const [resDetalhes, resSacolas] = await Promise.all([
          fetch(`http://192.168.255.6:3000/admin/cargas/${carga.id}`),
          fetch(`http://192.168.255.6:3000/cargas/${carga.id}/sacolas`),
        ]);
        if (resDetalhes.ok) setLocalData(await resDetalhes.json());
        if (resSacolas.ok) setSacolas(await resSacolas.json());
      } catch (e) {
        console.error('Erro ao buscar dados locais:', e);
      } finally {
        setLoadingLocal(false);
      }
    };

    const fetchERP = async () => {
      try {
        const res = await fetch('http://192.168.255.6:5000/api/consultar-ordem-carga', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ordemCarga: Number(carga.id) }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sucesso && Array.isArray(data.dados)) {
            setErpData(data.dados);
          } else {
            setErpError(true);
          }
        } else {
          setErpError(true);
        }
      } catch {
        setErpError(true);
      } finally {
        setLoadingERP(false);
      }
    };

    fetchLocal();
    fetchERP();
  }, [carga.id]);

  // ─── Cross-reference ─────────────────────────────────────────────────────

  const produtosCruzados = useMemo((): ProdutoCruzado[] => {
    if (!localData) return [];

    const localMap = new Map<string, ProdutoDB>(
      localData.produtos.map(p => [p.produto_codigo, p])
    );

    if (!erpData) {
      return localData.produtos.map(p => ({
        codigo: p.produto_codigo,
        descricao: '-',
        marca: p.marca || '-',
        qtdEsperada: null,
        qtdConferida: p.quantidade_conferida,
        conferente: p.conferente || 'Sistema',
        status: 'sem_previsao' as StatusConferencia,
      }));
    }

    // Agrupa ERP por codProd somando qtdNeg
    const erpMap = new Map<string, { descricao: string; marca: string; qtdEsperada: number }>();
    for (const item of erpData) {
      const existing = erpMap.get(item.codProd);
      if (existing) {
        existing.qtdEsperada += item.qtdNeg;
      } else {
        erpMap.set(item.codProd, { descricao: item.descrProd, marca: item.marca, qtdEsperada: item.qtdNeg });
      }
    }

    const result: ProdutoCruzado[] = [];

    for (const [codigo, erp] of erpMap.entries()) {
      const local = localMap.get(codigo);
      let status: StatusConferencia;
      if (!local) {
        status = 'pendente';
      } else if (local.quantidade_conferida === erp.qtdEsperada) {
        status = 'conferido';
      } else if (local.quantidade_conferida > erp.qtdEsperada) {
        status = 'excedente';
      } else {
        status = 'divergente';
      }
      result.push({
        codigo,
        descricao: erp.descricao,
        marca: erp.marca,
        qtdEsperada: erp.qtdEsperada,
        qtdConferida: local?.quantidade_conferida ?? null,
        conferente: local?.conferente ?? '-',
        status,
      });
    }

    // Produtos conferidos localmente que não estão no ERP
    for (const [codigo, local] of localMap.entries()) {
      if (!erpMap.has(codigo)) {
        result.push({
          codigo,
          descricao: '-',
          marca: local.marca || '-',
          qtdEsperada: null,
          qtdConferida: local.quantidade_conferida,
          conferente: local.conferente || 'Sistema',
          status: 'sem_previsao',
        });
      }
    }

    return result.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  }, [localData, erpData]);

  const pendentes = produtosCruzados.filter(p => p.status !== 'conferido');

  const resumeStats = useMemo(() => ({
    total: produtosCruzados.length,
    conferidos: produtosCruzados.filter(p => p.status === 'conferido').length,
    divergentes: produtosCruzados.filter(p => p.status === 'divergente').length,
    pendentes: produtosCruzados.filter(p => p.status === 'pendente').length,
  }), [produtosCruzados]);

  const isLoading = loadingLocal || loadingERP;
  const formatarData = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '-';

  // ─── Render helpers ───────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: StatusConferencia }) => {
    const cfg = STATUS_CONFIG[status];
    const Icon = cfg.icon;
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
            Carga #{carga.id}
            <Badge
              variant={carga.status === 'finalizada' ? 'default' : 'secondary'}
              className={cn(carga.status === 'finalizada' && 'bg-emerald-500')}
            >
              {carga.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap gap-4 text-xs mt-1">
            {carga.placa && <span>Placa: <strong className="text-foreground">{carga.placa}</strong></span>}
            <span>Criado: <strong className="text-foreground">{formatarData(carga.criado_em)}</strong></span>
            <span>Atualizado: <strong className="text-foreground">{formatarData(carga.atualizado_em)}</strong></span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground p-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando dados da carga...
          </div>
        ) : (
          <Tabs defaultValue="resumo" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="shrink-0 mx-6 mt-4 self-start flex-wrap h-auto">
              <TabsTrigger value="resumo" className="flex items-center gap-1.5">
                <LayoutList className="h-4 w-4" /> Resumo
              </TabsTrigger>
              <TabsTrigger value="produtos" className="flex items-center gap-1.5">
                <Package className="h-4 w-4" /> Produtos ({produtosCruzados.length})
              </TabsTrigger>
              <TabsTrigger value="pendencias" className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Pendências
                {pendentes.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none font-bold">
                    {pendentes.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="sacolas" className="flex items-center gap-1.5">
                <ShoppingBag className="h-4 w-4" /> Sacolas ({sacolas?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="fotos" className="flex items-center gap-1.5">
                <Image className="h-4 w-4" /> Fotos ({localData?.fotos.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">

              {/* ── RESUMO ─────────────────────────────────────────────── */}
              <TabsContent value="resumo" className="mt-0 space-y-4">
                {erpError && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    API ERP indisponível. Os totais abaixo refletem apenas os dados locais.
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total de Produtos', value: resumeStats.total, color: '' },
                    { label: 'Conferidos', value: resumeStats.conferidos, color: 'text-emerald-600' },
                    { label: 'Pendentes', value: resumeStats.pendentes, color: 'text-amber-600' },
                    { label: 'Divergentes', value: resumeStats.divergentes, color: 'text-red-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className={cn('text-2xl font-bold', color)}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{sacolas?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sacolas criadas</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{localData?.fotos.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Fotos capturadas</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">
                      {resumeStats.total > 0
                        ? `${Math.round((resumeStats.conferidos / resumeStats.total) * 100)}%`
                        : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Taxa de conferência</p>
                  </div>
                </div>
              </TabsContent>

              {/* ── PRODUTOS ───────────────────────────────────────────── */}
              <TabsContent value="produtos" className="mt-0">
                {erpError && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    API ERP indisponível. Mostrando apenas dados locais sem comparação de quantidades previstas.
                  </div>
                )}
                {produtosCruzados.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Nenhum produto registrado.</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Marca</TableHead>
                          <TableHead className="text-center">Previsto</TableHead>
                          <TableHead className="text-center">Conferido</TableHead>
                          <TableHead>Conferente</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {produtosCruzados.map(p => (
                          <TableRow
                            key={p.codigo}
                            className={cn(
                              p.status === 'pendente' && 'bg-amber-50/40',
                              p.status === 'divergente' && 'bg-red-50/40',
                            )}
                          >
                            <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                            <TableCell className="text-xs max-w-[140px] truncate" title={p.descricao}>{p.descricao}</TableCell>
                            <TableCell className="text-xs">{p.marca}</TableCell>
                            <TableCell className="text-center">{p.qtdEsperada ?? '-'}</TableCell>
                            <TableCell className="text-center font-bold">{p.qtdConferida ?? '-'}</TableCell>
                            <TableCell className="text-xs">{p.conferente}</TableCell>
                            <TableCell><StatusBadge status={p.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* ── PENDÊNCIAS ─────────────────────────────────────────── */}
              <TabsContent value="pendencias" className="mt-0">
                {pendentes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                    <p className="font-medium">Nenhuma pendência!</p>
                    <p className="text-sm text-muted-foreground">Todos os produtos foram conferidos corretamente.</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Marca</TableHead>
                          <TableHead className="text-center">Previsto</TableHead>
                          <TableHead className="text-center">Conferido</TableHead>
                          <TableHead className="text-center">Diferença</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendentes.map(p => {
                          const diff = p.qtdConferida !== null && p.qtdEsperada !== null
                            ? p.qtdConferida - p.qtdEsperada
                            : null;
                          return (
                            <TableRow key={p.codigo}>
                              <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                              <TableCell className="text-xs max-w-[120px] truncate" title={p.descricao}>{p.descricao}</TableCell>
                              <TableCell className="text-xs">{p.marca}</TableCell>
                              <TableCell className="text-center">{p.qtdEsperada ?? '-'}</TableCell>
                              <TableCell className="text-center font-bold">{p.qtdConferida ?? '-'}</TableCell>
                              <TableCell className="text-center font-medium">
                                {diff !== null ? (
                                  <span className={cn(diff < 0 && 'text-red-600', diff > 0 && 'text-blue-600')}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                ) : '-'}
                              </TableCell>
                              <TableCell><StatusBadge status={p.status} /></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* ── SACOLAS ────────────────────────────────────────────── */}
              <TabsContent value="sacolas" className="mt-0">
                {!sacolas || sacolas.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Nenhuma sacola registrada para esta carga.</p>
                ) : (
                  <div className="space-y-3">
                    {sacolas.map(sacola => (
                      <div key={sacola.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm font-medium">{sacola.id}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatarData(sacola.createdAt)}</span>
                        </div>
                        {sacola.orders.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sacola.orders.map(o => (
                              <span key={o} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                                Pedido {o}
                              </span>
                            ))}
                          </div>
                        )}
                        {sacola.products.length > 0 && (
                          <div className="rounded-md border overflow-hidden">
                            <Table>
                              <TableHeader className="bg-muted/50">
                                <TableRow>
                                  <TableHead className="text-xs">Código</TableHead>
                                  <TableHead className="text-xs">Descrição</TableHead>
                                  <TableHead className="text-xs text-center">Qtd</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sacola.products.map((p, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                                    <TableCell className="text-xs">{p.description}</TableCell>
                                    <TableCell className="text-xs text-center font-bold">{p.quantity}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        {sacola.photos.length > 0 && (
                          <p className="text-xs text-muted-foreground">{sacola.photos.length} foto(s) nesta sacola</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── FOTOS ──────────────────────────────────────────────── */}
              <TabsContent value="fotos" className="mt-0">
                {!localData?.fotos.length ? (
                  <p className="text-sm text-muted-foreground py-4">Nenhuma foto registrada para esta carga.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {localData.fotos.map(foto => (
                      <div key={foto.id} className="border rounded-lg overflow-hidden">
                        <img
                          src={foto.imagem_base64}
                          alt="Evidência"
                          className="w-full h-36 object-cover"
                        />
                        <div className="p-2 space-y-1">
                          <p className="text-xs text-muted-foreground break-words line-clamp-2">
                            {foto.observacao || 'Sem observação'}
                          </p>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-medium text-primary">{foto.conferente || 'Sistema'}</p>
                            <p className="text-[10px] text-muted-foreground">{formatarData(foto.capturado_em)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CargaDetalheModal;
