import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ItemEntrada } from '@/types/entrada';

export interface FotoEntrada {
  id: string;
  imageData: string;
  observation: string;
  capturedAt: string;
}

interface EntradaFotoModalProps {
  item: ItemEntrada | null;
  isOpen: boolean;
  onClose: () => void;
  onAddPhoto: (itemId: number, imageData: string, observation: string) => Promise<void>;
  onLoadPhotos: (itemId: number) => Promise<FotoEntrada[]>;
}

/** Mesmo tratamento das fotos de carga: reduz antes de virar base64. */
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

/**
 * Fotos de um item da entrada.
 *
 * É a prova de uma avaria ou de uma embalagem violada, e o que o
 * administrativo olha antes de liberar uma divergência — por isso as fotos
 * ficam presas ao item, não à conferência inteira.
 */
export function EntradaFotoModal({
  item, isOpen, onClose, onAddPhoto, onLoadPhotos,
}: EntradaFotoModalProps) {
  const [fotos, setFotos]         = useState<FotoEntrada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [capturada, setCapturada] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Depende do id, não do objeto: gravar uma foto atualiza o contador do item
  // na lista e recriaria `item`, disparando um recarregamento em cadeia que
  // ainda por cima limparia a foto em pré-visualização.
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!isOpen || itemId === null) return;
    setCapturada(null);
    setObservacao('');
    setCarregando(true);
    onLoadPhotos(itemId)
      .then(setFotos)
      .catch(() => setFotos([]))
      .finally(() => setCarregando(false));
  }, [isOpen, itemId, onLoadPhotos]);

  if (!item) return null;

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      setCapturada(await compressImage(reader.result as string));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!capturada) return;
    setSalvando(true);
    try {
      await onAddPhoto(item.id, capturada, observacao);
      setFotos(await onLoadPhotos(item.id));
      setCapturada(null);
      setObservacao('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden"
          >
            <div className="bg-card p-4 border-b flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">Fotos do Item</h2>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  #{item.codprod} · {item.descrprod}
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
              />

              {capturada ? (
                <div className="space-y-3">
                  <img src={capturada} alt="Foto capturada" className="w-full rounded-xl object-cover max-h-64" />
                  <Textarea
                    placeholder="O que a foto mostra? (opcional)"
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setCapturada(null)}>
                      Cancelar
                    </Button>
                    <Button className="flex-1" onClick={handleSave} disabled={salvando}>
                      {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Salvar foto
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button className="w-full h-14 text-base" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-5 h-5 mr-2" />
                    Tirar foto
                  </Button>

                  {carregando ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : fotos.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                      <ImageIcon className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Nenhuma foto registrada para este item</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {fotos.length} foto(s) registrada(s)
                      </p>
                      {fotos.map(foto => (
                        <div key={foto.id} className="border rounded-xl overflow-hidden">
                          <img src={foto.imageData} alt="Foto do item" className="w-full h-52 object-cover" />
                          {foto.observation && (
                            <p className="text-xs text-muted-foreground p-3 border-t">{foto.observation}</p>
                          )}
                          <p className="text-[10px] text-right text-muted-foreground px-3 pb-2">
                            {new Date(foto.capturedAt).toLocaleString('pt-BR')}
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
