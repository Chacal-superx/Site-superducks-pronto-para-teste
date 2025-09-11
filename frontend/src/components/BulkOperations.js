import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Download, 
  Play, 
  FileText, 
  Monitor,
  CheckCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { apiService } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const BulkOperations = () => {
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [operations, setOperations] = useState({
    diagnosing: false,
    exporting: false
  });

  useEffect(() => {
    loadRobots();
  }, []);

  const loadRobots = async () => {
    try {
      const response = await apiService.getRobots();
      setRobots(response.data);
    } catch (error) {
      toast.error('Erro ao carregar robôs');
      console.error('Error loading robots:', error);
    } finally {
      setLoading(false);
    }
  };

  const runBulkDiagnostics = async () => {
    setOperations(prev => ({ ...prev, diagnosing: true }));
    try {
      await apiService.diagnoseAllRobots();
      toast.success(`Diagnóstico iniciado para ${robots.length} robôs!`);
    } catch (error) {
      toast.error('Erro ao executar diagnósticos em lote');
      console.error('Error running bulk diagnostics:', error);
    } finally {
      setOperations(prev => ({ ...prev, diagnosing: false }));
    }
  };

  const exportAllConfigurations = async () => {
    setOperations(prev => ({ ...prev, exporting: true }));
    try {
      const response = await apiService.exportAllConfigurations();
      const data = response.data;
      
      // Create and download zip file content as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pikvm-configurations-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Configurações exportadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar configurações');
      console.error('Error exporting configurations:', error);
    } finally {
      setOperations(prev => ({ ...prev, exporting: false }));
    }
  };

  const generateBulkSetupGuide = () => {
    const guide = `# Guia de Setup em Lote - PiKVM SuperDucks
# Gerado em: ${new Date().toLocaleString('pt-BR')}
# Total de robôs: ${robots.length}

## Pré-requisitos
- ${robots.length} Raspberry Pi 4 com cartões SD
- Acesso à internet em todos os dispositivos
- Chave Tailscale: tskey-auth-kpAsuRYnf511CNTRL-WgGBbuo9n7E33CSF88Aw7EomcF5hv3VG

## Lista de Robôs para Setup

${robots.map((robot, index) => `
### ${index + 1}. ${robot.name}
- **Serial:** ${robot.serial_number}
- **Cliente:** ${robot.client_name}
- **Email:** ${robot.client_email}
- **Status:** ${robot.status}
${robot.local_ip ? `- **IP Local:** ${robot.local_ip}` : ''}
${robot.tailscale_ip ? `- **IP Tailscale:** ${robot.tailscale_ip}` : ''}

**Comandos de setup:**
\`\`\`bash
# 1. Configurar NTP
rw
timedatectl set-timezone America/Sao_Paulo
systemctl enable systemd-timesyncd
systemctl restart systemd-timesyncd
timedatectl set-ntp true
ro

# 2. Instalar Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-auth-kpAsuRYnf511CNTRL-WgGBbuo9n7E33CSF88Aw7EomcF5hv3VG --hostname=pikvm-${robot.serial_number}

# 3. Verificar setup
/root/pikvm_ready.sh
\`\`\`
`).join('')}

## Comandos de Verificação em Lote

### Testar todos os robôs via Tailscale:
${robots.filter(r => r.tailscale_ip).map(robot => 
  `ping -c 2 ${robot.tailscale_ip} # ${robot.name}`
).join('\n')}

### Acessar interfaces web:
${robots.filter(r => r.tailscale_ip).map(robot => 
  `# ${robot.name}: http://${robot.tailscale_ip}`
).join('\n')}

## Checklist de Validação

Para cada robô, verificar:
- [ ] PiKVM acessível via web
- [ ] Tailscale conectado
- [ ] Horário sincronizado
- [ ] Streaming funcionando
- [ ] Controle de mouse/teclado funcionando

## Próximos Passos

1. Executar diagnósticos via dashboard
2. Configurar proxy Oracle se necessário
3. Entregar aos clientes com credenciais
4. Agendar monitoramento remoto

---
Gerado pelo PiKVM Manager - SuperDucks
`;

    const blob = new Blob([guide], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pikvm-bulk-setup-guide-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Guia de setup baixado!');
  };

  const getStatusStats = () => {
    const stats = robots.reduce((acc, robot) => {
      acc[robot.status] = (acc[robot.status] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total: robots.length,
      online: stats.online || 0,
      offline: stats.offline || 0,
      error: stats.error || 0,
      configuring: stats.configuring || 0
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Carregando operações..." />
      </div>
    );
  }

  const stats = getStatusStats();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Operações em Lote</h1>
        <p className="text-gray-600 mt-1">
          Execute operações em todos os robôs simultaneamente
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card text-center">
          <Monitor className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-600">Total de Robôs</p>
        </div>
        
        <div className="card text-center">
          <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.online}</p>
          <p className="text-sm text-gray-600">Online</p>
        </div>
        
        <div className="card text-center">
          <AlertTriangle className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.error}</p>
          <p className="text-sm text-gray-600">Com Problemas</p>
        </div>
        
        <div className="card text-center">
          <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.configuring}</p>
          <p className="text-sm text-gray-600">Configurando</p>
        </div>
      </div>

      {/* Main Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Diagnostics */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Play className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Diagnóstico em Lote
              </h2>
              <p className="text-gray-600">
                Execute diagnósticos em todos os robôs
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Esta operação irá executar diagnósticos completos em todos os {robots.length} robôs 
              registrados no sistema. O processo pode levar alguns minutos.
            </p>
            
            <button
              onClick={runBulkDiagnostics}
              disabled={operations.diagnosing || robots.length === 0}
              className="btn-primary w-full"
            >
              {operations.diagnosing ? (
                <>
                  <div className="loading-spinner mr-2" />
                  Executando Diagnósticos...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Executar Diagnóstico em {robots.length} Robôs
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export Configurations */}
        <div className="card">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-green-100 p-2 rounded-lg">
              <Download className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Exportar Configurações
              </h2>
              <p className="text-gray-600">
                Baixe todas as configurações e scripts
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Exporte todas as configurações, scripts de setup e dados dos robôs 
              em um arquivo para backup ou distribuição.
            </p>
            
            <button
              onClick={exportAllConfigurations}
              disabled={operations.exporting || robots.length === 0}
              className="btn-success w-full"
            >
              {operations.exporting ? (
                <>
                  <div className="loading-spinner mr-2" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Todas as Configurações
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Setup Guide */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-purple-100 p-2 rounded-lg">
            <FileText className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Guia de Setup em Lote
            </h2>
            <p className="text-gray-600">
              Gere um guia completo para configurar todos os robôs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">O que está incluído:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Lista completa de todos os robôs</li>
              <li>• Scripts de configuração individual</li>
              <li>• Comandos de verificação</li>
              <li>• Checklist de validação</li>
              <li>• Instruções passo a passo</li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Ideal para:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Setup de múltiplos robôs</li>
              <li>• Treinamento de técnicos</li>
              <li>• Documentação de processos</li>
              <li>• Validação de configurações</li>
            </ul>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={generateBulkSetupGuide}
            disabled={robots.length === 0}
            className="btn-secondary"
          >
            <FileText className="h-4 w-4 mr-2" />
            Gerar Guia de Setup ({robots.length} robôs)
          </button>
        </div>
      </div>

      {/* Recent Operations Log */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Log de Operações Recentes
        </h2>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Sistema inicializado</p>
              <p className="text-xs text-gray-500">
                {robots.length} robôs carregados com sucesso
              </p>
            </div>
            <p className="text-xs text-gray-400">
              {new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkOperations;