import { motion } from 'framer-motion';
import { Package, Check, AlertTriangle, Camera } from 'lucide-react';
import { Product, ProductStatus } from '@/types/cargo';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onCameraClick: () => void;
  photoCount: number;
  index: number;
}

function getProductStatus(product: Product): ProductStatus {
  if (!product.isChecked) return 'unchecked';
  if (product.checkedQuantity === product.totalQuantity) return 'success';
  return 'warning';
}

export function ProductCard({ product, onClick, onCameraClick, photoCount, index }: ProductCardProps) {
  const status = getProductStatus(product);

  const statusConfig = {
    unchecked: {
      bg: 'bg-card border-border',
      icon: Package,
      iconClass: 'text-muted-foreground',
      badge: 'bg-unchecked text-unchecked-foreground',
    },
    success: {
      bg: 'bg-success-light border-success/30',
      icon: Check,
      iconClass: 'text-success',
      badge: 'bg-success text-success-foreground',
    },
    warning: {
      bg: 'bg-warning-light border-warning/30',
      icon: AlertTriangle,
      iconClass: 'text-warning',
      badge: 'bg-warning text-warning-foreground',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="relative"
    >
      <button
        onClick={onClick}
        className={cn(
          'w-full p-4 rounded-xl border-2 text-left transition-all',
          config.bg,
          'active:scale-[0.98] hover:shadow-md'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              status === 'unchecked' && 'bg-muted',
              status === 'success' && 'bg-success/20',
              status === 'warning' && 'bg-warning/20'
            )}
          >
            <StatusIcon className={cn('w-5 h-5', config.iconClass)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-bold text-lg text-foreground">
                #{product.code}
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-sm font-semibold pr-9',
                  config.badge
                )}
              >
                {product.isChecked
                  ? `${product.checkedQuantity}/${product.totalQuantity}`
                  : `${product.totalQuantity} un.`}
              </span>
            </div>

            <p className="text-sm text-muted-foreground mt-1">
              {product.description}
            </p>

            {/* Order badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {product.orders.map((order) => (
                <span
                  key={order.orderId}
                  className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium"
                >
                  {order.orderId}: {order.quantity}un
                </span>
              ))}
            </div>
          </div>
        </div>
      </button>

      {/* Camera button — fora do botão principal para evitar aninhamento */}
      <button
        onClick={(e) => { e.stopPropagation(); onCameraClick(); }}
        className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-lg bg-background/80 hover:bg-muted border border-border/60 transition-colors"
        title="Fotos do produto"
      >
        <Camera className="w-4 h-4 text-muted-foreground" />
        {photoCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {photoCount}
          </span>
        )}
      </button>
    </motion.div>
  );
}
