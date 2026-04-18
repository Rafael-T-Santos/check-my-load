import { useState, useRef, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Camera, Check, Trash2, QrCode, Keyboard, Package, ShoppingBag, Maximize2, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PhotoRecord, BagProduct } from '@/types/cargo';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { BagLabel, type ClienteData } from './BagLabel';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

interface BagRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  selectedProducts: BagProduct[];
  selectedOrders: string[];
  isBagCodeUsed: (code: string) => boolean;
  onConfirmBag: (bagCode: string, photos: PhotoRecord[]) => void;
}

export function BagRegistrationModal({
  isOpen,
  onClose,
  onBack,
  selectedProducts,
  selectedOrders,
  isBagCodeUsed,
  onConfirmBag,
}: BagRegistrationModalProps) {
  const [bagCode, setBagCode] = useState('');
  const [codeValidated, setCodeValidated] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPrintLoading, setIsPrintLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePrintLabel = async () => {
    if (!selectedOrders.length) return;

    // Abre a janela antes do fetch para evitar bloqueio de popup
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Popup bloqueado. Permita popups neste navegador para imprimir.');
      return;
    }
    win.document.write('<html><body style="font-family:Arial;padding:8px">Gerando etiqueta...</body></html>');

    setIsPrintLoading(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/sacolas/etiqueta-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido: selectedOrders[0] }),
      });
      if (!res.ok) throw new Error();
      const cliente: ClienteData = await res.json();

      const timestamp = Date.now().toString();
      setBagCode(timestamp);

      // Renderiza o componente numa div oculta para capturar o SVG do QR code
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);
      const root = createRoot(container);
      root.render(
        <BagLabel cliente={cliente} pedidos={selectedOrders} timestamp={timestamp} />
      );

      // Aguarda o React renderizar o SVG do QR code
      setTimeout(() => {
        const labelHtml = container.innerHTML;
        root.unmount();
        document.body.removeChild(container);

        win.document.open();
        win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Etiqueta ${timestamp}</title>
  <style>
    @page { size: 100mm 48mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #e5e7eb;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 24px;
      font-family: Arial, sans-serif;
    }
    #label-preview {
      background: #fff;
      border: 1px solid #d1d5db;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    #print-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 14px 40px;
      font-size: 17px;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      letter-spacing: 0.3px;
    }
    #print-btn:active { background: #1d4ed8; }
    @media print {
      body { background: #fff; padding: 0; min-height: unset; justify-content: flex-start; gap: 0; }
      #label-preview { border: none; box-shadow: none; }
      #print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div id="label-preview">${labelHtml}</div>
  <button id="print-btn" onclick="window.print()">Imprimir</button>
</body>
</html>`);
        win.document.close();
        win.focus();
      }, 300);

      toast.success('Etiqueta enviada para impressão!', {
        description: `Código: ${timestamp}`,
      });
    } catch {
      win.close();
      toast.error('Erro ao gerar etiqueta. Verifique a conexão com o ERP.');
    } finally {
      setIsPrintLoading(false);
    }
  };

  const validateBagCode = (code: string): boolean => {
    if (!code.trim()) {
      setCodeError('Digite ou escaneie o código da sacola');
      return false;
    }
    if (isBagCodeUsed(code)) {
      setCodeError('Este código já foi usado em outra sacola');
      return false;
    }
    setCodeError(null);
    return true;
  };

  const handleCodeSubmit = () => {
    if (validateBagCode(bagCode)) {
      setCodeValidated(true);
      toast.success('Código validado!');
    }
  };

  const handleScan = (code: string) => {
    setBagCode(code);
    if (validateBagCode(code)) {
      setCodeValidated(true);
      toast.success('Código escaneado e validado!');
    }
    setIsScannerActive(false);
  };

  const handlePhotoCapture = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCapturing(true);
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPhoto: PhotoRecord = {
          id: `bag-photo-${Date.now()}`,
          imageData: reader.result as string,
          observation: '',
          capturedAt: new Date().toISOString(),
        };
        setPhotos(prev => [...prev, newPhoto]);
        toast.success(`Foto ${photos.length + 1} capturada!`);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      toast.error('Erro ao capturar foto');
    } finally {
      setIsCapturing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    toast.info('Foto removida');
  };

  const handleUpdateObservation = (photoId: string, observation: string) => {
    setPhotos(prev =>
      prev.map(p => (p.id === photoId ? { ...p, observation } : p))
    );
  };

  const handleConfirm = () => {
    if (photos.length >= 2) {
      onConfirmBag(bagCode, photos);
    }
  };

  const totalProducts = selectedProducts.length;
  const totalQuantity = selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
  const canFinalize = codeValidated && photos.length >= 2;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold">Registrar Sacola</h2>
                <p className="text-sm text-muted-foreground">
                  {totalProducts} produtos • {totalQuantity} unidades
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Bag Code Section */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                Código da Sacola
                {codeValidated && <Check className="w-4 h-4 text-success" />}
              </h3>
              
              {/* Print label button — always visible before code validation */}
              <Button
                variant="outline"
                onClick={handlePrintLabel}
                disabled={isPrintLoading}
                className="w-full"
              >
                {isPrintLoading ? (
                  <span className="animate-pulse">Gerando etiqueta...</span>
                ) : (
                  <>
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir Etiqueta
                  </>
                )}
              </Button>

              {!codeValidated ? (
                <>
                  <BarcodeScanner
                    onScan={handleScan}
                    isActive={isScannerActive}
                    onToggle={() => setIsScannerActive(!isScannerActive)}
                  />
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">ou digite</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={bagCode}
                      onChange={(e) => setBagCode(e.target.value)}
                      placeholder="Digite o código da sacola"
                      className="flex-1"
                    />
                    <Button onClick={handleCodeSubmit} disabled={!bagCode.trim()}>
                      <Keyboard className="w-4 h-4 mr-2" />
                      Validar
                    </Button>
                  </div>

                  {codeError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {codeError}
                    </p>
                  )}
                </>
              ) : (
                <div className="p-3 bg-success/10 border border-success/30 rounded-lg flex items-center gap-3">
                  <Check className="w-5 h-5 text-success" />
                  <div>
                    <p className="font-medium text-success">Código validado</p>
                    <p className="text-sm text-muted-foreground">{bagCode}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Photos Section */}
            {codeValidated && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" />
                    Fotos da Sacola
                  </h3>
                  <span className={`text-sm font-medium ${photos.length >= 2 ? 'text-success' : 'text-warning'}`}>
                    {photos.length}/5 (mín. 2)
                  </span>
                </div>

                {/* Capture Button */}
                {photos.length < 5 && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isCapturing}
                      variant="outline"
                      className="w-full h-14"
                    >
                      {isCapturing ? (
                        <span className="animate-pulse">Processando...</span>
                      ) : (
                        <>
                          <Camera className="w-5 h-5 mr-2" />
                          Tirar Foto {photos.length + 1}/5
                        </>
                      )}
                    </Button>
                  </>
                )}

                {/* Photo Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((photo, index) => (
                    <motion.div
                      key={photo.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative bg-muted rounded-lg overflow-hidden"
                    >
                      <img
                        src={photo.imageData}
                        alt={`Foto ${index + 1}`}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                        Foto {index + 1}
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={() => setFullscreenPhoto(photo.imageData)}
                          className="p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="p-1.5 bg-destructive/80 rounded-lg text-white hover:bg-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-2">
                        <Textarea
                          value={photo.observation}
                          onChange={(e) => handleUpdateObservation(photo.id, e.target.value)}
                          placeholder="Observação..."
                          className="text-xs h-16 resize-none"
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Resumo da Sacola
              </h3>
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pedidos:</span>
                  <span className="font-medium">{selectedOrders.join(', ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Produtos:</span>
                  <span className="font-medium">{totalProducts}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total unidades:</span>
                  <span className="font-medium">{totalQuantity}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  {selectedProducts.slice(0, 3).map(p => (
                    <div key={p.code} className="flex justify-between text-xs text-muted-foreground">
                      <span>#{p.code}</span>
                      <span>{p.quantity} un.</span>
                    </div>
                  ))}
                  {selectedProducts.length > 3 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +{selectedProducts.length - 3} mais...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/30">
            <Button
              onClick={handleConfirm}
              disabled={!canFinalize}
              className="w-full h-14 text-lg"
            >
              {!codeValidated ? (
                'Primeiro valide o código'
              ) : photos.length < 2 ? (
                `Falta ${2 - photos.length} foto(s)`
              ) : (
                <>
                  <ShoppingBag className="w-5 h-5 mr-2" />
                  Salvar Sacola
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>

      {/* Fullscreen Photo */}
      <AnimatePresence>
        {fullscreenPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
            onClick={() => setFullscreenPhoto(null)}
          >
            <button
              onClick={() => setFullscreenPhoto(null)}
              className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={fullscreenPhoto}
              alt="Foto ampliada"
              className="max-w-full max-h-full object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
