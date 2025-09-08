from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import json
import asyncio
import subprocess
import psutil
import aiofiles
from enum import Enum


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="PiKVM Enterprise Manager", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Enums
class PowerAction(str, Enum):
    POWER_ON = "power_on"
    POWER_OFF = "power_off"
    RESTART = "restart"
    RESET = "reset"
    SLEEP = "sleep"

class DeviceStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

# Enhanced Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class Device(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ip_address: str
    status: DeviceStatus = DeviceStatus.UNKNOWN
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    temperature: Optional[float] = None
    
class DeviceCreate(BaseModel):
    name: str
    ip_address: str

class PowerActionRequest(BaseModel):
    device_id: str
    action: PowerAction

class KeyboardInput(BaseModel):
    device_id: str
    keys: str
    modifiers: Optional[List[str]] = []

class MouseInput(BaseModel):
    device_id: str
    x: int
    y: int
    button: Optional[str] = None
    action: str  # click, move, scroll

class SystemMetrics(BaseModel):
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    temperature: Optional[float] = None
    uptime: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Basic Routes
@api_router.get("/")
async def root():
    return {"message": "PiKVM Enterprise Manager API", "version": "1.0.0"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Device Management Routes
@api_router.post("/devices", response_model=Device)
async def create_device(device: DeviceCreate):
    device_obj = Device(**device.dict())
    await db.devices.insert_one(device_obj.dict())
    return device_obj

@api_router.get("/devices", response_model=List[Device])
async def get_devices():
    devices = await db.devices.find({}, {"_id": 0}).to_list(1000)
    return [Device(**device) for device in devices]

@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str):
    device = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return Device(**device)

@api_router.put("/devices/{device_id}/status")
async def update_device_status(device_id: str, status: DeviceStatus):
    """Update device status"""
    result = await db.devices.update_one(
        {"id": device_id}, 
        {"$set": {"status": status, "last_seen": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {"message": f"Device status updated to {status}"}

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str):
    result = await db.devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted successfully"}

# Power Management Routes
@api_router.post("/power/action")
async def execute_power_action(request: PowerActionRequest):
    """Execute power action on a device"""
    # In a real implementation, this would communicate with the actual PiKVM device
    device = await db.devices.find_one({"id": request.device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Simulate power action (in real implementation, use PiKVM APIs)
    action_log = {
        "id": str(uuid.uuid4()),
        "device_id": request.device_id,
        "action": request.action,
        "timestamp": datetime.utcnow(),
        "status": "success"
    }
    
    await db.power_logs.insert_one(action_log)
    await manager.broadcast(json.dumps({
        "type": "power_action",
        "device_id": request.device_id,
        "action": request.action,
        "timestamp": action_log["timestamp"].isoformat()
    }))
    
    return {"message": f"Power action '{request.action}' executed successfully", "log_id": action_log["id"]}

# Input Control Routes
@api_router.post("/input/keyboard")
async def send_keyboard_input(input_data: KeyboardInput):
    """Send keyboard input to remote device"""
    # In real implementation, this would send keys to the PiKVM device
    input_log = {
        "id": str(uuid.uuid4()),
        "device_id": input_data.device_id,
        "type": "keyboard",
        "keys": input_data.keys,
        "modifiers": input_data.modifiers,
        "timestamp": datetime.utcnow()
    }
    
    await db.input_logs.insert_one(input_log)
    await manager.broadcast(json.dumps({
        "type": "keyboard_input",
        "device_id": input_data.device_id,
        "keys": input_data.keys,
        "timestamp": input_log["timestamp"].isoformat()
    }))
    
    return {"message": "Keyboard input sent successfully", "log_id": input_log["id"]}

@api_router.post("/input/mouse")
async def send_mouse_input(input_data: MouseInput):
    """Send mouse input to remote device"""
    input_log = {
        "id": str(uuid.uuid4()),
        "device_id": input_data.device_id,
        "type": "mouse",
        "x": input_data.x,
        "y": input_data.y,
        "button": input_data.button,
        "action": input_data.action,
        "timestamp": datetime.utcnow()
    }
    
    await db.input_logs.insert_one(input_log)
    await manager.broadcast(json.dumps({
        "type": "mouse_input",
        "device_id": input_data.device_id,
        "x": input_data.x,
        "y": input_data.y,
        "action": input_data.action,
        "timestamp": input_log["timestamp"].isoformat()
    }))
    
    return {"message": "Mouse input sent successfully", "log_id": input_log["id"]}

# System Monitoring Routes
@api_router.get("/system/metrics", response_model=SystemMetrics)
async def get_system_metrics():
    """Get current system metrics"""
    try:
        cpu_usage = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        uptime = subprocess.check_output(['uptime', '-p']).decode().strip()
        
        # Try to get temperature (works on Raspberry Pi)
        temperature = None
        try:
            temp_output = subprocess.check_output(['vcgencmd', 'measure_temp']).decode()
            temperature = float(temp_output.split('=')[1].split('\'')[0])
        except:
            pass
        
        metrics = SystemMetrics(
            cpu_usage=cpu_usage,
            memory_usage=memory.percent,
            disk_usage=disk.percent,
            temperature=temperature,
            uptime=uptime
        )
        
        # Store metrics in database
        await db.system_metrics.insert_one(metrics.dict())
        
        return metrics
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting system metrics: {str(e)}")

# File Upload Routes
@api_router.post("/upload/iso")
async def upload_iso_file(file: UploadFile = File(...)):
    """Upload ISO file for mounting"""
    if not file.filename.endswith(('.iso', '.img')):
        raise HTTPException(status_code=400, detail="Only ISO and IMG files are allowed")
    
    upload_dir = Path("/tmp/uploads")
    upload_dir.mkdir(exist_ok=True)
    
    file_path = upload_dir / file.filename
    
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Log the upload
        upload_log = {
            "id": str(uuid.uuid4()),
            "filename": file.filename,
            "file_path": str(file_path),
            "file_size": len(content),
            "timestamp": datetime.utcnow()
        }
        
        await db.file_uploads.insert_one(upload_log)
        
        return {"message": "File uploaded successfully", "filename": file.filename, "upload_id": upload_log["id"]}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@api_router.get("/upload/files")
async def list_uploaded_files():
    """List all uploaded files"""
    files = await db.file_uploads.find({}, {"_id": 0}).to_list(1000)
    return files

# WebSocket for real-time communication
@api_router.websocket("/ws/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message.get("type") == "video_request":
                # In real implementation, this would stream video from PiKVM
                await manager.send_personal_message(
                    json.dumps({
                        "type": "video_frame",
                        "device_id": device_id,
                        "frame": "base64_encoded_frame_data"
                    }), 
                    websocket
                )
            elif message.get("type") == "heartbeat":
                await manager.send_personal_message(
                    json.dumps({"type": "heartbeat_response", "timestamp": datetime.utcnow().isoformat()}),
                    websocket
                )
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Health Check Routes
@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        await db.status_checks.find_one()
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected",
            "services": "running"
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

# Logs and Diagnostics
@api_router.get("/logs/power")
async def get_power_logs(limit: int = 100):
    """Get power action logs"""
    logs = await db.power_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs

@api_router.get("/logs/input")
async def get_input_logs(limit: int = 100):
    """Get input logs"""
    logs = await db.input_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
