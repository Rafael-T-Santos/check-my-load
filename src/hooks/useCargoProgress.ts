import { useState, useCallback, useEffect } from 'react';
import { Cargo, CargoProgress, Product, PhotoRecord, AppStep, Bag, BrandStatus } from '@/types/cargo';
import { mockCargos } from '@/data/mockCargos';

interface ApiCargoItem {
  codProd: number;
  descrProd: string;
  marca: string;
  numNota: number;
  ordemCarga: number;
  parceiroRazao: string;
  placa: string;
  qtdNeg: number;
  referencia: string;
  validaCodBarra: string;
}

function transformApiToCargo(apiData: ApiCargoItem[]): Cargo {
  const cargoId = apiData[0].ordemCarga.toString();
  const licensePlate = apiData[0].placa;
  const productMap = new Map<string, Product>();

  apiData.forEach(item => {
    const prodCode = item.codProd.toString();
    const orderId = item.numNota.toString();
    const quantity = item.qtdNeg;

    if (!productMap.has(prodCode)) {
      productMap.set(prodCode, {
        code: prodCode,
        barcode: item.referencia || '',
        description: item.descrProd,
        brand: item.marca || 'SEM MARCA',
        totalQuantity: 0,
        checkedQuantity: null,
        isChecked: false,
        hasBarcode: item.validaCodBarra === 'S', // Mapeia o "S" para true
        orders: []
      });
    }

    const product = productMap.get(prodCode)!;
    product.totalQuantity += quantity;

    const existingOrder = product.orders.find(o => o.orderId === orderId);
    if (existingOrder) {
      existingOrder.quantity += quantity;
    } else {
      product.orders.push({ orderId, quantity });
    }
  });

  return {
    id: cargoId,
    licensePlate: licensePlate,
    products: Array.from(productMap.values())
  };
}
// -----------------------------------------------


const STORAGE_KEY = 'cargo-progress';

