import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, ChevronRight, ImageIcon } from 'lucide-react';
import { PhotoRecord, OrderInfo } from '@/types/cargo';
import { Badge } from '@/components/ui/badge';
import { OrderPhotoModal } from './OrderPhotoModal';

interface OrderPhotosListModalProps {
  isOpen: boolean;
  orders: OrderInfo[];
  photos: PhotoRecord[];
  onClose: () => void;
  onAddOrderPhoto: (imageData: string, observation: string, pedidoId: string) => Promise<void>;
}

export function OrderPhotosListModal({
  isOpen,
  orders,
  photos,
  onClose,
  onAddOrderPhoto,
}: OrderPhotosListModalProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const selectedOrder = orders.find(o => o.orderId === selectedOrderId);

  const getOrderPhotos = (orderId: string) =>
    photos.filter(p => p.pedidoId === orderId);

  const totalOrderPhotos = photos.filter(p => p.pedidoId).length;

  return (
    <>
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
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" />
                    Fotos de Pedidos
                  </h2>
                  {totalOrderPhotos > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {totalOrderPhotos} foto(s) registrada(s)
                    </p>
                  )}
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
                {orders.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <ImageIcon className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Nenhum pedido encontrado nesta carga</p>
                  </div>
                ) : (
                  orders.map((order) => {
                    const count = getOrderPhotos(order.orderId).length;
                    return (
                      <button
                        key={order.orderId}
                        onClick={() => setSelectedOrderId(order.orderId)}
                        className="w-full text-left flex items-center justify-between p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent transition-all"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold font-mono text-sm">#{order.orderId}</p>
                          <p className="text-xs text-muted-foreground truncate">{order.customerName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {count > 0 && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                              {count} foto{count !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedOrder && (
        <OrderPhotoModal
          orderId={selectedOrder.orderId}
          customerName={selectedOrder.customerName}
          isOpen={!!selectedOrderId}
          photos={getOrderPhotos(selectedOrder.orderId)}
          onClose={() => setSelectedOrderId(null)}
          onAddPhoto={(imageData, observation) =>
            onAddOrderPhoto(imageData, observation, selectedOrder.orderId)
          }
        />
      )}
    </>
  );
}
