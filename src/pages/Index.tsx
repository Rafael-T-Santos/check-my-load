import { useState } from 'react';
import { LoadSearch } from '@/components/LoadSearch';
import { BrandSelection } from '@/components/BrandSelection';
import { ProductList } from '@/components/ProductList';
import { PhotoCapture } from '@/components/PhotoCapture';
import { CompletionScreen } from '@/components/CompletionScreen';
import { useCargoProgress } from '@/hooks/useCargoProgress';
import { useActionHistory } from '@/hooks/useActionHistory';
import { toast } from 'sonner';
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

const Index = () => {
  const {
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
    removeBag,
    getProductAvailability,
    getOrderAvailability,
    getOrdersForCargo,
    isBagCodeUsed,
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
    // Brand
    getBrandStatuses,
    toggleBrandSelection,
    getProductsForSelectedBrands,
    goToVerification,
    goToBrandSelection,
    allBrandsComplete,
  } = useCargoProgress();

  const {
    history: actionHistory,
    addEntry: addHistoryEntry,
    clearHistory,
  } = useActionHistory(currentCargo?.id ?? null);

  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [pendingCargoId, setPendingCargoId] = useState<string | null>(null);

  // Função central para buscar na API e registrar no histórico
  const executeSearch = async (id: string, continueProgress: boolean) => {
    try {
      await searchCargo(id, continueProgress);
      addHistoryEntry(
        'conference_started', 
        `Conferência da carga #${id} ${continueProgress ? 'retomada' : 'iniciada'}`
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar carga');
      throw err; 
    }
  };

  const handleSearchSubmit = async (cargoId: string) => {
    const hasSaved = checkSavedProgress(cargoId);
    
    if (hasSaved) {
      setPendingCargoId(cargoId);
      setResumeDialogOpen(true);
    } else {
      await executeSearch(cargoId, false);
    }
  };

  const handleContinueProgress = async () => {
    if (pendingCargoId) {
      try {
        await executeSearch(pendingCargoId, true);
      } catch (err) {
        // O erro já é tratado e exibido no toast dentro do executeSearch
      }
    }
    setResumeDialogOpen(false);
    setPendingCargoId(null);
  };

  const handleStartFresh = async () => {
    if (pendingCargoId) {
      clearSavedProgress(pendingCargoId);
      try {
        await executeSearch(pendingCargoId, false);
      } catch (err) {
        // O erro já é tratado no toast
      }
    }
    setResumeDialogOpen(false);
    setPendingCargoId(null);
  };

  const handleNewConference = () => {
    if (currentCargo) {
      clearSavedProgress(currentCargo.id);
    }
    clearCargo();
  };

  const handleAddPhoto = (imageData: string, observation?: string) => {
    addPhoto(imageData, observation);
    const currentPhotoCount = photos.length + 1;
    addHistoryEntry('photo_captured', `Foto ${currentPhotoCount}/5 capturada na carga`, {
      photoNumber: currentPhotoCount,
    });
  };

  const handleCompleteConference = () => {
    addHistoryEntry('conference_completed', `Conferência da carga #${currentCargo?.id} finalizada`);
    completeConference();
  };

  const handleSaveBrands = () => {
    handleSaveToDatabase();
    toast.success('Progresso salvo!', { description: 'Você pode continuar depois.' });
  };

  const handleSaveToDatabase = async () => {
    saveProgress(); // Backup rápido de segurança
    await syncWithServer(); // Manda os seus dados e puxa os dos outros!
  };

  // Para os botões "Concluir Marca", "Salvar e Voltar" e "Resolver Divergências"
  const handleProceedFromProducts = async () => {
    await handleSaveToDatabase(); // Sincroniza primeiro
    goToBrandSelection(); // Depois volta pra tela
  };

  // Para o botão de ir para as fotos
  const handleProceedToPhotos = async () => {
    await handleSaveToDatabase(); // Sincroniza primeiro
    proceedToPhotos(); // Depois vai pras fotos
  };

  // Search screen
  if (!currentCargo) {
    return (
      <>
        <LoadSearch onSearch={handleSearchSubmit} />
        <AlertDialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Progresso encontrado</AlertDialogTitle>
              <AlertDialogDescription>
                Encontramos um progresso salvo para a carga #{pendingCargoId}. Deseja continuar de onde parou ou iniciar uma nova conferência?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={handleStartFresh}>
                Iniciar do Zero
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleContinueProgress}>
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Completion screen
  if (currentStep === 'completed') {
    return (
      <CompletionScreen
        cargoId={currentCargo.id}
        products={products}
        photos={photos}
        onNewConference={handleNewConference}
      />
    );
  }

  // Photo capture screen
  if (currentStep === 'photos') {
    return (
      <PhotoCapture
        cargoId={currentCargo.id}
        photos={photos}
        onBack={goToBrandSelection}
        onAddPhoto={handleAddPhoto}
        onUpdateObservation={updatePhotoObservation}
        onRemovePhoto={removePhoto}
        onSave={saveProgress}
        onFinalize={handleCompleteConference}
        canFinalize={canFinalize()}
      />
    );
  }

  // Brand selection screen
  if (currentStep === 'brand-selection') {
    return (
      <BrandSelection
        cargoId={currentCargo.id}
        licensePlate={currentCargo.licensePlate}
        brandStatuses={getBrandStatuses()}
        selectedBrands={selectedBrands}
        products={products}
        onToggleBrand={toggleBrandSelection}
        onStartVerification={goToVerification}
        onSave={() => {
          handleSaveToDatabase();
          toast.success('Sincronizado!', { description: 'Dados atualizados com o servidor.' });
        }}
        onProceedToPhotos={handleProceedToPhotos}
        onBack={clearCargo}
        allComplete={allBrandsComplete()}
      />
    );
  }

  // Product verification screen (filtered by selected brands)
  const brandProducts = getProductsForSelectedBrands();
  const brandStats = getStatsForBrands(selectedBrands);

  return (
    <ProductList
      cargoId={currentCargo.id}
      products={brandProducts}
      bags={bags}
      onBack={goToBrandSelection}
      onUpdateProduct={updateProduct}
      onSave={() => {
        handleSaveToDatabase();
        toast.success('Sincronizado!', { description: 'Dados atualizados com o servidor.' });
      }}
      onProceed={handleProceedFromProducts}
      onAddBag={addBag}
      onRemoveBag={removeBag}
      getOrderAvailability={getOrderAvailability}
      getProductAvailability={getProductAvailability}
      getOrdersForCargo={getOrdersForCargo}
      isBagCodeUsed={isBagCodeUsed}
      stats={brandStats}
      canProceed={canProceedToPhotos()}
      actionHistory={actionHistory}
      onAddHistoryEntry={addHistoryEntry}
      onClearHistory={clearHistory}
      selectedBrands={selectedBrands}
    />
  );
};

export default Index;
