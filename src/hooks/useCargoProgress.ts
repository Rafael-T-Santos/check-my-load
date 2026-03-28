import { useState, useCallback, useEffect } from 'react';
import { Cargo, CargoProgress, Product, PhotoRecord, AppStep, Bag, BrandStatus } from '@/types/cargo';
import { mockCargos } from '@/data/mockCargos';

interface ApiCargoItem {
  codProd: number;
  descrProd: string;
  marca: string;
  numNota: number;
  nuNota: number;
  ordemCarga: number;
  parceiroRazao: string;
  placa: string;
  doca?: string | null;
  qtdNeg: number;
  referencia: string;
  validaCodBarra: string;
}

function transformApiToCargo(apiData: ApiCargoItem[]): Cargo {
  const cargoId = apiData[0].ordemCarga.toString();
  const licensePlate = apiData[0].placa;
  const dock = apiData[0].doca;
  const productMap = new Map<string, Product>();

  apiData.forEach(item => {
    const prodCode = item.codProd.toString();
    const orderId = item.nuNota.toString();
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
      // Adicionamos o customerName pegando do item.parceiroRazao
      product.orders.push({ 
        orderId, 
        quantity, 
        customerName: item.parceiroRazao || 'CLIENTE NÃO INFORMADO' 
      });
    }
  });

  return {
    id: cargoId,
    licensePlate: licensePlate,
    dock: dock,
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
      // 1. Busca os dados originais do ERP/Sistema externo
      const response = await fetch('http://192.168.255.6:5000/api/consultar-ordem-carga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordemCarga: Number(cargoId) }) 
      });

      if (!response.ok) throw new Error('Falha na comunicação com o servidor');
      const data = await response.json();
      if (!data.sucesso || !data.dados || data.dados.length === 0) {
        throw new Error('Carga não encontrada ou sem produtos');
      }

      const cargo = transformApiToCargo(data.dados);

      // 2. Busca o progresso no nosso NOVO backend local
      let progressoDB = [];
      try {
        const dbResponse = await fetch(`http://192.168.255.6:3000/cargas/${cargoId}/progresso`);
        if (dbResponse.ok) {
          progressoDB = await dbResponse.json();
        }
      } catch (e) {
        console.warn('Não foi possível buscar o progresso no banco local', e);
      }

      // 2.5 Busca as sacolas do banco de dados
      let sacolasDB: Bag[] = [];
      try {
        const sacolasResponse = await fetch(`http://192.168.255.6:3000/cargas/${cargoId}/sacolas`);
        if (sacolasResponse.ok) {
          sacolasDB = await sacolasResponse.json();
          setBags(sacolasDB); // Salva no estado
        }
      } catch (e) {
        console.warn('Não foi possível buscar as sacolas no banco local', e);
      }

      // 2.6 Busca as fotos do banco de dados
      try {
        const fotosResponse = await fetch(`http://192.168.255.6:3000/cargas/${cargoId}/fotos`);
        if (fotosResponse.ok) {
          const fotosDB = await fotosResponse.json();
          setPhotos(fotosDB); // Carrega as fotos antigas na tela!
        } else {
          setPhotos([]); // Zera se for uma carga nova
        }
      } catch (e) {
        console.warn('Não foi possível buscar as fotos no banco local', e);
        setPhotos([]);
      }

      // 3. Mescla os dados da API com o progresso do Banco
      if (progressoDB.length > 0) {
        const productsWithProgress = cargo.products.map(product => {
          const savedProd = progressoDB.find((p: any) => p.produto_codigo === product.code);
          return {
            ...product,
            checkedQuantity: savedProd ? savedProd.quantidade_conferida : null,
            isChecked: !!savedProd,
          };
        });

        setCurrentCargo(cargo);
        setProducts(productsWithProgress);
        setCurrentStep('brand-selection');
      } else {
        // Se não for continuar ou não tiver progresso, inicia zerado
        const productsWithProgress = cargo.products.map(product => ({
          ...product,
          checkedQuantity: null,
          isChecked: false,
        }));
        setCurrentCargo(cargo);
        setProducts(productsWithProgress);
        setCurrentStep('brand-selection');
      }
      
      return cargo;
    } catch (err: any) {
      console.error('Erro ao buscar carga:', err);
      throw err; 
    }
  }, []);

  const saveProgressToDB = useCallback(async () => {
    if (!currentCargo) return;

    // 1. Prepara os produtos conferidos
    const produtosConferidos = products
      .filter(p => p.isChecked && p.checkedQuantity !== null)
      .map(p => ({
        codigo: p.code,
        quantidade: p.checkedQuantity,
        marca: p.brand
      }));

    // 2. Salva os produtos APENAS se houver algum produto conferido
    if (produtosConferidos.length > 0) {
      try {
        await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sincronizar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            produtos: produtosConferidos,
            usuario_id: 1 // Aqui você pode passar o ID do usuário logado no futuro
          })
        });
        console.log('Progresso salvo no banco!');
      } catch (error) {
        console.error('Erro ao sincronizar com banco de dados:', error);
      }
    }

    // 3. Salva as sacolas APENAS se houver alguma sacola criada, independentemente dos produtos
    if (bags.length > 0) {
      try {
        await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sacolas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sacolas: bags,
            usuario_id: 1 // futuramente pegue do localStorage
          })
        });
        console.log('Sacolas salvas no banco!');
      } catch (error) {
        console.error('Erro ao sincronizar sacolas com banco de dados:', error);
      }
    }
  }, [currentCargo, products, bags]);

  const syncWithServer = useCallback(async () => {
    if (!currentCargo) return;

    // VERIFICAÇÃO DE RESILIÊNCIA: O celular está sem rede (Wi-Fi/4G caiu)?
    if (!navigator.onLine) {
      toast.warning('Sem internet! 📶', {
        description: 'Dados guardados no celular. Sincronizaremos quando a rede voltar.'
      });
      return; // Para a função aqui e não tenta fazer o fetch
    }

    try {
      // 1. Envia as conferências locais para o banco (Push)
      await saveProgressToDB();

      // 2. Busca as novidades que outros usuários podem ter feito (Pull)
      const dbResponse = await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/progresso`);
      if (dbResponse.ok) {
        const progressoDB = await dbResponse.json();
        
        // 3. Atualiza a tela com a soma do seu trabalho + trabalho dos outros
        setProducts(prevProducts => prevProducts.map(product => {
          const savedProd = progressoDB.find((p: any) => p.produto_codigo === product.code);
          if (savedProd) {
            return {
              ...product,
              checkedQuantity: savedProd.quantidade_conferida,
              isChecked: true,
            };
          }
          return product;
        }));
        //Atualiza as sacolas com o que veio do banco
        const sacolasResponse = await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sacolas`);
        if (sacolasResponse.ok) {
          const sacolasDB = await sacolasResponse.json();
          setBags(sacolasDB);
        }
      }
    } catch (error) {
      // VERIFICAÇÃO DE RESILIÊNCIA: A rede falhou BEM na hora do envio?
      console.error('Erro na sincronização de mão dupla:', error);
      toast.warning('Conexão fraca! ⚠️', {
        description: 'Não foi possível sincronizar agora, mas o seu progresso está a salvo.'
      });
    }
  }, [currentCargo, saveProgressToDB]);

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
    let totalCheckedQty = 0; // <-- NOVO: Contador para saber se conferiu algo

    for (const product of orderProducts) {
      const availability = getProductAvailability(product.code);
      
      // Soma a quantidade total já conferida desse produto
      totalCheckedQty += availability.total; 
      
      if (availability.available > 0) {
        hasAnyAvailable = true;
        allFullyInBags = false;
      }
    }

    return {
      hasAvailable: hasAnyAvailable,
      // NOVO: Só é "100% na sacola" se existir itens, SE a quantidade conferida for maior que 0 e SE não sobrar nada disponível
      allInBags: orderProducts.length > 0 && totalCheckedQty > 0 && allFullyInBags,
    };
  }, [products, getProductAvailability]);

  // Atualizamos o tipo de retorno para incluir o customerName
  const getOrdersForCargo = useCallback((): { orderId: string; customerName: string; products: { code: string; quantity: number }[] }[] => {
    const ordersMap = new Map<string, { customerName: string; products: { code: string; quantity: number }[] }>();

    for (const product of products) {
      for (const order of product.orders) {
        if (!ordersMap.has(order.orderId)) {
          // Inicializa o pedido no Map salvando o customerName
          ordersMap.set(order.orderId, { 
            customerName: (order as any).customerName || 'CLIENTE NÃO INFORMADO', 
            products: [] 
          });
        }
        ordersMap.get(order.orderId)!.products.push({
          code: product.code,
          quantity: order.quantity,
        });
      }
    }

    // Retorna o array formatado
    return Array.from(ordersMap.entries())
      .map(([orderId, data]) => ({ 
        orderId, 
        customerName: data.customerName, 
        products: data.products 
      }))
      .sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [products]);

  const addBag = useCallback((bag: Bag) => {
    setBags(prev => {
      const newBags = [...prev, bag];
      // Dispara o salvamento no banco em segundo plano imediatamente
      if (currentCargo) {
        fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sacolas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sacolas: newBags, usuario_id: 1 })
        }).catch(e => console.error('Erro ao salvar sacola no banco:', e));
      }
      return newBags;
    });
  }, [currentCargo]);

  const updateBag = useCallback((bagId: string, updates: Partial<Bag>) => {
    setBags(prev => {
      const newBags = prev.map(b => b.id === bagId ? { ...b, ...updates } : b);
      if (currentCargo) {
        fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sacolas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sacolas: newBags, usuario_id: 1 })
        }).catch(e => console.error('Erro ao atualizar sacola no banco:', e));
      }
      return newBags;
    });
  }, [currentCargo]);

  const removeBag = useCallback((bagId: string) => {
    setBags(prev => {
      const newBags = prev.filter(b => b.id !== bagId);
      if (currentCargo) {
        fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/sacolas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sacolas: newBags, usuario_id: 1 })
        }).catch(e => console.error('Erro ao remover sacola no banco:', e));
      }
      return newBags;
    });
  }, [currentCargo]);

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

  const completeConference = useCallback(async () => {
    if (!currentCargo) return;
    
    try {
      // 1. Salva as últimas alterações dos produtos
      await saveProgressToDB();

      // 2. Envia as fotos para o backend
      if (photos.length > 0) {
        await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/fotos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fotos: photos })
        });
      }

      // 3. Finaliza a carga no banco
      await fetch(`http://192.168.255.6:3000/cargas/${currentCargo.id}/finalizar`, {
        method: 'POST'
      });

      // Limpa o localStorage antigo, já que agora está tudo no banco
      localStorage.removeItem(`${STORAGE_KEY}-${currentCargo.id}`);
      setCurrentStep('completed');

    } catch (error) {
      console.error('Erro ao finalizar a conferência:', error);
      // Aqui você poderia adicionar um toast de erro para avisar o usuário
    }
  }, [currentCargo, photos, saveProgressToDB]);

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
    saveProgressToDB,
    syncWithServer,
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
