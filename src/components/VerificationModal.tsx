import { playFeedback } from '@/lib/feedback';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertTriangle, Keyboard } from 'lucide-react';
import { Product } from '@/types/cargo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarcodeScanner } from './BarcodeScanner';

interface VerificationModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (code: string, quantity: number) => void;
}

export function VerificationModal({
  product,
  isOpen,
  onClose,
  onConfirm,
}: VerificationModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [showCodeError, setShowCodeError] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setManualCode('');
      setQuantity('');
      setIsCodeValid(product?.hasBarcode === false);
      setShowCodeError(false);
      setIsScannerActive(false);
      setShowManualInput(false);
    }
  }, [isOpen, product]);

  if (!product) return null;

  const validateCode = (code: string) => {
    const isValid = code === product?.code || code === product?.barcode;

    if (code.length > 0) {
      if (isValid) {
        playFeedback('success');
      } else if (!isValid && isScannerActive) {
        playFeedback('error');
      }
    }

    setIsCodeValid(isValid);
    setShowCodeError(!isValid && code.length > 0);
    return isValid;
  };

  const handleScan = (scannedCode: string) => {
    const cleanedCode = scannedCode.trim();
    setManualCode(cleanedCode);
    validateCode(cleanedCode);
  };

  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualCode(value);
    if (value.length > 0) {
      validateCode(value);
    } else {
      setShowCodeError(false);
      setIsCodeValid(false);
    }
  };

  const handleConfirm = () => {
    // Trocamos parseInt por Number para aceitar casas decimais
    const qty = Number(quantity);
    if (isCodeValid && !isNaN(qty) && qty >= 0) {
      onConfirm(product.code, qty);
      onClose();
    }
  };

  const qtyValue = quantity !== '' ? Number(quantity) : null;
  const quantityMatch = qtyValue !== null && qtyValue === product.totalQuantity;
  const quantityMismatchLess = qtyValue !== null && qtyValue >= 0 && qtyValue < product.totalQuantity;
  const quantityMismatchMore = qtyValue !== null && qtyValue > product.totalQuantity;

  const quantityMismatch = quantityMismatchLess || quantityMismatchMore;

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
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85dvh] sm:max-h-[95vh] flex flex-col relative overflow-hidden"
          >
            {/* Header (Fixo no topo) */}
            <div className="z-20 bg-card p-4 border-b flex items-center justify-between shrink-0 shadow-sm">
              <h2 className="text-lg font-bold">Conferir Produto</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content (Área Rolável) */}
            <div className="p-4 space-y-6 overflow-y-auto flex-1 pb-8">
              {/* Product Info */}
              <div className="bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Código</span>
                  <span className="font-mono font-bold text-lg">#{product.code}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Descrição</span>
                  <span className="text-right text-sm font-medium max-w-[60%]">
                    {product.description}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Qtd. Esperada</span>
                  <span className="font-bold text-lg text-primary">
                    {product.totalQuantity} un.
                  </span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">Código de barras: </span>
                  <span className="font-mono text-xs">{product.barcode}</span>
                </div>
              </div>

              {/* Code Verification */}
              {!isCodeValid && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-center text-muted-foreground">
                    Verifique o produto escaneando ou digitando o código
                  </p>

                  <BarcodeScanner
                    onScan={handleScan}
                    isActive={isScannerActive}
                    onToggle={() => setIsScannerActive(!isScannerActive)}
                  />

                  {showCodeError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-destructive/10 p-3 rounded-md space-y-2 border border-destructive/20 my-4"
                    >
                      <p className="text-sm font-semibold text-destructive flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        Código incorreto
                      </p>
                      <div className="text-xs text-center space-y-1">
                        <p className="text-muted-foreground">
                          Lido: <span className="font-mono font-bold text-foreground text-sm">{manualCode}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Esperado: <span className="font-mono font-bold text-foreground">{product.barcode || 'Sem EAN'}</span> ou <span className="font-mono">{product.code}</span>
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
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowManualInput(true)}
                    >
                      <Keyboard className="w-4 h-4 mr-2" />
                      Digitar código manualmente
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Digite o código do produto ou código de barras"
                        value={manualCode}
                        onChange={handleManualCodeChange}
                        className={
                          showCodeError
                            ? 'border-destructive focus:ring-destructive'
                            : ''
                        }
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Code Valid - Quantity Input */}
              {isCodeValid && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 p-3 bg-success-light rounded-lg">
                    <Check className="w-5 h-5 text-success" />
                    <span className="text-sm font-medium text-success">
                      {product?.hasBarcode === false
                        ? 'Produto não exige validação de código. Insira a quantidade.'
                        : 'Código verificado!'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Quantidade conferida
                    </label>
                    <Input
                      type="number"
                      inputMode="decimal" // <--- Mudamos para decimal para mostrar vírgula no celular
                      step="any"          // <--- Permite números quebrados no HTML nativo
                      placeholder="Digite a quantidade"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          // Trocamos parseInt por Number
                          if (quantity !== '' && Number(quantity) >= 0) {
                            handleConfirm();
                          }
                        }
                      }}
                      className={`text-center text-2xl font-bold h-16 shadow-inner ${quantityMatch
                        ? 'border-success bg-success-light'
                        : quantityMismatch
                          ? 'border-warning bg-warning-light'
                          : ''
                        }`}
                      autoFocus
                    />
                    {quantityMatch && (
                      <p className="text-sm text-success flex items-center gap-1 justify-center">
                        <Check className="w-4 h-4" />
                        Quantidade correta!
                      </p>
                    )}
                    {quantityMismatchLess && (
                      <p className="text-sm text-warning flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        Quantidade menor que o esperado ({product.totalQuantity} un.)
                      </p>
                    )}
                    {quantityMismatchMore && (
                      <p className="text-sm text-warning flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        Quantidade maior que o esperado ({product.totalQuantity} un.)
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer Fixo (Botão de Confirmar) */}
            {isCodeValid && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-20 p-4 bg-card border-t shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] shrink-0"
              >
                <Button
                  onClick={handleConfirm}
                  // Trocamos parseInt por Number aqui também
                  disabled={quantity === '' || Number(quantity) < 0}
                  className="w-full h-14 text-lg font-bold shadow-md"
                >
                  Confirmar Conferência
                </Button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}