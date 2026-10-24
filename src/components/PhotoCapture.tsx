import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Camera,
  Trash2,
  X,
  CheckCircle,
  Image,
  Loader2,
  ZoomIn,
} from 'lucide-react';
import { PhotoRecord } from '@/types/cargo';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { comprimirFoto } from '@/lib/fotos';

interface PhotoCaptureProps {
  cargoId: string;
  photos: PhotoRecord[];
  onBack: () => void;
  onAddPhoto: (imageData: string, observation?: string) => void;
  onUpdateObservation: (photoId: string, observation: string) => void;
  onRemovePhoto: (photoId: string) => void;
  onSave: () => void;
  onFinalize: () => void;
  canFinalize: boolean;
}

const REQUIRED_PHOTOS = 5;

export function PhotoCapture({
  cargoId,
  photos,
  onBack,
  onAddPhoto,
  onUpdateObservation,
  onRemovePhoto,
  onSave,
  onFinalize,
  canFinalize,
}: PhotoCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCapturing(true);

    try {
      onAddPhoto(await comprimirFoto(file));
      toast.success(`Foto ${photos.length + 1} capturada!`);
      setIsCapturing(false);
    } catch (error) {
      console.error('Compression error:', error);
      toast.error('Erro ao comprimir imagem');
      setIsCapturing(false);
    }

    // Reset input
    e.target.value = '';
  };

  const handleDelete = (photoId: string) => {
    onRemovePhoto(photoId);
    setDeleteConfirm(null);
    toast.success('Foto removida');
  };

  const handleSave = () => {
    onSave();
    toast.success('Progresso salvo!', {
      description: `${photos.length} fotos e observações salvas.`,
    });
  };

  const handleFinalize = () => {
    onFinalize();
  };

  const progressPercentage = (photos.length / REQUIRED_PHOTOS) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b shadow-sm">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="font-bold text-lg">Registro Fotográfico</h1>
            <p className="text-xs text-muted-foreground">
              Carga #{cargoId} • {photos.length}/{REQUIRED_PHOTOS} fotos
            </p>
          </div>
          <button
            onClick={handleSave}
            className="p-2 -mr-2 rounded-lg hover:bg-muted transition-colors text-primary"
          >
            <Save className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 bg-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            className={`h-full transition-colors ${
              photos.length >= REQUIRED_PHOTOS ? 'bg-success' : 'bg-primary'
            }`}
          />
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-2 py-3 bg-muted/50">
          <div className="flex items-center gap-1.5 text-success text-sm">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">Conferência</span>
          </div>
          <div className="w-8 h-0.5 bg-border" />
          <div className="flex items-center gap-1.5 text-primary text-sm">
            <Camera className="w-4 h-4" />
            <span className="font-medium">Fotos</span>
          </div>
          <div className="w-8 h-0.5 bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Concluir</span>
          </div>
        </div>
      </header>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* Capture Button */}
        {photos.length < REQUIRED_PHOTOS && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Button
              onClick={handleCaptureClick}
              disabled={isCapturing}
              className="w-full h-20 text-lg font-semibold"
              size="lg"
            >
              {isCapturing ? (
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
              ) : (
                <Camera className="w-6 h-6 mr-2" />
              )}
              {isCapturing
                ? 'Processando...'
                : `Tirar Foto ${photos.length + 1}/${REQUIRED_PHOTOS}`}
            </Button>
          </motion.div>
        )}

        {/* Photos Grid */}
        {photos.length > 0 ? (
          <div className="space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Fotos Capturadas
            </h2>
            
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {photos.map((photo, index) => (
                  <motion.div
                    key={photo.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-card rounded-xl border p-4 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <button
                        onClick={() => setPreviewPhoto(photo)}
                        className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 group"
                      >
                        <img
                          src={photo.imageData}
                          alt={`Foto ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                          <ZoomIn className="w-6 h-6 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            Foto {index + 1}
                          </span>
                          <button
                            onClick={() => setDeleteConfirm(photo.id)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(photo.capturedAt).toLocaleTimeString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    {/* Observation */}
                    <Textarea
                      placeholder="Adicionar observação (opcional)"
                      value={photo.observation}
                      onChange={(e) =>
                        onUpdateObservation(photo.id, e.target.value)
                      }
                      className="resize-none text-sm"
                      rows={2}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Image className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">Nenhuma foto ainda</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Tire {REQUIRED_PHOTOS} fotos dos produtos separados para finalizar
              a conferência
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 p-4 bg-card border-t shadow-lg">
        <Button
          onClick={handleFinalize}
          disabled={!canFinalize}
          className="w-full h-14 text-lg font-semibold"
        >
          {canFinalize ? (
            <>
              <CheckCircle className="w-5 h-5 mr-2" />
              Finalizar Conferência
            </>
          ) : (
            `Capturar mais ${REQUIRED_PHOTOS - photos.length} foto(s)`
          )}
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Você precisará tirar uma nova
              foto para substituir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo Preview Modal */}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/90 flex items-center justify-center p-4"
            onClick={() => setPreviewPhoto(null)}
          >
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-card/20 hover:bg-card/40 transition-colors"
            >
              <X className="w-6 h-6 text-primary-foreground" />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={previewPhoto.imageData}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
