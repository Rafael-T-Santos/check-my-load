import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminCargas from '@/pages/admin/AdminCargas';
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
    return <Navigate to={user.perfil === 'admin' ? '/admin' : '/cargo'} replace />;
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
          <Route path="/cargo" element={<PrivateRoute><Index /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
            <Route index element={<AdminCargas />} />
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