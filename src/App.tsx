import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Selecionar from "./pages/Selecionar";
import Estoque from "./pages/Estoque";
import Entrada from "./pages/Entrada";
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminCargas from '@/pages/admin/AdminCargas';
import AdminEstoque from '@/pages/admin/AdminEstoque';
import AdminEntradas from '@/pages/admin/AdminEntradas';
import AdminUsuarios from '@/pages/admin/AdminUsuarios';
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Se NÃO tiver usuário no localStorage, manda pro Login
const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  const auth = localStorage.getItem('usuario');
  return auth ? children : <Navigate to="/" replace />;
};

// Se JÁ TIVER usuário logado e tentar acessar o Login, manda direto pra área logada
const PublicRoute = ({ children }: { children: React.ReactElement }) => {
  const auth = localStorage.getItem('usuario');
  if (auth) {
    const user = JSON.parse(auth);
    return <Navigate to={user.perfil === 'admin' ? '/admin' : '/selecionar'} replace />;
  }
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Rotas Públicas */}
          <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
          
          {/* Rotas Privadas (Protegidas) */}
          <Route path="/selecionar" element={<PrivateRoute><Selecionar /></PrivateRoute>} />
          <Route path="/cargo"      element={<PrivateRoute><Index /></PrivateRoute>} />
          <Route path="/estoque"    element={<PrivateRoute><Estoque /></PrivateRoute>} />
          <Route path="/entrada"    element={<PrivateRoute><Entrada /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
            <Route index element={<AdminCargas />} />
            <Route path="estoque"  element={<AdminEstoque />} />
            <Route path="entradas" element={<AdminEntradas />} />
            <Route path="usuarios" element={<AdminUsuarios />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;