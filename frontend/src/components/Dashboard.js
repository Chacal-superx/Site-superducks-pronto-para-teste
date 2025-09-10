import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import FileUpload from './FileUpload';
import HardwareManager from './HardwareManager';
import VideoStreaming from './VideoStreaming';
import axios from 'axios';
import { 
  Monitor, 
  Power, 
  Server, 
  Activity, 
  Upload, 
  Keyboard, 
  Mouse, 
  Play,
  Square,
  RotateCcw,
  Cpu,
  HardDrive,
  Thermometer,
  Settings,
  FileText
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = ({ user, token, onLogout }) => {
  const [devices, setDevices] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('control'); // 'control', 'files', 'settings', 'hardware', 'streaming'

  // Add auth headers to axios requests
  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` }
  };

  useEffect(() => {
    fetchDevices();
    fetchSystemMetrics();
    fetchLogs();
    
    // Set up periodic updates
    const interval = setInterval(() => {
      fetchSystemMetrics();
      fetchLogs();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API}/devices`, authHeaders);
      setDevices(response.data);
      if (response.data.length > 0 && !selectedDevice) {
        setSelectedDevice(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
      if (error.response?.status === 401) {
        onLogout();
      }
    }
  };

  const fetchSystemMetrics = async () => {
    try {
      const response = await axios.get(`${API}/system/metrics`, authHeaders);
      setSystemMetrics(response.data);
    } catch (error) {
      console.error('Error fetching system metrics:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const [powerLogsRes, inputLogsRes] = await Promise.all([
        axios.get(`${API}/logs/power?limit=10`, authHeaders),
        axios.get(`${API}/logs/input?limit=10`, authHeaders)
      ]);
      
      const allLogs = [
        ...powerLogsRes.data.map(log => ({ ...log, type: 'power' })),
        ...inputLogsRes.data.map(log => ({ ...log, type: 'input' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setLogs(allLogs.slice(0, 10));
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const addDevice = async () => {
    const name = prompt('Nome do dispositivo:');
    const ip = prompt('Endereço IP:');
    const location = prompt('Localização (opcional):') || '';
    const description = prompt('Descrição (opcional):') || '';
    
    if (name && ip) {
      try {
        await axios.post(`${API}/devices`, { 
          name, 
          ip_address: ip,
          location,
          description
        }, authHeaders);
        fetchDevices();
      } catch (error) {
        console.error('Error adding device:', error);
        alert('Erro ao adicionar dispositivo');
      }
    }
  };

  const executePowerAction = async (action) => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/power/action`, {
        device_id: selectedDevice.id,
        action: action
      }, authHeaders);
      fetchLogs();
    } catch (error) {
      console.error('Error executing power action:', error);
      alert('Erro ao executar ação de energia');
    }
  };

  const updateDeviceStatus = async (deviceId, status) => {
    try {
      // In a real implementation, this would ping the device or check PiKVM status
      // For demo purposes, we'll update the device status locally
      setDevices(prevDevices => 
        prevDevices.map(device => 
          device.id === deviceId 
            ? { ...device, status: status, last_seen: new Date().toISOString() }
            : device
        )
      );
    } catch (error) {
      console.error('Error updating device status:', error);
    }
  };

  const simulateDeviceStatusChange = () => {
    if (devices.length > 0) {
      const device = devices[0];
      const newStatus = device.status === 'online' ? 'offline' : 'online';
      updateDeviceStatus(device.id, newStatus);
    }
  };

  const sendKeyboardInput = async (keys) => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/input/keyboard`, {
        device_id: selectedDevice.id,
        keys: keys,
        modifiers: []
      }, authHeaders);
      fetchLogs();
    } catch (error) {
      console.error('Error sending keyboard input:', error);
    }
  };

  const resetHID = async () => {
    if (!selectedDevice) return;
    
    try {
      // Send HID reset command
      await axios.post(`${API}/input/keyboard`, {
        device_id: selectedDevice.id,
        keys: 'hid_reset',
        modifiers: []
      }, authHeaders);
      fetchLogs();
      alert('HID Reset sent successfully');
    } catch (error) {
      console.error('Error sending HID reset:', error);
      alert('Error sending HID reset');
    }
  };

  const suggestResolution = (resolution) => {
    if (!selectedDevice) return;
    
    const resolutions = {
      '1920x1080': 'Set to 1920x1080 (Full HD)',
      '1366x768': 'Set to 1366x768 (HD)',
      '1280x1024': 'Set to 1280x1024 (SXGA)',
      '1024x768': 'Set to 1024x768 (XGA)',
      'auto': 'Auto-detect resolution'
    };
    
    if (confirm(`${resolutions[resolution]}?\n\nThis will send the appropriate key combination to change resolution.`)) {
      // Send resolution change command
      sendKeyboardInput(`resolution_${resolution}`);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'online': { variant: 'success', text: 'Online', className: 'bg-green-500 text-white hover:bg-green-600' },
      'offline': { variant: 'destructive', text: 'Offline', className: 'bg-red-500 text-white hover:bg-red-600' },
      'unknown': { variant: 'secondary', text: 'Unknown', className: 'bg-gray-500 text-white hover:bg-gray-600' }
    };
    
    const config = statusConfig[status] || statusConfig['unknown'];
    return (
      <Badge 
        variant={config.variant}
        className={config.className}
      >
        {config.text}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Super Ducks Enterprise Manager</h1>
          <p className="text-gray-600">Central de gestão e controle remoto</p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{devices.length}</div>
              <p className="text-xs text-muted-foreground">
                {devices.filter(d => d.status === 'online').length} online
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {systemMetrics ? `${systemMetrics.cpu_usage.toFixed(1)}%` : '--'}
              </div>
              <p className="text-xs text-muted-foreground">System CPU</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {systemMetrics ? `${systemMetrics.memory_usage.toFixed(1)}%` : '--'}
              </div>
              <p className="text-xs text-muted-foreground">System RAM</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Temperature</CardTitle>
              <Thermometer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {systemMetrics && systemMetrics.temperature ? `${systemMetrics.temperature}°C` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">System temp</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Devices</CardTitle>
                <Button onClick={addDevice} size="sm">Add Device</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
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
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{device.name}</h4>
                        <p className="text-sm text-gray-500">{device.ip_address}</p>
                      </div>
                      {getStatusBadge(device.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Control Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Control Panel</CardTitle>
                <div className="flex space-x-1">
                  <Button
                    variant={activeTab === 'control' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('control')}
                  >
                    <Monitor className="h-4 w-4 mr-1" />
                    Control
                  </Button>
                  <Button
                    variant={activeTab === 'files' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('files')}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Files
                  </Button>
                  <Button
                    variant={activeTab === 'settings' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('settings')}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Settings
                  </Button>
                </div>
              </div>
              {selectedDevice && activeTab === 'control' && (
                <p className="text-sm text-gray-600">
                  Controlling: {selectedDevice.name} ({selectedDevice.ip_address})
                </p>
              )}
            </CardHeader>
            <CardContent>
              {activeTab === 'control' && (
                selectedDevice ? (
                  <div className="space-y-6">
                    {/* Video Stream Placeholder */}
                    <div className="bg-black rounded-lg aspect-video flex items-center justify-center">
                      <div className="text-white text-center">
                        <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm opacity-75">Video Stream</p>
                        <p className="text-xs opacity-50">Connected to {selectedDevice.name}</p>
                      </div>
                    </div>

                    {/* Power Controls */}
                    <div>
                      <h4 className="font-medium mb-3">Power Management</h4>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          onClick={() => executePowerAction('power_on')}
                          variant="outline"
                          size="sm"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Power On
                        </Button>
                        <Button 
                          onClick={() => executePowerAction('power_off')}
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Square className="h-4 w-4 mr-1" />
                          Power Off
                        </Button>
                        <Button 
                          onClick={() => executePowerAction('restart')}
                          variant="outline"
                          size="sm"
                          className="text-orange-600 border-orange-200 hover:bg-orange-50"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restart
                        </Button>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div>
                      <h4 className="font-medium mb-3">Quick Actions</h4>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          onClick={() => sendKeyboardInput('ctrl+alt+del')}
                          variant="outline"
                          size="sm"
                        >
                          <Keyboard className="h-4 w-4 mr-1" />
                          Ctrl+Alt+Del
                        </Button>
                        <Button 
                          onClick={() => sendKeyboardInput('alt+tab')}
                          variant="outline"
                          size="sm"
                        >
                          <Keyboard className="h-4 w-4 mr-1" />
                          Alt+Tab
                        </Button>
                        <Button 
                          onClick={() => sendKeyboardInput('win')}
                          variant="outline"
                          size="sm"
                        >
                          <Keyboard className="h-4 w-4 mr-1" />
                          Windows Key
                        </Button>
                        <Button 
                          onClick={resetHID}
                          variant="outline"
                          size="sm"
                          className="text-purple-600 border-purple-200 hover:bg-purple-50"
                        >
                          <Mouse className="h-4 w-4 mr-1" />
                          Reset HID
                        </Button>
                      </div>
                    </div>

                    {/* Resolution Suggestions */}
                    <div>
                      <h4 className="font-medium mb-3">Resolution Settings</h4>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          onClick={() => suggestResolution('1920x1080')}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          1920x1080
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1366x768')}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          1366x768
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1280x1024')}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          1280x1024
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('1024x768')}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          1024x768
                        </Button>
                        <Button 
                          onClick={() => suggestResolution('auto')}
                          variant="outline"
                          size="sm"
                          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        >
                          Auto Detect
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Server className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">Select a device to start controlling</p>
                  </div>
                )
              )}

              {activeTab === 'files' && (
                <FileUpload />
              )}

              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <Settings className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">Device settings and configuration</p>
                    <p className="text-sm text-gray-500 mt-2">Coming soon...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Log */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-3">
                    {log.type === 'power' ? (
                      <Power className="h-4 w-4 text-orange-500" />
                    ) : (
                      <Activity className="h-4 w-4 text-blue-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {log.type === 'power' 
                          ? `Power action: ${log.action}`
                          : `Input: ${log.keys || `${log.action} at (${log.x}, ${log.y})`}`
                        }
                      </p>
                      <p className="text-xs text-gray-500">
                        Device ID: {log.device_id}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-center py-4 text-gray-500">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;