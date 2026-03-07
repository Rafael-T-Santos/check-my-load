import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Truck, CheckCircle, Package, ArrowRight, Camera, AlertTriangle, ShoppingBag, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Product, BrandStatus, Bag, OrderInfo } from '@/types/cargo';
import { BagCreationFlow } from './bags/BagCreationFlow';
import { BagListModal } from './bags/BagListModal';

interface BrandSelectionProps {
  cargoId: string;
  licensePlate: string;
  brandStatuses: BrandStatus[];
  selectedBrands: string[];
  products: Product[];
  onToggleBrand: (brand: string) => void;
  onStartVerification: () => void;
  onProceedToPhotos: () => void;
  onBack: () => void;
  onSave: () => void;
  allComplete: boolean;

  bags: Bag[];
  onAddBag: (bag: Bag) => void;
  onRemoveBag: (bagId: string) => void;
  getOrderAvailability: (orderId: string) => { hasAvailable: boolean; allInBags: boolean };
  getProductAvailability: (code: string) => { total: number; inBags: number; available: number };
  getOrdersForCargo: () => OrderInfo[];
  isBagCodeUsed: (code: string) => boolean;
}

function getBrandWarnings(products: Product[], brand: string): number {
  return products.filter(
    p => p.brand === brand && p.isChecked && p.checkedQuantity !== p.totalQuantity
  ).length;
}

function getBrandPending(products: Product[], brand: string): number {
  return products.filter(p => p.brand === brand && !p.isChecked).length;
}

export function BrandSelection({
  cargoId,
  licensePlate,
  brandStatuses,
  selectedBrands,
  products,
  onToggleBrand,
  onStartVerification,
  onProceedToPhotos,
  onBack,
  onSave,
  allComplete,
  bags,
  onAddBag,
  onRemoveBag,
  getOrderAvailability,
  getProductAvailability,
  getOrdersForCargo,
  isBagCodeUsed,
}: BrandSelectionProps) {
  // === ESTADOS DAS SACOLAS ===
  const [isBagFlowOpen, setIsBagFlowOpen] = useState(false);
  const [isBagListOpen, setIsBagListOpen] = useState(false);

  const totalProducts = brandStatuses.reduce((sum, b) => sum + b.total, 0);
  const totalChecked = brandStatuses.reduce((sum, b) => sum + b.checked, 0);
  const overallProgress = totalProducts > 0 ? (totalChecked / totalProducts) * 100 : 0;

  // Verifica se existe pelo menos um produto conferido (maior que zero) na carga inteira
  const hasCheckedProducts = products.some(p => p.isChecked && p.checkedQuantity !== null && p.checkedQuantity > 0);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
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
            <h1 className="font-bold text-lg">Carga #{cargoId}</h1>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Truck className="w-3.5 h-3.5" />
              <span>{licensePlate}</span>
            </div>
          </div>
          <button
            onClick={onSave}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-primary"
          >
            <Save className="w-5 h-5" />
          </button>
        </div>

        {/* Overall Progress */}
        <div className="px-4 pb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progresso geral</span>
            <span>{totalChecked}/{totalProducts} itens</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        
        {/* === BOTÕES DE SACOLA AQUI === */}
        {hasCheckedProducts && (
          <div className="flex gap-3 mb-2">
            <Button
              onClick={() => setIsBagFlowOpen(true)}
              variant="outline"
              className="flex-1 h-12 border-primary/50 text-primary hover:bg-primary/5"
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              Criar Sacola
            </Button>
            {bags.length > 0 && (
              <Button
                onClick={() => setIsBagListOpen(true)}
                variant="outline"
                className="h-12"
              >
                <Eye className="w-5 h-5 mr-2" />
                Ver ({bags.length})
              </Button>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground mb-2">
          Selecione as marcas que deseja conferir:
        </p>

        {/* Lista de Marcas */}
        <div className="space-y-3">
          {brandStatuses.map((status, index) => {
            const isSelected = selectedBrands.includes(status.brand);
            const progress = status.total > 0 ? (status.checked / status.total) * 100 : 0;
            const warnings = getBrandWarnings(products, status.brand);
            const pending = getBrandPending(products, status.brand);
            const hasWarnings = warnings > 0;
            const isComplete = status.isComplete;

            // Determine card status style
            let borderClass = 'border-border bg-card hover:border-primary/40';
            if (isComplete) {
              borderClass = 'border-success/40 bg-success-light';
            } else if (hasWarnings) {
              borderClass = 'border-warning/40 bg-warning-light';
            } else if (isSelected) {
              borderClass = 'border-primary bg-accent';
            }

            return (
              <motion.button
                key={status.brand}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onToggleBrand(status.brand)}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${borderClass}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {isComplete ? (
                      <CheckCircle className="w-6 h-6 text-success" />
                    ) : hasWarnings ? (
                      <AlertTriangle className="w-6 h-6 text-warning" />
                    ) : (
                      <Package className="w-6 h-6 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-semibold text-base">{status.brand}</p>
                      <p className="text-xs text-muted-foreground">
                        {status.checked}/{status.total} produtos conferidos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isComplete && (
                      <Badge className="bg-success/15 text-success border-success/30 text-xs">
                        Concluído
                      </Badge>
                    )}
                    {hasWarnings && (
                      <Badge className="bg-warning/15 text-warning-foreground border-warning/30 text-xs">
                        {warnings} divergência{warnings > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {!isComplete && !hasWarnings && pending > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {pending} restante{pending > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {isSelected && !isComplete && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                        Selecionada
                      </span>
                    )}
                  </div>
                </div>
                <Progress value={progress} className="h-1.5" />
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 p-4 bg-card border-t shadow-lg space-y-3 z-40">
        {selectedBrands.length > 0 && (
          <Button
            onClick={onStartVerification}
            className="w-full h-14 text-lg font-semibold"
          >
            Iniciar Conferência
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        )}
        {allComplete && (
          <Button
            onClick={onProceedToPhotos}
            variant={selectedBrands.length > 0 ? 'outline' : 'default'}
            className="w-full h-14 text-lg font-semibold"
          >
            <Camera className="w-5 h-5 mr-2" />
            Finalizar Carga
          </Button>
        )}
        {!allComplete && selectedBrands.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-3">
            Selecione pelo menos uma marca para conferir
          </p>
        )}
      </div>

      {/* === MODAIS DE SACOLA AQUI === */}
      <BagCreationFlow
        isOpen={isBagFlowOpen}
        onClose={() => setIsBagFlowOpen(false)}
        orders={getOrdersForCargo()}
        products={products}
        bags={bags}
        getOrderAvailability={getOrderAvailability}
        getProductAvailability={getProductAvailability}
        isBagCodeUsed={isBagCodeUsed}
        onCreateBag={(bag) => {
          onAddBag(bag);
          setIsBagFlowOpen(false); // Fecha o modal após criar
        }}
      />

      <BagListModal
        isOpen={isBagListOpen}
        onClose={() => setIsBagListOpen(false)}
        bags={bags}
        onRemoveBag={onRemoveBag}
      />
      
    </div>
  );
}