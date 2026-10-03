import { useNavigate } from 'react-router-dom';
import { Package, LogOut, Truck, BarChart3, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const Selecionar = () => {
  const navigate = useNavigate();
  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem('usuario') || '{}'); }
    catch { return {}; }
  })();

  const handleLogout = () => {
    localStorage.removeItem('usuario');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Check My Load</p>
            <p className="text-xs text-muted-foreground">{usuario.nome || 'Conferente'}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold">O que você vai fazer?</h1>
          <p className="text-muted-foreground text-sm mt-1">Selecione o tipo de atividade</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
          <Card
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => navigate('/cargo')}
          >
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                <Truck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-base">Conferência de Carga</p>
                <p className="text-xs text-muted-foreground mt-1">Verificar produtos de uma ordem de carga</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => navigate('/estoque')}
          >
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-base">Contagem de Estoque</p>
                <p className="text-xs text-muted-foreground mt-1">Contar e registrar estoque físico</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => navigate('/entrada')}
          >
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center">
                <PackageCheck className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-base">Conferência de Entrada</p>
                <p className="text-xs text-muted-foreground mt-1">Conferir mercadorias recebidas do fornecedor</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Selecionar;
