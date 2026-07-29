import { playFeedback } from '@/lib/feedback';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertTriangle, Keyboard } from 'lucide-react';
import { ItemEstoque } from '@/types/estoque';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maskBarcode } from '@/lib/barcode';
import { BarcodeScanner } from '@/components/BarcodeScanner';

interface EstoqueVerificationModalProps {
  item: ItemEstoque | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (codprod: string, qty: number) => void;
}

export function EstoqueVerificationModal({
  item,
  isOpen,
  onClose,
  onConfirm,
}: EstoqueVerificationModalProps) {
  const [manualCode, setManualCode]         = useState('');
  const [quantity, setQuantity]             = useState('');
  const [isBarcode1Valid, setIsBarcode1Valid] = useState(false);
  const [isBarcode2Valid, setIsBarcode2Valid] = useState(true);
  const [showCodeError, setShowCodeError]   = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const allBarcodesValid  = isBarcode1Valid && isBarcode2Valid;
  const isOnBarcode2Phase = isBarcode1Valid && !isBarcode2Valid;

  useEffect(() => {
    if (isOpen && item) {
      setManualCode('');
      setQuantity('');
      // Pula a fase quando o item não exige validação ou não tem o código cadastrado
      setIsBarcode1Valid(!(item.hasBarcode && !!item.referencia));
      setIsBarcode2Valid(!(item.hasBarcode && !!item.referencia2));
      setShowCodeError(false);
      setIsScannerActive(false);
      setShowManualInput(false);
    }
  }, [isOpen, item]);

  if (!item) return null;

  const requiresBarcode1 = item.hasBarcode && !!item.referencia;
  const requiresBarcode2 = item.hasBarcode && !!item.referencia2;
  const requiresAnyBarcode = requiresBarcode1 || requiresBarcode2;

  const expectedCode = isOnBarcode2Phase ? item.referencia2 : item.referencia;

  const validateCode = (code: string) => {
    // Somente o código de barras é aceito — o codprod não vale como validação,
    // senão bastaria ler o número exibido na tela.
    const isValid = !!expectedCode && code === expectedCode;

    if (code.length > 0) {
      if (isValid) {
        playFeedback('success');
        if (isOnBarcode2Phase) {
          setIsBarcode2Valid(true);
        } else {
          setIsBarcode1Valid(true);
          setManualCode('');
          setShowCodeError(false);
          setShowManualInput(false);
        }
      } else if (isScannerActive) {
        playFeedback('error');
      }
    }

    setShowCodeError(!isValid && code.length > 0);
    return isValid;
  };

  const handleScan = (scannedCode: string) => {
    const cleaned = scannedCode.trim();
    setManualCode(cleaned);
    validateCode(cleaned);
  };

  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualCode(value);
    // Só valida quando o que foi digitado já alcançou o tamanho do código
    // esperado — senão cada dígito intermediário acusaria "código incorreto".
    const expectedLength = expectedCode?.length ?? 0;
    if (expectedLength > 0 && value.length >= expectedLength) validateCode(value);
    else setShowCodeError(false);
  };

  const handleConfirm = () => {
    const qty = Number(quantity);
    if (allBarcodesValid && !isNaN(qty) && qty >= 0) {
      onConfirm(item.codprod, qty);
      onClose();
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
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85dvh] sm:max-h-[95vh] flex flex-col relative overflow-hidden"
          >
            {/* Header */}
            <div className="z-20 bg-card p-4 border-b flex items-center justify-between shrink-0 shadow-sm">
              <h2 className="text-lg font-bold">Contar Item</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6 overflow-y-auto flex-1 pb-8">
              {/* Info do produto — sem estoque atual */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Código</span>
                  <span className="font-mono font-bold text-lg">#{item.codprod}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Descrição</span>
                  <span className="text-right text-sm font-medium max-w-[60%]">{item.descrprod}</span>
                </div>
                {item.referencia && (
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        {item.referencia2 ? 'Cód. barras 1: ' : 'Código de barras: '}
                      </span>
                      <span className="font-mono text-xs">{maskBarcode(item.referencia)}</span>
                    </div>
                    {item.referencia2 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Cód. barras 2: </span>
                        <span className="font-mono text-xs">{maskBarcode(item.referencia2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Validação de código de barras */}
              {!allBarcodesValid && (
                <div className="space-y-3">
                  {isOnBarcode2Phase && (
                    <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
                      <Check className="w-5 h-5 text-success" />
                      <span className="text-sm font-medium text-success">1º código verificado!</span>
                    </div>
                  )}

                  <p className="text-sm font-medium text-center text-muted-foreground">
                    {isOnBarcode2Phase
                      ? 'Agora escaneie o 2º código de barras'
                      : 'Escaneie ou digite o código de barras do item'}
                  </p>

                  <BarcodeScanner
                    onScan={handleScan}
                    isActive={isScannerActive}
                    onToggle={() => setIsScannerActive(v => !v)}
                  />

                  {showCodeError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-destructive/10 p-3 rounded-md space-y-2 border border-destructive/20"
                    >
                      <p className="text-sm font-semibold text-destructive flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        Código incorreto
                      </p>
                      <div className="text-xs text-center space-y-1">
                        <p className="text-muted-foreground">
                          Lido: <span className="font-mono font-bold text-foreground text-sm">{maskBarcode(manualCode)}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Esperado:{' '}
                          <span className="font-mono font-bold text-foreground">
                            {maskBarcode(expectedCode) || 'Sem EAN'}
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>

                  {!showManualInput ? (
                    <Button variant="outline" className="w-full" onClick={() => setShowManualInput(true)}>
                      <Keyboard className="w-4 h-4 mr-2" />
                      Digitar código manualmente
                    </Button>
                  ) : (
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Digite o código de barras do item"
                      value={manualCode}
                      onChange={handleManualCodeChange}
                      className={showCodeError ? 'border-destructive focus:ring-destructive' : ''}
                      autoFocus
                    />
                  )}
                </div>
              )}

              {/* Campo de quantidade — só aparece após validar o(s) código(s) */}
              {allBarcodesValid && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
                    <Check className="w-5 h-5 text-success" />
                    <span className="text-sm font-medium text-success">
                      {!requiresAnyBarcode
                        ? 'Produto não exige validação de código. Insira a quantidade.'
                        : requiresBarcode1 && requiresBarcode2
                          ? '2 códigos verificados! Insira a quantidade.'
                          : 'Código verificado! Insira a quantidade contada.'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantidade contada</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="0"
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (quantity !== '' && Number(quantity) >= 0) handleConfirm();
                        }
                      }}
                      className="text-center text-2xl font-bold h-16 shadow-inner"
                      autoFocus
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            {allBarcodesValid && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-20 p-4 bg-card border-t shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] shrink-0"
              >
                <Button
                  onClick={handleConfirm}
                  disabled={quantity === '' || Number(quantity) < 0}
                  className="w-full h-14 text-lg font-bold shadow-md"
                >
                  Confirmar Contagem
                </Button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
