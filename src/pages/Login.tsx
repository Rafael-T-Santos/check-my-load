import { useState } from 'react';
import { Eye, EyeOff, User, Lock, Package, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!username.trim()) newErrors.username = 'O usuário é obrigatório';
    if (!password.trim()) newErrors.password = 'Campo obrigatório';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setIsLoading(true);

    try {
      // Faz a chamada para a nossa nova rota no backend
      const response = await fetch('/api-local/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Alterado de 'matricula' para 'usuario'
        body: JSON.stringify({ usuario: username, senha: password }), 
      });

      const data = await response.json();

      if (response.ok && data.sucesso) {
        toast.success(`Bem-vindo(a), ${data.usuario.nome}!`);
        localStorage.setItem('usuario', JSON.stringify(data.usuario));
        
        if (data.usuario.perfil === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/cargo', { replace: true });
        }
      } else {
        toast.error(data.error || 'Matrícula ou senha inválidos');
      }
    } catch (error) {
      console.error('Erro na requisição de login:', error);
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="items-center space-y-3 pb-2">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            <Package className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Check My Load</h1>
            <p className="text-sm text-muted-foreground mt-1">Faça login para continuar</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  placeholder="Digite seu usuário"
                  value={username}
                  onChange={(e) => { 
                  // O .replace(/\s/g, '') remove todos os espaços em branco digitados ou colados
                  const valorFormatado = e.target.value.replace(/\s/g, '').toLowerCase();
                  setUsername(valorFormatado); 
                  setErrors(prev => ({ ...prev, username: undefined })); 
                }}
                  className={`pl-10 ${errors.username ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  disabled={isLoading}
                />
              </div>
              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }}
                  className={`pl-10 pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;