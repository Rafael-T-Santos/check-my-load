import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, ImageIcon } from 'lucide-react';
import { Product, PhotoRecord } from '@/types/cargo';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ProductPhotoModalProps {
  product: Product;
  isOpen: boolean;
  photos: PhotoRecord[];
  onClose: () => void;
  onAddPhoto: (imageData: string, observation: string) => Promise<void>;
}

function compressImage(dataUrl: string, maxWidth = 1280, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

export function ProductPhotoModal({ product, isOpen, photos, onClose, onAddPhoto }: ProductPhotoModalProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [observation, setObservation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result as string);
      setCapturedImage(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!capturedImage) return;
    setIsSaving(true);
    try {
      await onAddPhoto(capturedImage, observation);
      setCapturedImage(null);
      setObservation('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setCapturedImage(null);
    setObservation('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-card p-4 border-b flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold">Fotos do Produto</h2>
                <p className="text-xs text-muted-foreground font-mono">#{product.code} · {product.description}</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
              />

              {capturedImage ? (
                /* Preview da foto capturada */
                <div className="space-y-3">
                  <img
                    src={capturedImage}
                    alt="Foto capturada"
                    className="w-full rounded-xl object-cover max-h-64"
                  />
                  <Textarea
                    placeholder="Observação (opcional)..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleCancel}>
                      Cancelar
                    </Button>
                    <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? 'Salvando...' : 'Salvar foto'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    className="w-full h-14 text-base"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Tirar foto
                  </Button>

                  {photos.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                      <ImageIcon className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhuma foto registrada para este produto</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {photos.length} foto(s) registrada(s)
                      </p>
                      {photos.map((photo) => (
                        <div key={photo.id} className="border rounded-xl overflow-hidden">
                          <img
                            src={photo.imageData}
                            alt="Foto do produto"
                            className="w-full h-52 object-cover"
                          />
                          {photo.observation && (
                            <p className="text-xs text-muted-foreground p-3 border-t">{photo.observation}</p>
                          )}
                          <p className="text-[10px] text-right text-muted-foreground px-3 pb-2">
                            {new Date(photo.capturedAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
