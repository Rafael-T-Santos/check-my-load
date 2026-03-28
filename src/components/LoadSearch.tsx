import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Package, Truck, LogOut } from 'lucide-react'; // <-- Importe o LogOut
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom'; // <-- Importe o useNavigate

interface LoadSearchProps {
  onSearch: (cargoId: string) => Promise<void> | void;
}

export function LoadSearch({ onSearch }: LoadSearchProps) {
  const [cargoId, setCargoId] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const navigate = useNavigate(); // <-- Inicialize o navigate
  // Pega o nome do usuário para dar boas-vindas
  const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('usuario'); // Limpa a sessão
    navigate('/', { replace: true }); // Volta pro login limpando o histórico
  };

  const handleSearch = async () => {
    const searchId = cargoId.trim();
    if (!searchId) {
      setError('Digite o código da carga');
      return;
    }
    setIsSearching(true);
    setError('');

    try {
      await onSearch(searchId); 
    } catch (err: any) {
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative">
      
      {/* NOVO: Header com Botão de Sair */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">
          Olá, {usuarioLogado.nome}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleLogout} 
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          title="Sair"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-8"
      >
        {/* ... O restante do seu layout original do LoadSearch continua igual daqui pra baixo ... */}
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
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Ex: 1251"
              value={cargoId}
              onChange={(e) => {
                const apenasNumeros = e.target.value.replace(/\D/g, '');
                setCargoId(apenasNumeros);
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