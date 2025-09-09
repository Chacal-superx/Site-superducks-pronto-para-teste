import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import axios from 'axios';
import { 
  Monitor, 
  Power, 
  Server, 
  Play,
  Square,
  RotateCcw,
  Keyboard,
  Mouse,
  LogOut,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UserDashboard = ({ user, token, onLogout }) => {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchUserDevices();
    // Update every 10 seconds
    const interval = setInterval(fetchUserDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      fetchLogs();
      // Update logs every 5 seconds
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedDevice]);

  const fetchUserDevices = async () => {
    try {
      const response = await axios.get(`${API}/devices`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDevices(response.data);
      
      // Auto-select first device if none selected
      if (response.data.length > 0 && !selectedDevice) {
        setSelectedDevice(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const [powerLogsRes, inputLogsRes] = await Promise.all([
        axios.get(`${API}/logs/power?limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/logs/input?limit=5`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      const allLogs = [
        ...powerLogsRes.data.map(log => ({ ...log, type: 'power' })),
        ...inputLogsRes.data.map(log => ({ ...log, type: 'input' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setLogs(allLogs.slice(0, 5));
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const executePowerAction = async (action) => {
    if (!selectedDevice) return;
    
    setLoading(true);
    try {
      await axios.post(`${API}/power/action`, {
        device_id: selectedDevice.id,
        action: action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      fetchLogs();
    } catch (error) {
      console.error('Error executing power action:', error);
      alert('Erro ao executar ação de energia');
    } finally {
      setLoading(false);
    }
  };

  const sendKeyboardInput = async (keys) => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/input/keyboard`, {
        device_id: selectedDevice.id,
        keys: keys,
        modifiers: []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      fetchLogs();
    } catch (error) {
      console.error('Error sending keyboard input:', error);
      alert('Erro ao enviar comando de teclado');
    }
  };

  const resetHID = async () => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/input/keyboard`, {
        device_id: selectedDevice.id,
        keys: 'hid_reset',
        modifiers: []
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      fetchLogs();
      alert('HID Reset enviado com sucesso');
    } catch (error) {
      console.error('Error sending HID reset:', error);
      alert('Erro ao resetar HID');
    }
  };

  const suggestResolution = (resolution) => {
    if (!selectedDevice) return;
    
    const resolutions = {
      '1920x1080': 'Definir para 1920x1080 (Full HD)',
      '1366x768': 'Definir para 1366x768 (HD)',
      '1280x1024': 'Definir para 1280x1024 (SXGA)',
      '1024x768': 'Definir para 1024x768 (XGA)',
      'auto': 'Detectar resolução automaticamente'
    };
    
    if (confirm(`${resolutions[resolution]}?\n\nIsso enviará a combinação de teclas apropriada para alterar a resolução.`)) {
      sendKeyboardInput(`resolution_${resolution}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    onLogout();
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'online': { variant: 'success', text: 'Online', icon: Wifi, className: 'bg-green-500 text-white' },
      'offline': { variant: 'destructive', text: 'Offline', icon: WifiOff, className: 'bg-red-500 text-white' },
      'unknown': { variant: 'secondary', text: 'Desconhecido', icon: Server, className: 'bg-gray-500 text-white' }
    };
    
    const config = statusConfig[status] || statusConfig['unknown'];
    const IconComponent = config.icon;
    
    return (
      <Badge className={config.className}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.text}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <img 
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xNSAyNUwxNSAxNUwyNSAxNUwyNSAyNUwxNSAyNVoiIGZpbGw9IiMxRjJBNDciLz4KPC9zdmc+Cg=="
                  alt="SuperDucks" 
                  className="h-5 w-5"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Super Ducks Manager</h1>
                <p className="text-sm text-gray-500">Acesso Remoto</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{user.username}</span>
                <Badge variant="outline" className="text-xs">
                  {user.role.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              
              <Button 
                onClick={handleLogout}
                variant="outline"
                size="sm"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {devices.length === 0 ? (
          /* No Devices Available */
          <Card className="text-center py-12">
            <CardContent>
              <Server className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum dispositivo disponível
              </h3>
              <p className="text-gray-500">
                Entre em contato com o administrador para obter acesso aos dispositivos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Device Selector */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Dispositivos Disponíveis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {devices.map(device => (
                      <div
                        key={device.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedDevice?.id === device.id 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedDevice(device)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">{device.name}</h4>
                          {getStatusBadge(device.status)}
                        </div>
                        <p className="text-xs text-gray-500">{device.ip_address}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">Atividade Recente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {logs.map((log, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                        {log.type === 'power' ? (
                          <Power className="h-3 w-3 text-orange-500" />
                        ) : (
                          <Keyboard className="h-3 w-3 text-blue-500" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">
                            {log.type === 'power' 
                              ? `${log.action}`
                              : `${log.keys || log.action}`
                            }
                          </p>
                          <p className="text-gray-500">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">
                        Nenhuma atividade recente
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Control Area */}
            <div className="lg:col-span-3">
              {selectedDevice ? (
                <div className="space-y-6">
                  {/* Video Stream */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>
                          {selectedDevice.name} - Controle Remoto
                        </CardTitle>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">{selectedDevice.ip_address}</span>
                          {getStatusBadge(selectedDevice.status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Video Stream Placeholder - Replace with actual stream */}
                      <div className="bg-black rounded-lg aspect-video flex items-center justify-center mb-4">
                        <div className="text-white text-center">
                          <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                          <p className="text-lg opacity-75">Stream de Vídeo</p>
                          <p className="text-sm opacity-50">Conectado ao {selectedDevice.name}</p>
                          <p className="text-xs opacity-40 mt-2">
                            Em breve: Stream ao vivo da tela remota
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Control Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Power Management */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Gerenciamento de Energia</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            onClick={() => executePowerAction('power_on')}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Ligar
                          </Button>
                          <Button 
                            onClick={() => executePowerAction('power_off')}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            <Square className="h-4 w-4 mr-2" />
                            Desligar
                          </Button>
                          <Button 
                            onClick={() => executePowerAction('restart')}
                            disabled={loading}
                            className="bg-orange-600 hover:bg-orange-700 text-white col-span-2"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reiniciar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Quick Actions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Ações Rápidas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            onClick={() => sendKeyboardInput('ctrl+alt+del')}
                            variant="outline"
                            className="text-sm"
                          >
                            <Keyboard className="h-4 w-4 mr-1" />
                            Ctrl+Alt+Del
                          </Button>
                          <Button 
                            onClick={() => sendKeyboardInput('alt+tab')}
                            variant="outline"
                            className="text-sm"
                          >
                            <Keyboard className="h-4 w-4 mr-1" />
                            Alt+Tab
                          </Button>
                          <Button 
                            onClick={() => sendKeyboardInput('win')}
                            variant="outline"
                            className="text-sm"
                          >
                            <Keyboard className="h-4 w-4 mr-1" />
                            Windows
                          </Button>
                          <Button 
                            onClick={resetHID}
                            variant="outline"
                            className="text-sm text-purple-600 border-purple-200 hover:bg-purple-50"
                          >
                            <Mouse className="h-4 w-4 mr-1" />
                            Reset HID
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Resolution Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Configurações de Resolução</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Button 
                          onClick={() => suggestResolution('1920x1080')}
                          variant="outline"
                          className="text-sm"
                        >
                          1920x1080
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1366x768')}
                          variant="outline"
                          className="text-sm"
                        >
                          1366x768
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1280x1024')}
                          variant="outline"
                          className="text-sm"
                        >
                          1280x1024
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1024x768')}
                          variant="outline"
                          className="text-sm"
                        >
                          1024x768
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('auto')}
                          variant="outline"
                          className="text-sm text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        >
                          Auto Detect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="text-center py-12">
                  <CardContent>
                    <Monitor className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Selecione um dispositivo
                    </h3>
                    <p className="text-gray-500">
                      Escolha um dispositivo da lista à esquerda para começar o controle remoto.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;