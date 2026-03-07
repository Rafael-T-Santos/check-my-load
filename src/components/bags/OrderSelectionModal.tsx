import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ShoppingBag, ChevronRight, User, Check } from 'lucide-react'; // Adicionado User e Check
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge'; // Adicionado import do Badge
import { Product, OrderInfo } from '@/types/cargo'; // Adicionado import do OrderInfo

interface OrderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderInfo[]; // Usando a tipagem correta que já tem o customerName
  products: Product[];
  getOrderAvailability: (orderId: string) => { hasAvailable: boolean; allInBags: boolean };
  onSelectOrders: (orderIds: string[]) => void;
}

export function OrderSelectionModal({
  isOpen,
  onClose,
  orders,
  products,
  getOrderAvailability,
  onSelectOrders,
}: OrderSelectionModalProps) {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleProceed = () => {
    if (selectedOrders.length > 0) {
      onSelectOrders(selectedOrders);
    }
  };

  // 1. Agrupamos os pedidos pelo nome do cliente
  const ordersByCustomer = orders.reduce((acc, order) => {
    const name = order.customerName || 'CLIENTE NÃO INFORMADO';
    if (!acc[name]) {
      acc[name] = [];
    }
    acc[name].push(order);
    return acc;
  }, {} as Record<string, typeof orders>);

  // 2. Validação para avançar
  const canProceed = selectedOrders.length > 0;

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
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Selecionar Pedidos</h2>
              <p className="text-sm text-muted-foreground">
                Escolha os pedidos para a sacola
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

        {/* Order List - Adicionado flex-1 e overflow-y-auto para poder rolar a tela */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(ordersByCustomer).map(([customerName, customerOrders]) => (
            <div key={customerName} className="space-y-3">
              
              {/* Cabeçalho do Cliente (Parceiro) */}
              <div className="bg-muted p-3 rounded-lg border border-border/50 flex items-center gap-2">
                <User className="w-5 h-5 text-muted-foreground shrink-0" />
                <h3 className="font-bold text-sm text-foreground uppercase tracking-wider truncate">
                  {customerName}
                </h3>
                <Badge variant="secondary" className="ml-auto shrink-0">
                  {customerOrders.length} pedido(s)
                </Badge>
              </div>
              
              {/* Pedidos deste Cliente */}
              <div className="space-y-2 pl-1">
                {customerOrders.map(order => {
                  const availability = getOrderAvailability(order.orderId);
                  const isSelected = selectedOrders.includes(order.orderId);
                  
                  // Status visual do pedido
                  const isFullyBagged = availability.allInBags;
                  const hasItemsAvailable = availability.hasAvailable;

                  return (
                    <div
                      key={order.orderId}
                      onClick={() => {
                        if (hasItemsAvailable) {
                          handleToggleOrder(order.orderId); // Corrigido aqui
                        }
                      }}
                      className={`
                        p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4
                        ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'}
                        ${!hasItemsAvailable ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:border-primary/50'}
                      `}
                    >
                      {/* Checkbox visual */}
                      <div className={`
                        w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0
                        ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}
                        ${!hasItemsAvailable ? 'bg-muted border-muted-foreground/30' : ''}
                      `}>
                        {isSelected && <Check className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-lg truncate">#{order.orderId}</p>
                          {isFullyBagged && (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 shrink-0">
                              100% na Sacola
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {order.products.length} produto(s) vinculado(s)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              {selectedOrders.length} pedido(s) selecionado(s)
            </span>
          </div>
          <Button
            onClick={handleProceed}
            disabled={!canProceed}
            className="w-full h-12"
          >
            Selecionar Produtos
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}