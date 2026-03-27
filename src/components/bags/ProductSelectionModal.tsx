import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Package, ChevronRight, ChevronLeft, Minus, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Product, Bag } from '@/types/cargo';

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  selectedOrders: string[];
  products: Product[];
  bags: Bag[];
  getProductAvailability: (code: string) => { total: number; inBags: number; available: number };
  onConfirmProducts: (products: { code: string; description: string; quantity: number; ordersOrigin: string[] }[]) => void;
}

interface SelectedProduct {
  code: string;
  description: string;
  quantity: number;
  maxQuantity: number;
  ordersOrigin: string[];
}

export function ProductSelectionModal({
  isOpen,
  onClose,
  onBack,
  selectedOrders,
  products,
  bags,
  getProductAvailability,
  onConfirmProducts,
}: ProductSelectionModalProps) {
  const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct>>(new Map());

  // Get products from selected orders
  const orderProducts = products.filter(p =>
    p.orders.some(o => selectedOrders.includes(o.orderId))
  );

  useEffect(() => {
    // Inicializa com NENHUM produto selecionado (mapa vazio)
    setSelectedProducts(new Map());
  }, [selectedOrders, products]);

  if (!isOpen) return null;

  const handleToggleProduct = (product: Product) => {
    const availability = getProductAvailability(product.code);
    if (availability.available === 0) return;

    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      if (newMap.has(product.code)) {
        newMap.delete(product.code);
      } else {
        const ordersForProduct = product.orders
          .filter(o => selectedOrders.includes(o.orderId))
          .map(o => o.orderId);
        newMap.set(product.code, {
          code: product.code,
          description: product.description,
          quantity: availability.available,
          maxQuantity: availability.available,
          ordersOrigin: ordersForProduct,
        });
      }
      return newMap;
    });
  };

  const handleQuantityChange = (code: string, delta: number) => {
    setSelectedProducts(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(code);
      if (current) {
        const newQty = Math.max(1, Math.min(current.maxQuantity, current.quantity + delta));
        newMap.set(code, { ...current, quantity: newQty });
      }
      return newMap;
    });
  };

  const handleConfirm = () => {
    const productsArray = Array.from(selectedProducts.values()).map(p => ({
      code: p.code,
      description: p.description,
      quantity: p.quantity,
      ordersOrigin: p.ordersOrigin,
    }));
    onConfirmProducts(productsArray);
  };

  const getBagInfo = (productCode: string): string | null => {
    for (const bag of bags) {
      const bagProduct = bag.products.find(bp => bp.code === productCode);
      if (bagProduct) {
        return `Sacola ${bag.id.slice(0, 8)}`;
      }
    }
    return null;
  };

  const totalSelected = selectedProducts.size;
  const totalQuantity = Array.from(selectedProducts.values()).reduce((sum, p) => sum + p.quantity, 0);

  return (
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
        className="relative w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
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
              <h2 className="text-lg font-bold">Selecionar Produtos</h2>
              <p className="text-sm text-muted-foreground">
                Pedidos: {selectedOrders.join(', ')}
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

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {orderProducts.map((product) => {
            const availability = getProductAvailability(product.code);
            const isDisabled = availability.available === 0;
            const isSelected = selectedProducts.has(product.code);
            const selectedData = selectedProducts.get(product.code);
            const bagInfo = getBagInfo(product.code);

            return (
              <motion.div
                key={product.code}
                className={`
                  p-4 rounded-xl border-2 transition-all
                  ${isDisabled 
                    ? 'bg-muted/50 border-muted opacity-60' 
                    : isSelected 
                      ? 'bg-primary/5 border-primary' 
                      : 'bg-card border-border'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onClick={() => handleToggleProduct(product)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">#{product.code}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {product.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {availability.available > 0 ? (
                        <span className="bg-success/10 text-success px-2 py-1 rounded-full">
                          Disponível: {availability.available} un.
                        </span>
                      ) : (
                        <span className="bg-muted px-2 py-1 rounded-full line-through">
                          Indisponível
                        </span>
                      )}
                      {availability.inBags > 0 && bagInfo && (
                        <span className="bg-muted px-2 py-1 rounded-full">
                          {availability.inBags} un. em {bagInfo}
                        </span>
                      )}
                    </div>

                    {/* Quantity Control */}
                    {isSelected && selectedData && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">Qtd:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQuantityChange(product.code, -1)}
                            disabled={selectedData.quantity <= 1}
                            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-bold">
                            {selectedData.quantity}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(product.code, 1)}
                            disabled={selectedData.quantity >= selectedData.maxQuantity}
                            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          / {selectedData.maxQuantity}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">
                {totalSelected} produto(s) • {totalQuantity} unidades
              </span>
            </div>
          </div>
          <Button
            onClick={handleConfirm}
            disabled={totalSelected === 0}
            className="w-full h-12"
          >
            Confirmar Produtos
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
