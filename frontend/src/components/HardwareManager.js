import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const HardwareManager = ({ user }) => {
    const [devices, setDevices] = useState([]);
    const [showAddDevice, setShowAddDevice] = useState(false);
    const [newDevice, setNewDevice] = useState({
        name: '',
        ip_address: '',
        port: 80,
        username: '',
        password: '',
        use_https: false
    });
    const [loading, setLoading] = useState(false);
    const [deviceStatuses, setDeviceStatuses] = useState({});

    useEffect(() => {
        loadDevices();
        // Check device statuses every 30 seconds
        const interval = setInterval(checkDeviceStatuses, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadDevices = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/devices`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const hardwareDevices = data.filter(device => device.hardware_type === 'real_pikvm');
                setDevices(hardwareDevices);
                checkDeviceStatuses();
            }
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    };

    const checkDeviceStatuses = async () => {
        const token = localStorage.getItem('token');
        const statuses = {};
        
        for (const device of devices) {
            try {
                const response = await fetch(
                    `${process.env.REACT_APP_BACKEND_URL}/api/hardware/devices/${device.id}/status`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                
                if (response.ok) {
                    const status = await response.json();
                    statuses[device.id] = status;
                }
            } catch (error) {
                statuses[device.id] = { status: 'error', connected: false };
            }
        }
        
        setDeviceStatuses(statuses);
    };

    const addDevice = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/hardware/devices`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(newDevice)
                }
            );
            
            if (response.ok) {
                const result = await response.json();
                console.log('Device added:', result);
                
                // Reset form
                setNewDevice({
                    name: '',
                    ip_address: '',
                    port: 80,
                    username: '',
                    password: '',
                    use_https: false
                });
                setShowAddDevice(false);
                
                // Reload devices
                await loadDevices();
            } else {
                const error = await response.json();
                alert(`Error adding device: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error adding device:', error);
            alert('Error adding device. Please check the connection details.');
        } finally {
            setLoading(false);
        }
    };

    const testConnection = async (deviceId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/hardware/devices/${deviceId}/status`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            if (response.ok) {
                const status = await response.json();
                setDeviceStatuses(prev => ({ ...prev, [deviceId]: status }));
                alert(`Connection test: ${status.connected ? 'Success' : 'Failed'}`);
            }
        } catch (error) {
            console.error('Error testing connection:', error);
            alert('Connection test failed');
        }
    };

    const getStatusBadge = (device) => {
        const status = deviceStatuses[device.id];
        
        if (!status) {
            return <Badge variant="secondary">Checking...</Badge>;
        }
        
        if (status.connected) {
            return <Badge className="bg-green-500 text-white">Online</Badge>;
        } else {
            return <Badge variant="destructive">Offline</Badge>;
        }
    };

    const getCapabilitiesBadges = (device) => {
        const status = deviceStatuses[device.id];
        
        if (!status || !status.capabilities) {
            return null;
        }
        
        const capabilities = status.capabilities;
        const capabilityNames = {
            power_control: 'Power',
            hid_control: 'HID',
            video_streaming: 'Video',
            mass_storage: 'Storage',
            webrtc: 'WebRTC'
        };
        
        return (
            <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(capabilities).map(([key, enabled]) => (
                    enabled && (
                        <Badge 
                            key={key} 
                            variant="outline" 
                            className="text-xs"
                        >
                            {capabilityNames[key] || key}
                        </Badge>
                    )
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Hardware PiKVM Devices</h2>
                {user?.role === 'admin' && (
                    <Button 
                        onClick={() => setShowAddDevice(!showAddDevice)}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {showAddDevice ? 'Cancel' : 'Add Device'}
                    </Button>
                )}
            </div>

            {/* Add Device Form */}
            {showAddDevice && (
                <Card className="p-6 bg-gray-800 border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Add Real PiKVM Device</h3>
                    <form onSubmit={addDevice} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Device Name
                                </label>
                                <input
                                    type="text"
                                    value={newDevice.name}
                                    onChange={(e) => setNewDevice(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Production Server"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    IP Address
                                </label>
                                <input
                                    type="text"
                                    value={newDevice.ip_address}
                                    onChange={(e) => setNewDevice(prev => ({ ...prev, ip_address: e.target.value }))}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="192.168.1.100"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Port
                                </label>
                                <input
                                    type="number"
                                    value={newDevice.port}
                                    onChange={(e) => setNewDevice(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="80"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={newDevice.username}
                                    onChange={(e) => setNewDevice(prev => ({ ...prev, username: e.target.value }))}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="admin"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    value={newDevice.password}
                                    onChange={(e) => setNewDevice(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            
                            <div className="flex items-center">
                                <label className="flex items-center text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={newDevice.use_https}
                                        onChange={(e) => setNewDevice(prev => ({ ...prev, use_https: e.target.checked }))}
                                        className="mr-2"
                                    />
                                    Use HTTPS
                                </label>
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <Button 
                                type="submit" 
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {loading ? 'Adding...' : 'Add Device'}
                            </Button>
                            <Button 
                                type="button"
                                onClick={() => setShowAddDevice(false)}
                                variant="outline"
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Device List */}
            <div className="grid gap-4">
                {devices.length === 0 ? (
                    <Card className="p-8 text-center bg-gray-800 border-gray-700">
                        <p className="text-gray-400">No hardware PiKVM devices configured.</p>
                        {user?.role === 'admin' && (
                            <p className="text-sm text-gray-500 mt-2">
                                Click "Add Device" to connect your first real PiKVM device.
                            </p>
                        )}
                    </Card>
                ) : (
                    devices.map(device => (
                        <Card key={device.id} className="p-6 bg-gray-800 border-gray-700">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold text-white">
                                            {device.name}
                                        </h3>
                                        {getStatusBadge(device)}
                                    </div>
                                    
                                    <div className="text-gray-400 space-y-1">
                                        <p>
                                            <span className="font-medium">IP:</span> {device.ip_address}:{device.port}
                                        </p>
                                        <p>
                                            <span className="font-medium">Protocol:</span> {device.use_https ? 'HTTPS' : 'HTTP'}
                                        </p>
                                        {deviceStatuses[device.id]?.last_heartbeat && (
                                            <p>
                                                <span className="font-medium">Last Seen:</span>{' '}
                                                {new Date(deviceStatuses[device.id].last_heartbeat).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    
                                    {getCapabilitiesBadges(device)}
                                </div>
                                
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => testConnection(device.id)}
                                        variant="outline"
                                        size="sm"
                                    >
                                        Test Connection
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default HardwareManager;