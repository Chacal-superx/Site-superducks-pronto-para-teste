"""
PiKVM Hardware Integration Module
Real hardware integration for PiKVM devices
"""

import aiohttp
import asyncio
import logging
import base64
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum

logger = logging.getLogger(__name__)

class PiKVMConnectionStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"

class PiKVMDevice(BaseModel):
    id: str
    name: str
    ip_address: str
    port: int = 80
    username: str
    password: str
    use_https: bool = False
    status: PiKVMConnectionStatus = PiKVMConnectionStatus.DISCONNECTED
    last_heartbeat: Optional[datetime] = None
    capabilities: Dict[str, bool] = Field(default_factory=dict)

class PiKVMHardwareManager:
    """Manages real PiKVM hardware connections and operations"""
    
    def __init__(self):
        self.devices: Dict[str, PiKVMDevice] = {}
        self.sessions: Dict[str, aiohttp.ClientSession] = {}
        self.auth_tokens: Dict[str, str] = {}
        
    async def add_device(self, device: PiKVMDevice) -> bool:
        """Add a new PiKVM device"""
        try:
            # Test connection first
            if await self.test_connection(device):
                self.devices[device.id] = device
                logger.info(f"Added PiKVM device: {device.name} ({device.ip_address})")
                return True
            else:
                logger.error(f"Failed to connect to PiKVM device: {device.name} ({device.ip_address})")
                return False
        except Exception as e:
            logger.error(f"Error adding device {device.name}: {str(e)}")
            return False
    
    async def test_connection(self, device: PiKVMDevice) -> bool:
        """Test connection to a PiKVM device"""
        try:
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            async with aiohttp.ClientSession() as session:
                # Test authentication
                auth_url = f"{base_url}/api/auth/check"
                auth = aiohttp.BasicAuth(device.username, device.password)
                
                async with session.get(auth_url, auth=auth, timeout=5) as response:
                    if response.status == 200:
                        device.status = PiKVMConnectionStatus.CONNECTED
                        device.last_heartbeat = datetime.now()
                        
                        # Get device capabilities
                        capabilities = await self.get_device_capabilities(device)
                        device.capabilities = capabilities
                        
                        return True
                    else:
                        device.status = PiKVMConnectionStatus.ERROR
                        return False
                        
        except Exception as e:
            logger.error(f"Connection test failed for {device.name}: {str(e)}")
            device.status = PiKVMConnectionStatus.ERROR
            return False
    
    async def get_device_capabilities(self, device: PiKVMDevice) -> Dict[str, bool]:
        """Get capabilities of a PiKVM device"""
        try:
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            async with aiohttp.ClientSession() as session:
                auth = aiohttp.BasicAuth(device.username, device.password)
                
                # Check various capabilities
                capabilities = {
                    "power_control": False,
                    "hid_control": False,
                    "video_streaming": False,
                    "mass_storage": False,
                    "webrtc": False
                }
                
                # Test ATX (power control)
                try:
                    async with session.get(f"{base_url}/api/atx", auth=auth, timeout=3) as response:
                        if response.status == 200:
                            capabilities["power_control"] = True
                except:
                    pass
                
                # Test HID (keyboard/mouse)
                try:
                    async with session.get(f"{base_url}/api/hid", auth=auth, timeout=3) as response:
                        if response.status == 200:
                            capabilities["hid_control"] = True
                except:
                    pass
                
                # Test video streaming
                try:
                    async with session.get(f"{base_url}/api/streamer", auth=auth, timeout=3) as response:
                        if response.status == 200:
                            capabilities["video_streaming"] = True
                except:
                    pass
                
                # Test mass storage
                try:
                    async with session.get(f"{base_url}/api/msd", auth=auth, timeout=3) as response:
                        if response.status == 200:
                            capabilities["mass_storage"] = True
                except:
                    pass
                
                return capabilities
                
        except Exception as e:
            logger.error(f"Error getting capabilities for {device.name}: {str(e)}")
            return {}
    
    async def authenticate_device(self, device_id: str) -> Optional[str]:
        """Authenticate with a PiKVM device and get session token"""
        try:
            device = self.devices.get(device_id)
            if not device:
                return None
            
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            # Create session if not exists
            if device_id not in self.sessions:
                self.sessions[device_id] = aiohttp.ClientSession()
            
            session = self.sessions[device_id]
            auth = aiohttp.BasicAuth(device.username, device.password)
            
            # Get authentication token if needed
            async with session.post(f"{base_url}/api/auth/login", auth=auth) as response:
                if response.status == 200:
                    data = await response.json()
                    token = data.get("access_token")
                    if token:
                        self.auth_tokens[device_id] = token
                        return token
            
            # Fallback to basic auth
            return "basic_auth"
            
        except Exception as e:
            logger.error(f"Authentication failed for device {device_id}: {str(e)}")
            return None
    
    async def power_action(self, device_id: str, action: str) -> Dict[str, Any]:
        """Execute power action on PiKVM device"""
        try:
            device = self.devices.get(device_id)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            if not device.capabilities.get("power_control", False):
                raise ValueError(f"Device {device_id} does not support power control")
            
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            session = self.sessions.get(device_id)
            if not session:
                await self.authenticate_device(device_id)
                session = self.sessions.get(device_id)
            
            auth = aiohttp.BasicAuth(device.username, device.password)
            
            # Map actions to PiKVM ATX commands
            action_map = {
                "power_on": "power_on",
                "power_off": "power_off_hard",
                "restart": "power_reset_hard",
                "reset": "power_reset_hard",
                "sleep": "power_off"
            }
            
            pikvm_action = action_map.get(action, action)
            
            payload = {"action": pikvm_action}
            
            async with session.post(f"{base_url}/api/atx", 
                                  auth=auth, 
                                  json=payload) as response:
                
                if response.status == 200:
                    result = await response.json()
                    return {
                        "success": True,
                        "action": action,
                        "device_id": device_id,
                        "pikvm_response": result,
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"HTTP {response.status}: {error_text}",
                        "action": action,
                        "device_id": device_id
                    }
                    
        except Exception as e:
            logger.error(f"Power action {action} failed for device {device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "action": action,
                "device_id": device_id
            }
    
    async def send_keyboard_input(self, device_id: str, keys: List[str], modifiers: List[str] = None) -> Dict[str, Any]:
        """Send keyboard input to PiKVM device"""
        try:
            device = self.devices.get(device_id)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            if not device.capabilities.get("hid_control", False):
                raise ValueError(f"Device {device_id} does not support HID control")
            
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            session = self.sessions.get(device_id)
            if not session:
                await self.authenticate_device(device_id)
                session = self.sessions.get(device_id)
            
            auth = aiohttp.BasicAuth(device.username, device.password)
            
            # Build HID payload
            payload = {
                "keys": keys,
                "modifiers": modifiers or []
            }
            
            async with session.post(f"{base_url}/api/hid/keyboard", 
                                  auth=auth, 
                                  json=payload) as response:
                
                if response.status == 200:
                    result = await response.json()
                    return {
                        "success": True,
                        "keys": keys,
                        "modifiers": modifiers,
                        "device_id": device_id,
                        "pikvm_response": result,
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"HTTP {response.status}: {error_text}",
                        "keys": keys,
                        "device_id": device_id
                    }
                    
        except Exception as e:
            logger.error(f"Keyboard input failed for device {device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "keys": keys,
                "device_id": device_id
            }
    
    async def send_mouse_input(self, device_id: str, x: int, y: int, buttons: List[str] = None, scroll: int = 0) -> Dict[str, Any]:
        """Send mouse input to PiKVM device"""
        try:
            device = self.devices.get(device_id)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            if not device.capabilities.get("hid_control", False):
                raise ValueError(f"Device {device_id} does not support HID control")
            
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            session = self.sessions.get(device_id)
            if not session:
                await self.authenticate_device(device_id)
                session = self.sessions.get(device_id)
            
            auth = aiohttp.BasicAuth(device.username, device.password)
            
            # Build HID payload
            payload = {
                "x": x,
                "y": y,
                "buttons": buttons or [],
                "scroll": scroll
            }
            
            async with session.post(f"{base_url}/api/hid/mouse", 
                                  auth=auth, 
                                  json=payload) as response:
                
                if response.status == 200:
                    result = await response.json()
                    return {
                        "success": True,
                        "x": x,
                        "y": y,
                        "buttons": buttons,
                        "scroll": scroll,
                        "device_id": device_id,
                        "pikvm_response": result,
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"HTTP {response.status}: {error_text}",
                        "device_id": device_id
                    }
                    
        except Exception as e:
            logger.error(f"Mouse input failed for device {device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "device_id": device_id
            }
    
    async def get_video_snapshot(self, device_id: str) -> Dict[str, Any]:
        """Get video snapshot from PiKVM device"""
        try:
            device = self.devices.get(device_id)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            if not device.capabilities.get("video_streaming", False):
                raise ValueError(f"Device {device_id} does not support video streaming")
            
            protocol = "https" if device.use_https else "http"
            base_url = f"{protocol}://{device.ip_address}:{device.port}"
            
            session = self.sessions.get(device_id)
            if not session:
                await self.authenticate_device(device_id)
                session = self.sessions.get(device_id)
            
            auth = aiohttp.BasicAuth(device.username, device.password)
            
            async with session.get(f"{base_url}/api/streamer/snapshot", 
                                 auth=auth, 
                                 params={"preview": "1", "preview_quality": "80"}) as response:
                
                if response.status == 200:
                    image_data = await response.read()
                    image_base64 = base64.b64encode(image_data).decode('utf-8')
                    
                    return {
                        "success": True,
                        "device_id": device_id,
                        "image_data": image_base64,
                        "content_type": response.headers.get("content-type", "image/jpeg"),
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "error": f"HTTP {response.status}: {error_text}",
                        "device_id": device_id
                    }
                    
        except Exception as e:
            logger.error(f"Video snapshot failed for device {device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "device_id": device_id
            }
    
    async def get_device_status(self, device_id: str) -> Dict[str, Any]:
        """Get comprehensive status of PiKVM device"""
        try:
            device = self.devices.get(device_id)
            if not device:
                raise ValueError(f"Device {device_id} not found")
            
            # Update connection status
            await self.test_connection(device)
            
            return {
                "device_id": device_id,
                "name": device.name,
                "ip_address": device.ip_address,
                "status": device.status.value,
                "last_heartbeat": device.last_heartbeat.isoformat() if device.last_heartbeat else None,
                "capabilities": device.capabilities,
                "connected": device.status == PiKVMConnectionStatus.CONNECTED
            }
            
        except Exception as e:
            logger.error(f"Status check failed for device {device_id}: {str(e)}")
            return {
                "device_id": device_id,
                "status": "error",
                "error": str(e),
                "connected": False
            }
    
    async def cleanup(self):
        """Clean up sessions and connections"""
        for session in self.sessions.values():
            await session.close()
        self.sessions.clear()
        self.auth_tokens.clear()

# Global hardware manager instance
pikvm_hardware_manager = PiKVMHardwareManager()