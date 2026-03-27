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
  dock?: string | null;
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
  dock,
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
  const [isBagFlowOpen, setIsBagFlowOpen] = useState(false);
  const [isBagListOpen, setIsBagListOpen] = useState(false);

  const totalProducts = brandStatuses.reduce((sum, b) => sum + b.total, 0);
  const totalChecked = brandStatuses.reduce((sum, b) => sum + b.checked, 0);
  const overallProgress = totalProducts > 0 ? (totalChecked / totalProducts) * 100 : 0;

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
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" />
                <span>{licensePlate}</span>
              </div>
              
              {/* === NOVA EXIBIÇÃO DA DOCA === */}
              {dock !== undefined && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">Doca:</span>
                    <span>{dock || '-'}</span> 
                  </div>
                </>
              )}
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

            // === NOVA LÓGICA DE ESTILOS ===
            let bgClass = 'bg-card';
            let borderClass = 'border-border hover:border-primary/40';

            // Define o fundo e a borda base dependendo do status
            if (isComplete) {
              bgClass = 'bg-success-light';
              borderClass = 'border-success/40';
            } else if (hasWarnings) {
              bgClass = 'bg-warning-light';
              borderClass = 'border-warning/40';
            }

            // Se estiver selecionado, sobrepõe a borda para azul
            if (isSelected) {
              borderClass = 'border-primary ring-1 ring-primary';
              // Se não tiver status especial (verde/amarelo), usa o fundo azuladinho
              if (!isComplete && !hasWarnings) {
                bgClass = 'bg-accent';
              }
            }

            const cardClasses = `${bgClass} ${borderClass}`;

            return (
              <motion.button
                key={status.brand}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onToggleBrand(status.brand)}
                className={`w-full text-left rounded-xl border-2 p-4 transition-all ${cardClasses}`}
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
                  
                  {/* === TAGS === */}
                  <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    
                    {/* Agora a tag 'Selecionada' aparece SEMPRE que a marca for clicada */}
                    {isSelected && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full whitespace-nowrap">
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
          setIsBagFlowOpen(false);
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