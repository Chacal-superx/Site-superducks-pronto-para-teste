import React, { useState, useEffect } from 'react';
import { 
  Monitor, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Activity,
  Users,
  Cpu
} from 'lucide-react';
import { api } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import StatsCard from './StatsCard';
import RobotStatusChart from './RobotStatusChart';
import RecentActivity from './RecentActivity';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsResponse, robotsResponse] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/robots')
      ]);
      
      setStats(statsResponse.data);
      setRobots(robotsResponse.data);
      setError(null);
    } catch (err) {
      setError('Erro ao carregar dados do dashboard');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <XCircle className="h-5 w-5 text-red-400 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      </div>
    );
  }

  const statusCards = [
    {
      title: 'Total de Robôs',
      value: stats?.total_robots || 0,
      icon: Monitor,
      color: 'blue',
      change: '+2 esta semana'
    },
    {
      title: 'Online',
      value: stats?.online_robots || 0,
      icon: CheckCircle,
      color: 'green',
      change: `${((stats?.online_robots / stats?.total_robots) * 100 || 0).toFixed(1)}% do total`
    },
    {
      title: 'Offline',
      value: stats?.offline_robots || 0,
      icon: XCircle,
      color: 'red',
      change: `${((stats?.offline_robots / stats?.total_robots) * 100 || 0).toFixed(1)}% do total`
    },
    {
      title: 'Com Problemas',
      value: stats?.error_robots || 0,
      icon: AlertTriangle,
      color: 'orange',
      change: stats?.error_robots > 0 ? 'Requer atenção' : 'Tudo funcionando'
    }
  ];

  const recentRobots = robots
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Visão geral do sistema PiKVM SuperDucks
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          <span>Última atualização: {new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statusCards.map((card, index) => (
          <StatsCard key={index} {...card} />
        ))}
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Status Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Status dos Robôs
          </h2>
          <RobotStatusChart data={stats} />
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Atividade Recente
          </h2>
          <RecentActivity robots={recentRobots} />
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Status do Sistema
          </h2>
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">Sistema Operacional</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full p-3 w-12 h-12 mx-auto mb-3">
              <Cpu className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-medium text-gray-900">Backend API</h3>
            <p className="text-sm text-green-600">Funcionando</p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 rounded-full p-3 w-12 h-12 mx-auto mb-3">
              <Monitor className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-medium text-gray-900">Monitoramento</h3>
            <p className="text-sm text-green-600">Ativo</p>
          </div>

          <div className="text-center">
            <div className="bg-purple-100 rounded-full p-3 w-12 h-12 mx-auto mb-3">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-medium text-gray-900">Clientes Ativos</h3>
            <p className="text-sm text-gray-600">{stats?.total_robots || 0}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Ações Rápidas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => window.location.href = '/add-robot'}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Monitor className="h-4 w-4" />
            <span>Adicionar Robô</span>
          </button>
          
          <button 
            onClick={() => window.location.href = '/diagnostics'}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <Activity className="h-4 w-4" />
            <span>Executar Diagnósticos</span>
          </button>
          
          <button 
            onClick={() => window.location.href = '/bulk-operations'}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <Settings className="h-4 w-4" />
            <span>Operações em Lote</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;