export function useCargoProgress() {
  const [currentCargo, setCurrentCargo] = useState<Cargo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [bags, setBags] = useState<Bag[]>([]);
  const [currentStep, setCurrentStep] = useState<AppStep>('search');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const checkSavedProgress = useCallback((cargoId: string): boolean => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}-${cargoId}`);
      if (saved) {
        const progress: CargoProgress = JSON.parse(saved);
        return progress.currentStep !== 'completed';
      }
    } catch {
      // Ignore errors
    }
    return false;
  }, []);

  const loadProgress = useCallback((cargoId: string): CargoProgress | null => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}-${cargoId}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  const saveProgress = useCallback(() => {
    if (!currentCargo) return;
    
    const progress: CargoProgress = {
      cargoId: currentCargo.id,
      products: products.reduce((acc, p) => {
        acc[p.code] = {
          checkedQuantity: p.checkedQuantity,
          isChecked: p.isChecked,
        };
        return acc;
      }, {} as CargoProgress['products']),
      photos,
      bags,
      currentStep: currentStep === 'search' ? 'brand-selection' : 
                   currentStep === 'bags' ? 'brand-selection' : 
                   currentStep as CargoProgress['currentStep'],
      lastUpdated: new Date().toISOString(),
      actionHistory: [],
    };
    
    localStorage.setItem(`${STORAGE_KEY}-${currentCargo.id}`, JSON.stringify(progress));
  }, [currentCargo, products, photos, bags, currentStep]);

  const searchCargo = useCallback(async (cargoId: string, continueProgress = false): Promise<Cargo | null> => {
    try {
      // 1. Faz a requisição real para a API
      const response = await fetch('http://192.168.255.3/api/consultar-ordem-carga', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // A API espera um número, então convertemos a string para Number
        body: JSON.stringify({ ordemCarga: Number(cargoId) }) 
      });

      if (!response.ok) {
        throw new Error('Falha na comunicação com o servidor');
      }

      const data = await response.json();

      if (!data.sucesso || !data.dados || data.dados.length === 0) {
        throw new Error('Carga não encontrada ou sem produtos');
      }

      // 2. Transforma os dados da API pro nosso formato
      const cargo = transformApiToCargo(data.dados);

      // 3. Verifica se tem progresso salvo (código existente)
      const savedProgress = loadProgress(cargoId);
      
      if (savedProgress && continueProgress) {
        const productsWithProgress = cargo.products.map(product => {
          const saved = savedProgress.products[product.code];
          return {
            ...product,
            checkedQuantity: saved?.checkedQuantity ?? null,
            isChecked: saved?.isChecked ?? false,
          };
        });

        setCurrentCargo(cargo);
        setProducts(productsWithProgress);
        setPhotos(savedProgress.photos || []);
        setBags(savedProgress.bags || []);
        setSelectedBrands([]);
        const step = savedProgress.currentStep;
        setCurrentStep(step === 'completed' ? 'brand-selection' : 
                       step === 'verification' ? 'brand-selection' : step);
      } else {
        const productsWithProgress = cargo.products.map(product => ({
          ...product,
          checkedQuantity: null,
          isChecked: false,
        }));

        setCurrentCargo(cargo);
        setProducts(productsWithProgress);
        setPhotos([]);
        setBags([]);
        setSelectedBrands([]);
        setCurrentStep('brand-selection');
      }
      
      return cargo;

    } catch (err: any) {
      console.error('Erro ao buscar carga:', err);
      // Repassamos o erro para a tela de busca poder exibir o toast ou aviso
      throw err; 
    }
  }, [loadProgress]);

  const updateProduct = useCallback((code: string, checkedQuantity: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.code === code
          ? { ...p, checkedQuantity, isChecked: true }
          : p
      )
    );
  }, []);

  const addPhoto = useCallback((imageData: string, observation = '') => {
    const newPhoto: PhotoRecord = {
      id: `photo-${Date.now()}`,
      imageData,
      observation,
      capturedAt: new Date().toISOString(),
    };
    setPhotos(prev => [...prev, newPhoto]);
  }, []);

  const updatePhotoObservation = useCallback((photoId: string, observation: string) => {
    setPhotos(prev =>
      prev.map(p => (p.id === photoId ? { ...p, observation } : p))
    );
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  }, []);

  // Brand management
  const getBrandsFromProducts = useCallback((): string[] => {
    const brands = new Set(products.map(p => p.brand));
    return Array.from(brands).sort();
  }, [products]);

  const getBrandStatuses = useCallback((): BrandStatus[] => {
    const brands = getBrandsFromProducts();
    return brands.map(brand => {
      const brandProducts = products.filter(p => p.brand === brand);
      const total = brandProducts.length;
      const checked = brandProducts.filter(p => p.isChecked).length;
      return {
        brand,
        total,
        checked,
        isComplete: total > 0 && checked === total && brandProducts.every(p => p.checkedQuantity === p.totalQuantity),
      };
    });
  }, [products, getBrandsFromProducts]);

  const toggleBrandSelection = useCallback((brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  }, []);

  const getProductsForSelectedBrands = useCallback((): Product[] => {
    if (selectedBrands.length === 0) return [];
    return products.filter(p => selectedBrands.includes(p.brand));
  }, [products, selectedBrands]);

  const goToVerification = useCallback(() => {
    setCurrentStep('verification');
  }, []);

  const goToBrandSelection = useCallback(() => {
    setSelectedBrands([]);
    setCurrentStep('brand-selection');
  }, []);

  // Bag management functions
  const getProductAvailability = useCallback((productCode: string): { total: number; inBags: number; available: number } => {
    const product = products.find(p => p.code === productCode);
    if (!product) return { total: 0, inBags: 0, available: 0 };

    const checkedQty = product.checkedQuantity ?? 0;
    const inBags = bags.reduce((sum, bag) => {
      const bagProduct = bag.products.find(bp => bp.code === productCode);
      return sum + (bagProduct?.quantity ?? 0);
    }, 0);

    return {
      total: checkedQty,
      inBags,
      available: Math.max(0, checkedQty - inBags),
    };
  }, [products, bags]);

  const getOrderAvailability = useCallback((orderId: string): { hasAvailable: boolean; allInBags: boolean } => {
    const orderProducts = products.filter(p => 
      p.orders.some(o => o.orderId === orderId)
    );

    let hasAnyAvailable = false;
    let allFullyInBags = true;

    for (const product of orderProducts) {
      const availability = getProductAvailability(product.code);
      
      if (availability.available > 0) {
        hasAnyAvailable = true;
        allFullyInBags = false;
      }
    }

    return {
      hasAvailable: hasAnyAvailable,
      allInBags: orderProducts.length > 0 && allFullyInBags,
    };
  }, [products, getProductAvailability]);

  const getOrdersForCargo = useCallback((): { orderId: string; products: { code: string; quantity: number }[] }[] => {
    const ordersMap = new Map<string, { code: string; quantity: number }[]>();

    for (const product of products) {
      for (const order of product.orders) {
        if (!ordersMap.has(order.orderId)) {
          ordersMap.set(order.orderId, []);
        }
        ordersMap.get(order.orderId)!.push({
          code: product.code,
          quantity: order.quantity,
        });
      }
    }

    return Array.from(ordersMap.entries())
      .map(([orderId, prods]) => ({ orderId, products: prods }))
      .sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [products]);

  const addBag = useCallback((bag: Bag) => {
    setBags(prev => [...prev, bag]);
  }, []);

  const updateBag = useCallback((bagId: string, updates: Partial<Bag>) => {
    setBags(prev => prev.map(b => b.id === bagId ? { ...b, ...updates } : b));
  }, []);

  const removeBag = useCallback((bagId: string) => {
    setBags(prev => prev.filter(b => b.id !== bagId));
  }, []);

  const isBagCodeUsed = useCallback((code: string): boolean => {
    return bags.some(b => b.id === code);
  }, [bags]);

  const clearCargo = useCallback(() => {
    setCurrentCargo(null);
    setProducts([]);
    setPhotos([]);
    setBags([]);
    setSelectedBrands([]);
    setCurrentStep('search');
    // cleared
  }, []);

  const clearSavedProgress = useCallback((cargoId: string) => {
    localStorage.removeItem(`${STORAGE_KEY}-${cargoId}`);
  }, []);

  const proceedToPhotos = useCallback(() => {
    setCurrentStep('photos');
  }, []);

  const completeConference = useCallback(() => {
    if (!currentCargo) return;
    
    const progress: CargoProgress = {
      cargoId: currentCargo.id,
      products: products.reduce((acc, p) => {
        acc[p.code] = {
          checkedQuantity: p.checkedQuantity,
          isChecked: p.isChecked,
        };
        return acc;
      }, {} as CargoProgress['products']),
      photos,
      bags,
      currentStep: 'completed',
      lastUpdated: new Date().toISOString(),
      actionHistory: [],
    };
    
    localStorage.setItem(`${STORAGE_KEY}-${currentCargo.id}`, JSON.stringify(progress));
    setCurrentStep('completed');
  }, [currentCargo, products, photos, bags]);

  const getStats = useCallback(() => {
    const total = products.length;
    const checked = products.filter(p => p.isChecked).length;
    const successful = products.filter(
      p => p.isChecked && p.checkedQuantity === p.totalQuantity
    ).length;
    const warnings = products.filter(
      p => p.isChecked && p.checkedQuantity !== p.totalQuantity
    ).length;

    return { total, checked, successful, warnings };
  }, [products]);

  const getStatsForBrands = useCallback((brands: string[]) => {
    const brandProducts = products.filter(p => brands.includes(p.brand));
    const total = brandProducts.length;
    const checked = brandProducts.filter(p => p.isChecked).length;
    const successful = brandProducts.filter(
      p => p.isChecked && p.checkedQuantity === p.totalQuantity
    ).length;
    const warnings = brandProducts.filter(
      p => p.isChecked && p.checkedQuantity !== p.totalQuantity
    ).length;

    return { total, checked, successful, warnings };
  }, [products]);

  const canProceedToPhotos = useCallback(() => {
    const stats = getStats();
    return stats.checked === stats.total && stats.warnings === 0;
  }, [getStats]);

  const canFinalize = useCallback(() => {
    return photos.length >= 5;
  }, [photos]);

  const allBrandsComplete = useCallback(() => {
    const statuses = getBrandStatuses();
    return statuses.length > 0 && statuses.every(s => s.isComplete);
  }, [getBrandStatuses]);

  // Auto-save quando dados mudam
  useEffect(() => {
    if (currentCargo && (products.length > 0 || photos.length > 0 || bags.length > 0)) {
      saveProgress();
    }
  }, [products, photos, bags, currentStep, currentCargo, saveProgress]);

  return {
    currentCargo,
    products,
    photos,
    bags,
    currentStep,
    checkSavedProgress,
    selectedBrands,
    searchCargo,
    updateProduct,
    addPhoto,
    updatePhotoObservation,
    removePhoto,
    addBag,
    updateBag,
    removeBag,
    isBagCodeUsed,
    getProductAvailability,
    getOrderAvailability,
    getOrdersForCargo,
    clearCargo,
    clearSavedProgress,
    saveProgress,
    proceedToPhotos,
    completeConference,
    getStats,
    getStatsForBrands,
    canProceedToPhotos,
    canFinalize,
    // Brand-related
    getBrandsFromProducts,
    getBrandStatuses,
    toggleBrandSelection,
    getProductsForSelectedBrands,
    goToVerification,
    goToBrandSelection,
    allBrandsComplete,
  };
}
