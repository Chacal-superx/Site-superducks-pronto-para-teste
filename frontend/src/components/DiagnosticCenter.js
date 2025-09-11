import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  Refresh,
  Monitor,
  Wifi,
  HardDrive,
  Cpu,
  Thermometer
} from 'lucide-react';
import { apiService } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const DiagnosticCenter = () => {
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDiagnosticData();
  }, []);

  const loadDiagnosticData = async () => {
    try {
      const response = await apiService.getRobots();
      setRobots(response.data);
    } catch (error) {
      toast.error('Erro ao carregar dados de diagnóstico');
      console.error('Error loading diagnostic data:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshDiagnostics = async () => {
    setRefreshing(true);
    try {
      await apiService.diagnoseAllRobots();
      toast.success('Diagnósticos atualizados para todos os robôs');
      setTimeout(() => {
        loadDiagnosticData();
      }, 3000);
    } catch (error) {
      toast.error('Erro ao atualizar diagnósticos');
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'offline':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'configuring':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      default:
        return <Monitor className="h-5 w-5 text-gray-500" />;
    }
  };

  const getHealthScore = (robot) => {
    if (!robot.diagnostics || Object.keys(robot.diagnostics).length === 0) {
      return { score: 0, status: 'unknown', color: 'gray' };
    }

    const tests = Object.values(robot.diagnostics);
    const passedTests = tests.filter(test => 
      test.status === 'pass' || test.status === 'online' || test.status === 'healthy'
    ).length;
    
    const score = Math.round((passedTests / tests.length) * 100);
    
    let status, color;
    if (score >= 80) {
      status = 'healthy';
      color = 'green';
    } else if (score >= 60) {
      status = 'warning';
      color = 'yellow';
    } else {
      status = 'critical';
      color = 'red';
    }

    return { score, status, color };
  };

  const getSystemStats = () => {
    const total = robots.length;
    const online = robots.filter(r => r.status === 'online').length;
    const healthy = robots.filter(r => getHealthScore(r).status === 'healthy').length;
    const warning = robots.filter(r => getHealthScore(r).status === 'warning').length;
    const critical = robots.filter(r => getHealthScore(r).status === 'critical').length;

    return {
      total,
      online,
      healthy,
      warning,
      critical,
      uptime: total > 0 ? Math.round((online / total) * 100) : 0
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Carregando diagnósticos..." />
      </div>
    );
  }

  const systemStats = getSystemStats();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Centro de Diagnóstico</h1>
          <p className="text-gray-600 mt-1">
            Monitoramento em tempo real de todos os robôs PiKVM
          </p>
        </div>
        
        <button
          onClick={refreshDiagnostics}
          disabled={refreshing}
          className="btn-primary"
        >
          {refreshing ? (
            <div className="loading-spinner mr-2" />
          ) : (
            <Refresh className="h-4 w-4 mr-2" />
          )}
          {refreshing ? 'Atualizando...' : 'Atualizar Todos'}
        </button>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="card text-center">
          <Monitor className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{systemStats.total}</p>
          <p className="text-sm text-gray-600">Total de Robôs</p>
        </div>
        
        <div className="card text-center">
          <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{systemStats.online}</p>
          <p className="text-sm text-gray-600">Online</p>
        </div>
        
        <div className="card text-center">
          <Activity className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{systemStats.healthy}</p>
          <p className="text-sm text-gray-600">Saudáveis</p>
        </div>
        
        <div className="card text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{systemStats.warning}</p>
          <p className="text-sm text-gray-600">Atenção</p>
        </div>
        
        <div className="card text-center">
          <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{systemStats.critical}</p>
          <p className="text-sm text-gray-600">Críticos</p>
        </div>
      </div>

      {/* Health Overview Chart */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Visão Geral da Saúde do Sistema
        </h2>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Uptime Geral: {systemStats.uptime}%
            </span>
            <span className="text-sm text-gray-500">
              {systemStats.online} de {systemStats.total} robôs online
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-green-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${systemStats.uptime}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">
              Saudáveis: {systemStats.healthy}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-sm text-gray-600">
              Atenção: {systemStats.warning}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm text-gray-600">
              Críticos: {systemStats.critical}
            </span>
          </div>
        </div>
      </div>

      {/* Robots Diagnostic Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {robots.map((robot) => {
          const health = getHealthScore(robot);
          return (
            <div key={robot.id} className="card hover:shadow-lg transition-shadow">
              {/* Robot Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(robot.status)}
                  <div>
                    <h3 className="font-semibold text-gray-900">{robot.name}</h3>
                    <p className="text-sm text-gray-600">#{robot.serial_number}</p>
                  </div>
                </div>
                
                {/* Health Score */}
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    health.color === 'green' ? 'text-green-600' :
                    health.color === 'yellow' ? 'text-yellow-600' :
                    health.color === 'red' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {health.score}%
                  </div>
                  <p className="text-xs text-gray-500">Health Score</p>
                </div>
              </div>

              {/* Diagnostic Tests */}
              <div className="space-y-3">
                {robot.diagnostics && Object.keys(robot.diagnostics).length > 0 ? (
                  Object.entries(robot.diagnostics).map(([testName, result]) => (
                    <div key={testName} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {testName === 'ping' && <Wifi className="h-4 w-4 text-gray-400" />}
                        {testName === 'pikvm_service' && <Monitor className="h-4 w-4 text-gray-400" />}
                        {testName === 'disk_usage' && <HardDrive className="h-4 w-4 text-gray-400" />}
                        {testName === 'cpu_usage' && <Cpu className="h-4 w-4 text-gray-400" />}
                        {testName === 'temperature' && <Thermometer className="h-4 w-4 text-gray-400" />}
                        {!['ping', 'pikvm_service', 'disk_usage', 'cpu_usage', 'temperature'].includes(testName) && 
                          <Activity className="h-4 w-4 text-gray-400" />}
                        
                        <span className="text-sm text-gray-700 capitalize">
                          {testName.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {result.status === 'pass' || result.status === 'online' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : result.status === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        
                        {result.value && (
                          <span className="text-xs text-gray-500 font-mono">
                            {result.value}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Nenhum diagnóstico disponível
                    </p>
                    <p className="text-xs text-gray-400">
                      Execute um diagnóstico para ver os resultados
                    </p>
                  </div>
                )}
              </div>

              {/* Last Update */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Cliente: {robot.client_name}</span>
                  <span>
                    {robot.last_seen ? 
                      new Date(robot.last_seen).toLocaleString('pt-BR') : 
                      'Nunca verificado'
                    }
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* No robots message */}
      {robots.length === 0 && (
        <div className="card text-center py-12">
          <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum robô encontrado
          </h3>
          <p className="text-gray-600 mb-4">
            Adicione robôs ao sistema para começar o monitoramento
          </p>
          <button 
            onClick={() => window.location.href = '/add-robot'}
            className="btn-primary"
          >
            Adicionar Primeiro Robô
          </button>
        </div>
      )}
    </div>
  );
};

export default DiagnosticCenter;