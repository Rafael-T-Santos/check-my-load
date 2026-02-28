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
    setManualCode(scannedCode);
    validateCode(scannedCode);
  };

  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setManualCode(value);
    if (value.length > 2) {
      validateCode(value);
    } else {
      setShowCodeError(false);
      setIsCodeValid(false);
    }
  };

  const handleConfirm = () => {
    const qty = parseInt(quantity);
    if (isCodeValid && !isNaN(qty) && qty >= 0) {
      onConfirm(product.code, qty);
      onClose();
    }
  };

  const quantityMatch = quantity !== '' && parseInt(quantity) === product.totalQuantity;
  const quantityMismatch = quantity !== '' && parseInt(quantity) !== product.totalQuantity;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Conferir Produto</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6">
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

                  <div className="relative">
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
                      {showCodeError && (
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          Código não corresponde ao produto
                        </p>
                      )}
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
                      inputMode="numeric"
                      placeholder="Digite a quantidade"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className={`text-center text-2xl font-bold h-16 ${quantityMatch
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
                    {quantityMismatch && (
                      <p className="text-sm text-warning flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        Quantidade diferente do esperado ({product.totalQuantity} un.)
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={handleConfirm}
                    disabled={quantity === '' || parseInt(quantity) < 0}
                    className="w-full h-12 text-lg"
                  >
                    Confirmar Conferência
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
