import { useState, useEffect } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Usuario {
  id: number;
  nome: string;
  usuario: string;
  matricula: string;
  perfil: string;
  ativo: boolean;
}

const AdminUsuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    usuario: '',
    matricula: '',
    senha: '',
    perfil: 'conferente',
    ativo: true,
  });

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://192.168.255.6:3000/admin/usuarios');
      if (res.ok) setUsuarios(await res.json());
    } catch {
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const handleOpenNewUser = () => {
    setEditingUserId(null);
    setFormData({ nome: '', usuario: '', matricula: '', senha: '', perfil: 'conferente', ativo: true });
    setIsModalOpen(true);
  };

  const handleOpenEditUser = (user: Usuario) => {
    setEditingUserId(user.id);
    setFormData({
      nome: user.nome,
      usuario: user.usuario,
      matricula: user.matricula || '',
      senha: '',
      perfil: user.perfil,
      ativo: user.ativo,
    });
    setIsModalOpen(true);
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const isEditing = editingUserId !== null;
    const url = isEditing
      ? `http://192.168.255.6:3000/admin/usuarios/${editingUserId}`
      : 'http://192.168.255.6:3000/admin/usuarios';
    try {
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok && data.sucesso) {
        toast.success(isEditing ? 'Utilizador atualizado!' : 'Utilizador criado com sucesso!');
        setIsModalOpen(false);
        fetchUsuarios();
      } else {
        toast.error(data.error || 'Erro ao processar utilizador');
      }
    } catch {
      toast.error('Erro ao conectar com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usuários</h2>
        <p className="text-sm text-muted-foreground">Gerencie os acessos ao sistema</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Equipa</CardTitle>
            <CardDescription>Faça a gestão dos acessos do sistema.</CardDescription>
          </div>
          <Button onClick={handleOpenNewUser}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Utilizador
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">A carregar equipa...</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Utilizador</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.map((user) => (
                    <TableRow key={user.id} className={!user.ativo ? 'opacity-60 bg-muted/30' : ''}>
                      <TableCell className="font-medium">{user.nome}</TableCell>
                      <TableCell>{user.usuario}</TableCell>
                      <TableCell>{user.matricula || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={user.perfil === 'admin' ? 'destructive' : 'outline'}>
                          {user.perfil === 'admin' ? 'Admin' : 'Conferente'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.ativo ? (
                          <Badge className="bg-green-500 hover:bg-green-600">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditUser(user)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleSubmitUser}>
            <DialogHeader>
              <DialogTitle>{editingUserId ? 'Editar Utilizador' : 'Adicionar Utilizador'}</DialogTitle>
              <DialogDescription>
                {editingUserId
                  ? 'Altere os dados ou inative este utilizador.'
                  : 'Preencha os dados do novo membro da equipa.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Maria Silva"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="usuario">Login *</Label>
                  <Input
                    id="usuario"
                    value={formData.usuario}
                    onChange={e => setFormData({ ...formData, usuario: e.target.value.toLowerCase() })}
                    placeholder="Ex: maria.silva"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matricula">Matrícula</Label>
                  <Input
                    id="matricula"
                    value={formData.matricula}
                    onChange={e => setFormData({ ...formData, matricula: e.target.value })}
                    placeholder="Ex: 0003"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">
                  {editingUserId ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha *'}
                </Label>
                <Input
                  id="senha"
                  type="password"
                  value={formData.senha}
                  onChange={e => setFormData({ ...formData, senha: e.target.value })}
                  required={!editingUserId}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="perfil">Perfil de Acesso</Label>
                  <Select
                    value={formData.perfil}
                    onValueChange={val => setFormData({ ...formData, perfil: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conferente">Conferente</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingUserId && (
                  <div className="space-y-2">
                    <Label htmlFor="ativo">Status</Label>
                    <Select
                      value={formData.ativo ? 'true' : 'false'}
                      onValueChange={val => setFormData({ ...formData, ativo: val === 'true' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Ativo</SelectItem>
                        <SelectItem value="false">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'A guardar...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsuarios;
