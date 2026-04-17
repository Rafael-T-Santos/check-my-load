import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Package, Users, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/admin', label: 'Cargas', icon: Package, end: true },
  { to: '/admin/usuarios', label: 'Usuários', icon: Users, end: false },
];

const AdminLayout = () => {
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
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 border-r flex flex-col bg-card shrink-0">
        <div className="p-4 border-b flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Painel Admin</p>
            <p className="text-xs text-muted-foreground">Check My Load</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t space-y-1">
          <div className="px-3 py-1">
            <p className="text-xs font-medium truncate">{usuario.nome || 'Administrador'}</p>
            <p className="text-xs text-muted-foreground capitalize">{usuario.perfil || 'admin'}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
