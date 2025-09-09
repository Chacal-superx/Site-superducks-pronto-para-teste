"""
Super Ducks Integration Layer - Handles communication with actual Super Ducks devices
"""
import aiohttp
import asyncio
from typing import Optional, Dict, List, Any
import base64
import json
from datetime import datetime
import logging
from motor.motor_asyncio import AsyncIOMotorClient
import os

logger = logging.getLogger(__name__)

# Database connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

class PiKVMDevice:
    def __init__(self, device_id: str, ip_address: str, username: str = "admin", password: str = "admin"):
        self.device_id = device_id
        self.ip_address = ip_address
        self.username = username  
        self.password = password
        self.base_url = f"http://{ip_address}"
        self.session = None
        self.auth_header = None
        
    async def _get_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()
            # Create basic auth header
            credentials = f"{self.username}:{self.password}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            self.auth_header = {"Authorization": f"Basic {encoded_credentials}"}
        return self.session
    
    async def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """Make HTTP request to PiKVM device"""
        session = await self._get_session()
        url = f"{self.base_url}{endpoint}"
        
        try:
            headers = kwargs.pop('headers', {})
            headers.update(self.auth_header)
            
            async with session.request(method, url, headers=headers, timeout=30, **kwargs) as response:
                if response.status == 200:
                    if response.content_type == 'application/json':
                        return await response.json()
                    else:
                        return {"status": "success", "data": await response.text()}
                else:
                    logger.error(f"PiKVM request failed: {response.status} - {await response.text()}")
                    return None
        except asyncio.TimeoutError:
            logger.error(f"Timeout connecting to PiKVM {self.ip_address}")
            return None
        except Exception as e:
            logger.error(f"Error connecting to PiKVM {self.ip_address}: {str(e)}")
            return None
    
    async def get_info(self) -> Optional[Dict]:
        """Get PiKVM device information"""
        return await self._make_request("GET", "/api/info")
    
    async def get_hw_info(self) -> Optional[Dict]:
        """Get hardware information"""
        return await self._make_request("GET", "/api/hw")
    
    async def power_action(self, action: str) -> bool:
        """Execute power action (on, off, reset_hard, reset_soft)"""
        valid_actions = ["on", "off", "reset_hard", "reset_soft"]
        if action not in valid_actions:
            return False
        
        data = {"action": action}
        response = await self._make_request("POST", "/api/atx/power", json=data)
        return response is not None
    
    async def send_key(self, key: str, state: bool = True) -> bool:
        """Send keyboard key"""
        data = {"key": key, "state": state}
        response = await self._make_request("POST", "/api/hid/events/sendkey", json=data)
        return response is not None
    
    async def send_key_combination(self, keys: List[str]) -> bool:
        """Send key combination (e.g., ['ctrl', 'alt', 'del'])"""
        # Press keys down
        for key in keys:
            await self.send_key(key, True)
            await asyncio.sleep(0.01)
        
        # Release keys
        for key in reversed(keys):
            await self.send_key(key, False)
            await asyncio.sleep(0.01)
        
        return True
    
    async def send_mouse_move(self, x: int, y: int) -> bool:
        """Send mouse movement"""
        data = {"to": {"x": x, "y": y}}
        response = await self._make_request("POST", "/api/hid/events/mouse/move", json=data)
        return response is not None
    
    async def send_mouse_click(self, button: str = "left", state: bool = True) -> bool:
        """Send mouse click"""
        data = {"button": button, "state": state}
        response = await self._make_request("POST", "/api/hid/events/mouse/button", json=data)
        return response is not None
    
    async def reset_hid(self) -> bool:
        """Reset HID (keyboard/mouse)"""
        response = await self._make_request("POST", "/api/hid/reset")
        return response is not None
    
    async def get_stream_url(self) -> str:
        """Get video stream URL"""
        return f"{self.base_url}/api/streamer/stream"
    
    async def set_streamer_params(self, quality: int = 80, fps: int = 30) -> bool:
        """Set video streaming parameters"""
        data = {"quality": quality, "fps": fps}
        response = await self._make_request("POST", "/api/streamer/set_params", json=data)
        return response is not None
    
    async def mount_iso(self, iso_path: str) -> bool:
        """Mount ISO file"""
        data = {"image": iso_path}
        response = await self._make_request("POST", "/api/msd/set_image", json=data)
        return response is not None
    
    async def get_status(self) -> Dict[str, Any]:
        """Get comprehensive device status"""
        try:
            info = await self.get_info()
            hw_info = await self.get_hw_info()
            
            status = {
                "online": info is not None,
                "timestamp": datetime.utcnow().isoformat(),
                "info": info,
                "hardware": hw_info
            }
            
            return status
        except Exception as e:
            logger.error(f"Error getting status for {self.device_id}: {str(e)}")
            return {
                "online": False,
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
    
    async def close(self):
        """Close the session"""
        if self.session:
            await self.session.close()

class PiKVMManager:
    def __init__(self):
        self.devices: Dict[str, PiKVMDevice] = {}
    
    async def register_device(self, device_id: str, ip_address: str, username: str = "admin", password: str = "admin"):
        """Register a new PiKVM device"""
        device = PiKVMDevice(device_id, ip_address, username, password)
        self.devices[device_id] = device
        
        # Update device status in database
        await self._update_device_status(device_id)
    
    async def _update_device_status(self, device_id: str):
        """Update device status in database"""
        if device_id not in self.devices:
            return
        
        device = self.devices[device_id]
        status = await device.get_status()
        
        await db.devices.update_one(
            {"id": device_id},
            {
                "$set": {
                    "status": "online" if status["online"] else "offline",
                    "last_seen": datetime.utcnow(),
                    "last_status": status
                }
            }
        )
    
    async def execute_power_action(self, device_id: str, action: str) -> bool:
        """Execute power action on device"""
        if device_id not in self.devices:
            return False
        
        device = self.devices[device_id]
        
        # Map our actions to PiKVM actions
        action_map = {
            "power_on": "on",
            "power_off": "off", 
            "restart": "reset_soft",
            "reset": "reset_hard"
        }
        
        pikvm_action = action_map.get(action)
        if not pikvm_action:
            return False
        
        return await device.power_action(pikvm_action)
    
    async def send_keyboard_input(self, device_id: str, keys: str, modifiers: List[str] = None) -> bool:
        """Send keyboard input to device"""
        if device_id not in self.devices:
            return False
        
        device = self.devices[device_id]
        
        # Handle special key combinations
        if keys == "ctrl+alt+del":
            return await device.send_key_combination(["ctrl", "alt", "del"])
        elif keys == "alt+tab":
            return await device.send_key_combination(["alt", "tab"])
        elif keys == "win":
            return await device.send_key("cmd", True) and await device.send_key("cmd", False)
        elif keys == "hid_reset":
            return await device.reset_hid()
        elif keys.startswith("resolution_"):
            # Handle resolution changes (implementation depends on target OS)
            return await self._change_resolution(device, keys.replace("resolution_", ""))
        else:
            # Send individual key
            return await device.send_key(keys, True) and await device.send_key(keys, False)
    
    async def _change_resolution(self, device: PiKVMDevice, resolution: str) -> bool:
        """Change screen resolution (basic implementation)"""
        # This is a simplified implementation - actual resolution change
        # would depend on the target operating system
        if resolution == "auto":
            # Send Windows+P for display settings
            return await device.send_key_combination(["cmd", "p"])
        else:
            # Send combination to open display settings
            return await device.send_key_combination(["cmd", "i"])
    
    async def send_mouse_input(self, device_id: str, x: int, y: int, button: str = None, action: str = "move") -> bool:
        """Send mouse input to device"""
        if device_id not in self.devices:
            return False
        
        device = self.devices[device_id]
        
        if action == "move":
            return await device.send_mouse_move(x, y)
        elif action == "click" and button:
            await device.send_mouse_move(x, y)
            return await device.send_mouse_click(button, True) and await device.send_mouse_click(button, False)
        
        return False
    
    async def get_device_status(self, device_id: str) -> Optional[Dict]:
        """Get device status"""
        if device_id not in self.devices:
            return None
        
        device = self.devices[device_id]
        return await device.get_status()
    
    async def get_stream_url(self, device_id: str) -> Optional[str]:
        """Get video stream URL for device"""
        if device_id not in self.devices:
            return None
        
        device = self.devices[device_id]
        return await device.get_stream_url()
    
    async def discover_devices(self, ip_range: str = "192.168.1.0/24") -> List[Dict]:
        """Discover PiKVM devices on network (basic implementation)"""
        # This is a simplified implementation
        # In production, you'd implement proper network scanning
        discovered = []
        
        # For now, return empty list - manual registration required
        return discovered
    
    async def cleanup(self):
        """Clean up all device connections"""
        for device in self.devices.values():
            await device.close()
        self.devices.clear()

# Global manager instance
pikvm_manager = PiKVMManager()