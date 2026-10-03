import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, AlertTriangle, Keyboard, Package, Camera, RotateCcw, Loader2, Boxes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { maskBarcode } from '@/lib/barcode';
import { playFeedback } from '@/lib/feedback';
import { cn } from '@/lib/utils';
import type { ItemEntrada, ResultadoLeitura } from '@/types/entrada';

interface EntradaItemModalProps {
  item: ItemEntrada | null;
  isOpen: boolean;
  podeContar: boolean;
  /** Por que a contagem está bloqueada — outro conferente, ou já finalizada. */
  motivoBloqueio: string | null;
  onClose: () => void;
  onLeitura: (itemId: number, codbarras: string) => Promise<ResultadoLeitura>;
  onQuantidade: (itemId: number, quantidade: number) => Promise<unknown>;
  onZerar: (itemId: number) => Promise<void>;
  onObservacao: (itemId: number, observacao: string) => Promise<void>;
  onAbrirFotos: (item: ItemEntrada) => void;
}

/**
 * Contagem de um item da entrada.
 *
 * Nada nesta tela diz quanto a nota esperava. O conferente bipa, conta e
 * confirma; o servidor responde OK ou DIVERGENTE e é só isso que aparece —
 * nem a diferença, nem "faltam N", nem cor antes de confirmar.
 *
 * A validação do código também é do servidor. Os EANs até chegam aqui (é
 * preciso saber que a caixa tem fator 12 para explicar o "+12" ao utilizador),
 * mas quem aceita ou recusa uma leitura é o backend, que de passagem grava a
 * trilha de auditoria de cada bipagem.
 */
