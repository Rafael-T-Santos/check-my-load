import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Package, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface LoadSearchProps {
  onSearch: (cargoId: string) => Promise<void> | void;
}

export function LoadSearch({ onSearch }: LoadSearchProps) {
  const [cargoId, setCargoId] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    const searchId = cargoId.trim();
    
    if (!searchId) {
      setError('Digite o código da carga');
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      // Agora ele vai esperar a API responder
      await onSearch(searchId); 
    } catch (err: any) {
      // Se a API retornar erro ou a carga não existir, mostramos na tela
      setError(err.message || 'Erro ao buscar carga no servidor');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Logo/Header */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-lg"
          >
            <Truck className="w-10 h-10 text-primary-foreground" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">
            Conferência de Carga
          </h1>
          <p className="text-muted-foreground">
            Digite o código da carga para iniciar
          </p>
        </div>

        {/* Search Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <div className="relative">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Ex: 1251"
              value={cargoId}
              onChange={(e) => {
                setCargoId(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              className="pl-12 h-14 text-lg bg-card border-2 focus:border-primary transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-destructive text-sm font-medium"
            >
              {error}
            </motion.p>
          )}

          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full h-14 text-lg font-semibold"
          >
            {isSearching ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <Search className="w-5 h-5" />
              </motion.div>
            ) : (
              <>
                <Search className="w-5 h-5 mr-2" />
                Buscar Carga
              </>
            )}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
