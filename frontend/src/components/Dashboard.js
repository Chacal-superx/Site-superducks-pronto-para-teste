import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import FileUpload from './FileUpload';
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

const Dashboard = () => {
  const [devices, setDevices] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('control'); // 'control', 'files', 'settings'

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
      const response = await axios.get(`${API}/devices`);
      setDevices(response.data);
      if (response.data.length > 0 && !selectedDevice) {
        setSelectedDevice(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  const fetchSystemMetrics = async () => {
    try {
      const response = await axios.get(`${API}/system/metrics`);
      setSystemMetrics(response.data);
    } catch (error) {
      console.error('Error fetching system metrics:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const [powerLogsRes, inputLogsRes] = await Promise.all([
        axios.get(`${API}/logs/power?limit=10`),
        axios.get(`${API}/logs/input?limit=10`)
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
    const name = prompt('Device name:');
    const ip = prompt('IP Address:');
    
    if (name && ip) {
      try {
        await axios.post(`${API}/devices`, { name, ip_address: ip });
        fetchDevices();
      } catch (error) {
        console.error('Error adding device:', error);
        alert('Error adding device');
      }
    }
  };

  const executePowerAction = async (action) => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/power/action`, {
        device_id: selectedDevice.id,
        action: action
      });
      fetchLogs();
    } catch (error) {
      console.error('Error executing power action:', error);
      alert('Error executing power action');
    }
  };

  const sendKeyboardInput = async (keys) => {
    if (!selectedDevice) return;
    
    try {
      await axios.post(`${API}/input/keyboard`, {
        device_id: selectedDevice.id,
        keys: keys,
        modifiers: []
      });
      fetchLogs();
    } catch (error) {
      console.error('Error sending keyboard input:', error);
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'online': { variant: 'success', text: 'Online' },
      'offline': { variant: 'destructive', text: 'Offline' },
      'unknown': { variant: 'secondary', text: 'Unknown' }
    };
    
    const config = statusConfig[status] || statusConfig['unknown'];
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">PiKVM Enterprise Manager</h1>
          <p className="text-gray-600">Remote device management and control center</p>
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
              <CardTitle>Control Panel</CardTitle>
              {selectedDevice && (
                <p className="text-sm text-gray-600">
                  Controlling: {selectedDevice.name} ({selectedDevice.ip_address})
                </p>
              )}
            </CardHeader>
            <CardContent>
              {selectedDevice ? (
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
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Server className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">Select a device to start controlling</p>
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