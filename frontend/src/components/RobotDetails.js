import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Monitor, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  ExternalLink,
  Settings,
  Activity,
  Terminal,
  Download,
  Play,
  Refresh
} from 'lucide-react';
import { apiService } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const RobotDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [robot, setRobot] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [scripts, setScripts] = useState({});
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadRobotData();
  }, [id]);

  const loadRobotData = async () => {
    try {
      const [robotResponse, diagnosticsResponse] = await Promise.all([
        apiService.getRobot(id),
        apiService.getRobotDiagnostics(id)
      ]);
      
      setRobot(robotResponse.data);
      setDiagnostics(diagnosticsResponse.data);
    } catch (error) {
      toast.error('Erro ao carregar dados do robô');
      console.error('Error loading robot data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScript = async (scriptType) => {
    try {
      const response = await apiService.getConfigurationScript(id, scriptType);
      setScripts(prev => ({
        ...prev,
        [scriptType]: response.data.script
      }));
    } catch (error) {
      toast.error(`Erro ao carregar script ${scriptType}`);
    }
  };

  const runDiagnostics = async () => {
    setDiagnosing(true);
    try {
      await apiService.diagnoseRobot(id);
      toast.success('Diagnóstico iniciado! Os resultados aparecerão em alguns instantes.');
      
      // Refresh diagnostics after a delay
      setTimeout(() => {
        loadRobotData();
      }, 5000);
    } catch (error) {
      toast.error('Erro ao executar diagnóstico');
    } finally {
      setDiagnosing(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'offline':
        return <XCircle className="h-6 w-6 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-6 w-6 text-orange-500" />;
      case 'configuring':
        return <Clock className="h-6 w-6 text-blue-500 animate-pulse" />;
      default:
        return <Monitor className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      online: 'bg-green-100 text-green-800',
      offline: 'bg-red-100 text-red-800',
      error: 'bg-orange-100 text-orange-800',
      configuring: 'bg-blue-100 text-blue-800',
    };

    const labels = {
      online: 'Online',
      offline: 'Offline',
      error: 'Erro',
      configuring: 'Configurando',
    };

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || 'Desconhecido'}
      </span>
    );
  };

  const downloadScript = (scriptType, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${robot.name}-${scriptType}-script.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: Monitor },
    { id: 'diagnostics', label: 'Diagnósticos', icon: Activity },
    { id: 'scripts', label: 'Scripts', icon: Terminal },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Carregando dados do robô..." />
      </div>
    );
  }

  if (!robot) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Robô não encontrado
        </h3>
        <button onClick={() => navigate('/robots')} className="btn-primary">
          Voltar para Lista
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/robots')}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            {getStatusIcon(robot.status)}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{robot.name}</h1>
              <p className="text-gray-600">#{robot.serial_number}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {getStatusBadge(robot.status)}
          {robot.tailscale_ip && robot.status === 'online' && (
            <a
              href={`http://${robot.tailscale_ip}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Acessar PiKVM
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Robot Info */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Informações do Robô
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Nome</p>
                  <p className="text-gray-900">{robot.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Número Serial</p>
                  <p className="text-gray-900 font-mono">{robot.serial_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Status</p>
                  <div className="mt-1">{getStatusBadge(robot.status)}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Criado em</p>
                  <p className="text-gray-900">
                    {new Date(robot.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>

            {/* Client Info */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Informações do Cliente
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Nome</p>
                  <p className="text-gray-900">{robot.client_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-gray-900">{robot.client_email}</p>
                </div>
              </div>
            </div>

            {/* Network Info */}
            <div className="card lg:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Informações de Rede
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">IP Local</p>
                  <p className="text-gray-900 font-mono">
                    {robot.local_ip || 'Não configurado'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">IP Tailscale</p>
                  <p className="text-gray-900 font-mono">
                    {robot.tailscale_ip || 'Não configurado'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Proxy Oracle</p>
                  <p className="text-gray-900 font-mono">
                    {robot.oracle_proxy_ip || 'Não configurado'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Diagnósticos
              </h2>
              <button
                onClick={runDiagnostics}
                disabled={diagnosing}
                className="btn-primary"
              >
                {diagnosing ? (
                  <div className="loading-spinner mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {diagnosing ? 'Executando...' : 'Executar Diagnóstico'}
              </button>
            </div>

            {diagnostics.length === 0 ? (
              <div className="card text-center py-8">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhum diagnóstico disponível
                </h3>
                <p className="text-gray-600 mb-4">
                  Execute o primeiro diagnóstico para verificar o status do robô
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {diagnostics.map((diagnostic, index) => (
                  <div key={index} className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-gray-900">
                        Diagnóstico #{diagnostics.length - index}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          diagnostic.overall_status === 'healthy' ? 'bg-green-100 text-green-800' :
                          diagnostic.overall_status === 'issues' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {diagnostic.overall_status === 'healthy' ? 'Saudável' :
                           diagnostic.overall_status === 'issues' ? 'Com Problemas' : 'Desconhecido'}
                        </span>
                        <p className="text-sm text-gray-500">
                          {new Date(diagnostic.timestamp).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    {diagnostic.tests && Object.keys(diagnostic.tests).length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-700">Testes Executados:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.entries(diagnostic.tests).map(([testName, result]) => (
                            <div key={testName} className="flex items-center space-x-2">
                              {result.status === 'pass' || result.status === 'online' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm text-gray-700 capitalize">
                                {testName.replace('_', ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diagnostic.recommendations && diagnostic.recommendations.length > 0 && (
                      <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                        <h4 className="font-medium text-orange-800 mb-2">Recomendações:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {diagnostic.recommendations.map((rec, i) => (
                            <li key={i} className="text-sm text-orange-700">{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'scripts' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Scripts de Configuração
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { type: 'setup', title: 'Setup Inicial', desc: 'Configuração inicial do PiKVM' },
                { type: 'ntp', title: 'Configuração NTP', desc: 'Sincronização de horário automática' },
                { type: 'optimization', title: 'Otimizações', desc: 'Otimizações de performance' },
                { type: 'diagnostic', title: 'Diagnóstico', desc: 'Script de diagnóstico completo' }
              ].map((script) => (
                <div key={script.type} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{script.title}</h3>
                      <p className="text-sm text-gray-600">{script.desc}</p>
                    </div>
                    <Terminal className="h-5 w-5 text-gray-400" />
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => loadScript(script.type)}
                      className="btn-secondary text-sm flex-1"
                    >
                      Visualizar
                    </button>
                    {scripts[script.type] && (
                      <button
                        onClick={() => downloadScript(script.type, scripts[script.type])}
                        className="btn-primary text-sm"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </button>
                    )}
                  </div>

                  {scripts[script.type] && (
                    <div className="mt-4">
                      <div className="code-block max-h-64 overflow-y-auto">
                        <pre><code>{scripts[script.type]}</code></pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Configurações do Robô
            </h2>

            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Configurações Avançadas
              </h3>
              <p className="text-gray-600">
                Funcionalidade em desenvolvimento. Em breve você poderá editar as configurações do robô aqui.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RobotDetails;