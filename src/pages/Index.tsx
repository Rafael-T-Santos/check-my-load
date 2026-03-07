import { useState } from 'react';
import { LoadSearch } from '@/components/LoadSearch';
import { BrandSelection } from '@/components/BrandSelection';
import { ProductList } from '@/components/ProductList';
import { PhotoCapture } from '@/components/PhotoCapture';
import { CompletionScreen } from '@/components/CompletionScreen';
import { useCargoProgress } from '@/hooks/useCargoProgress';
import { useActionHistory } from '@/hooks/useActionHistory';
import { toast } from 'sonner';

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

  // Simplificamos a função: não precisa mais saber se é "continueProgress"
  const executeSearch = async (id: string) => {
    try {
      await searchCargo(id);
      addHistoryEntry(
        'conference_started', 
        `Conferência da carga #${id} acessada`
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar carga');
      throw err; 
    }
  };

  // Agora ele simplesmente executa a busca direto
  const handleSearchSubmit = async (cargoId: string) => {
    await executeSearch(cargoId);
  };

  const handleNewConference = () => {
    if (currentCargo) {
      clearSavedProgress(currentCargo.id); // Opcional manter pro localStorage antigo não encher
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
    return <LoadSearch onSearch={handleSearchSubmit} />;
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
