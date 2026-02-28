import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Users, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  const navigate = useNavigate();

  // Função para deslogar
  const handleLogout = () => {
    localStorage.removeItem('usuario_logado');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      {/* Cabeçalho do Painel */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg">
            <Activity className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Painel Administrativo</h1>
            <p className="text-sm text-muted-foreground">Gestão de Cargas e Equipe</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </header>

      {/* Sistema de Abas (Tabs) */}
      <Tabs defaultValue="cargas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cargas" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Visão de Cargas
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Gestão de Usuários
          </TabsTrigger>
        </TabsList>

        {/* Aba de Cargas */}
        <TabsContent value="cargas">
          <Card>
            <CardHeader>
              <CardTitle>Status das Cargas</CardTitle>
              <CardDescription>Acompanhe o progresso das conferências em tempo real.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Em breve: Tabela com as cargas do banco de dados aparecerão aqui...</p>
              {/* Aqui nós vamos colocar a tabela de cargas futuramente */}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Usuários */}
        <TabsContent value="usuarios">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Equipe</CardTitle>
                <CardDescription>Gerencie os acessos do sistema.</CardDescription>
              </div>
              <Button>Novo Usuário</Button>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Em breve: Lista de usuários e formulário de cadastro...</p>
              {/* Aqui nós vamos colocar a tabela de usuários e a criação futuramente */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;