export function EntradaItemModal({
  item,
  isOpen,
  podeContar,
  motivoBloqueio,
  onClose,
  onLeitura,
  onQuantidade,
  onZerar,
  onObservacao,
  onAbrirFotos,
}: EntradaItemModalProps) {
  const [scannerAtivo, setScannerAtivo]   = useState(false);
  const [codigoManual, setCodigoManual]   = useState('');
  const [mostrarDigitacao, setMostrarDigitacao] = useState(false);
  const [erroLeitura, setErroLeitura]     = useState<string | null>(null);
  const [ultimaCaixa, setUltimaCaixa]     = useState<number | null>(null);

  const [quantidade, setQuantidade]       = useState('');
  const [salvando, setSalvando]           = useState(false);
  const [erroSalvar, setErroSalvar]       = useState<string | null>(null);

  const [observacao, setObservacao]       = useState('');
  const [salvandoObs, setSalvandoObs]     = useState(false);

  // `item` é recriado a cada resposta do servidor e a cada recarregamento
  // automático da lista. Se o reset dependesse do objeto, uma bipagem de
  // caixa apagaria o próprio "+12" que acabou de mostrar, e uma observação
  // a meio de ser escrita seria descartada por um refresh de fundo. Por isso
  // o reset acontece só ao abrir um item diferente — os valores iniciais vêm
  // do ref, que aponta sempre para a versão mais recente.
  const itemRef = useRef(item);
  itemRef.current = item;
  const itemId = item?.id ?? null;

  useEffect(() => {
    if (!isOpen || itemId === null) return;
    const atual = itemRef.current;
    setScannerAtivo(false);
    setCodigoManual('');
    setMostrarDigitacao(false);
    setErroLeitura(null);
    setUltimaCaixa(null);
    setQuantidade(atual?.conferidoEm ? String(atual.qtdConferida) : '');
    setErroSalvar(null);
    setObservacao(atual?.observacao ?? '');
  }, [isOpen, itemId]);

  const exigeCodigo = !!item && (!!item.ean13 || !!item.ean14);
  // Sem EAN cadastrado não há o que bipar; exigir a leitura seria pedir o
  // impossível e travar o recebimento. O backend aplica a mesma regra.
  const identificado = !!item && (!exigeCodigo || item.ean13Lido);

  const temCaixa = !!item?.ean14 && !!item.fatorEan14 && item.fatorEan14 > 0;

  const veredicto = useMemo(() => {
    if (!item || item.statusItem === 'pendente') return null;
    return item.statusItem;
  }, [item]);

  if (!item) return null;

  const processarCodigo = async (codigo: string) => {
    const limpo = codigo.trim();
    if (!limpo) return;

    setErroLeitura(null);
    try {
      const r = await onLeitura(item.id, limpo);
      playFeedback('success');
      setCodigoManual('');
      setMostrarDigitacao(false);
      if (r.tipo === 'ean14') {
        setUltimaCaixa(r.incremento);
        setQuantidade(String(r.qtdConferida));
      }
    } catch (err) {
      playFeedback('error');
      setErroLeitura(err instanceof Error ? err.message : 'Não foi possível registar a leitura.');
    }
  };

  const handleScan = (codigo: string) => { void processarCodigo(codigo); };

  const handleConfirmar = async () => {
    const qtd = Number(quantidade);
    if (!Number.isFinite(qtd) || qtd < 0) return;

    setSalvando(true);
    setErroSalvar(null);
    try {
      await onQuantidade(item.id, qtd);
      playFeedback('success');
    } catch (err) {
      playFeedback('error');
      setErroSalvar(err instanceof Error ? err.message : 'Não foi possível gravar a quantidade.');
    } finally {
      setSalvando(false);
    }
  };

  const handleZerar = async () => {
    setSalvando(true);
    try {
      await onZerar(item.id);
      setQuantidade('');
      setUltimaCaixa(null);
    } finally {
      setSalvando(false);
    }
  };

  const handleObservacao = async () => {
    setSalvandoObs(true);
    try {
      await onObservacao(item.id, observacao.trim());
    } finally {
      setSalvandoObs(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] sm:max-h-[95vh] flex flex-col relative overflow-hidden"
          >
            {/* Header */}
            <div className="z-20 bg-card p-4 border-b flex items-center justify-between shrink-0 shadow-sm">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight">Conferir Item</h2>
                <p className="text-xs text-muted-foreground">Sequência {item.sequencia}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onAbrirFotos(item)}
                  className="p-2 rounded-full hover:bg-muted transition-colors relative"
                  title="Fotos e anexos"
                >
                  <Camera className="w-5 h-5" />
                  {item.totalFotos > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                      {item.totalFotos}
                    </span>
                  )}
                </button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-5 overflow-y-auto flex-1 pb-8">
              {/* Produto — sem quantidade esperada */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Código</span>
                  <span className="font-mono font-bold text-lg">#{item.codprod}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-sm text-muted-foreground shrink-0">Descrição</span>
                  <span className="text-right text-sm font-medium">{item.descrprod}</span>
                </div>
                {item.unidade && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Unidade</span>
                    <span className="text-sm font-medium">{item.unidade}</span>
                  </div>
                )}
                {(item.ean13 || item.ean14) && (
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    {item.ean13 && (
                      <div>
                        <span className="text-xs text-muted-foreground">EAN13 (unidade): </span>
                        <span className="font-mono text-xs">{maskBarcode(item.ean13)}</span>
                      </div>
                    )}
                    {item.ean14 && (
                      <div>
                        <span className="text-xs text-muted-foreground">EAN14 (caixa): </span>
                        <span className="font-mono text-xs">{maskBarcode(item.ean14)}</span>
                        {temCaixa && (
                          <span className="text-xs text-muted-foreground"> · {item.fatorEan14} un/caixa</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!podeContar && motivoBloqueio && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">{motivoBloqueio}</span>
                </div>
              )}

              {/* Fase 1 — identificar o produto */}
              {podeContar && !identificado && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-center text-muted-foreground">
                    Bipe o código de barras do produto para começar
                  </p>

                  <BarcodeScanner
                    onScan={handleScan}
                    isActive={scannerAtivo}
                    onToggle={() => setScannerAtivo(v => !v)}
                  />

                  {erroLeitura && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-destructive/10 p-3 rounded-md border border-destructive/20"
                    >
                      <p className="text-sm font-semibold text-destructive flex items-center gap-1 justify-center text-center">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {erroLeitura}
                      </p>
                    </motion.div>
                  )}

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>

                  {!mostrarDigitacao ? (
                    <Button variant="outline" className="w-full" onClick={() => setMostrarDigitacao(true)}>
                      <Keyboard className="w-4 h-4 mr-2" />
                      Digitar código manualmente
                    </Button>
                  ) : (
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Código de barras do produto ou da caixa"
                      value={codigoManual}
                      onChange={e => setCodigoManual(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); void processarCodigo(codigoManual); }
                      }}
                      autoFocus
                    />
                  )}
                  {mostrarDigitacao && (
                    <Button
                      className="w-full"
                      disabled={!codigoManual.trim()}
                      onClick={() => void processarCodigo(codigoManual)}
                    >
                      Validar código
                    </Button>
                  )}
                </div>
              )}

              {/* Fase 2 — contar */}
              {podeContar && identificado && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {exigeCodigo && (
                    <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
                      <Check className="w-5 h-5 text-success shrink-0" />
                      <span className="text-sm font-medium text-success">
                        Produto identificado. Registe a quantidade recebida.
                      </span>
                    </div>
                  )}
                  {!exigeCodigo && (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <Package className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        Produto sem código de barras cadastrado. Conte e digite a quantidade.
                      </span>
                    </div>
                  )}

                  {/* Bipagem de caixa — cada leitura soma o fator */}
                  {temCaixa && (
                    <div className="space-y-2">
                      <BarcodeScanner
                        onScan={handleScan}
                        isActive={scannerAtivo}
                        onToggle={() => setScannerAtivo(v => !v)}
                      />
                      <p className="text-xs text-center text-muted-foreground">
                        Cada leitura da caixa soma {item.fatorEan14} unidades.
                      </p>
                      <AnimatePresence>
                        {ultimaCaixa !== null && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center gap-2 p-2 bg-primary/10 rounded-lg"
                          >
                            <Boxes className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold text-primary">
                              +{ultimaCaixa} — total {item.qtdConferida}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Quantidade conferida</label>
                      {item.qtdConferida > 0 && (
                        <button
                          onClick={handleZerar}
                          disabled={salvando}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Zerar contagem
                        </button>
                      )}
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="0"
                      value={quantidade}
                      onChange={e => { setQuantidade(e.target.value); setErroSalvar(null); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (quantidade !== '' && Number(quantidade) >= 0) void handleConfirmar();
                        }
                      }}
                      className="text-center text-3xl font-bold h-16 shadow-inner"
                    />
                  </div>

                  {erroSalvar && (
                    <p className="text-sm text-destructive text-center flex items-center justify-center gap-1">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {erroSalvar}
                    </p>
                  )}

                  {/* Veredicto — só o estado, nunca o valor esperado */}
                  <AnimatePresence>
                    {veredicto && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          'flex items-center gap-2 p-3 rounded-lg border',
                          veredicto === 'ok'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-amber-500/10 border-amber-500/30',
                        )}
                      >
                        {veredicto === 'ok'
                          ? <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                          : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
                        <div className="text-sm">
                          <p className={cn(
                            'font-semibold',
                            veredicto === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                                               : 'text-amber-700 dark:text-amber-400',
                          )}>
                            {veredicto === 'ok' ? 'Quantidade correta' : 'Divergente'}
                          </p>
                          {veredicto === 'divergente' && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Recontagem é bem-vinda. Se o físico estiver certo, registe uma foto
                              e siga para o próximo item — o administrativo decide no final.
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Observação */}
                  <div className="space-y-2 pt-2 border-t">
                    <label className="text-sm font-medium">Observação (opcional)</label>
                    <Textarea
                      placeholder="Avaria, embalagem violada, produto trocado..."
                      value={observacao}
                      onChange={e => setObservacao(e.target.value)}
                      rows={2}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleObservacao}
                      disabled={salvandoObs || observacao.trim() === (item.observacao ?? '')}
                    >
                      {salvandoObs && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Gravar observação
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>

            {podeContar && identificado && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-20 p-4 bg-card border-t shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] shrink-0 flex gap-3"
              >
                <Button
                  onClick={handleConfirmar}
                  disabled={salvando || quantidade === '' || Number(quantidade) < 0}
                  className="flex-1 h-14 text-lg font-bold shadow-md"
                >
                  {salvando && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                  {veredicto ? 'Regravar' : 'Confirmar'}
                </Button>
                {veredicto && (
                  <Button variant="outline" className="h-14 px-6" onClick={onClose}>
                    Próximo
                  </Button>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
