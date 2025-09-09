from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Depends, Request
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
from datetime import datetime, timedelta
import json
import asyncio
import subprocess
import psutil
import aiofiles
from enum import Enum

# Import authentication and PiKVM integration
from auth import (
    User, UserCreate, UserLogin, Token, UserRole, PermissionLevel,
    authenticate_user, create_access_token, get_current_active_user,
    get_password_hash, has_permission, get_user_accessible_devices,
    log_user_action, require_role, AuditLogEntry
)
from pikvm_integration import pikvm_manager


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Super Ducks Enterprise Manager", version="2.0.0")

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
    return {"message": "Super Ducks Enterprise Manager API", "version": "2.0.0", "enterprise": True}

# Authentication Routes  
@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin, request: Request):
    """Login user and return JWT token"""
    user = await authenticate_user(user_credentials.username, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password"
        )
    
    # Update last login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Create access token
    access_token_expires = timedelta(minutes=int(os.getenv("JWT_EXPIRE_HOURS", "24")) * 60)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    # Log login
    await log_user_action(
        user_id=user["id"],
        action="login",
        details={"method": "password"},
        ip_address=request.client.host if request.client else "unknown"
    )
    
    user_obj = User(**{k: v for k, v in user.items() if k != "password_hash"})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_obj
    }

@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, current_user: dict = Depends(require_role(UserRole.ADMIN))):
    """Register new user (Admin only)"""
    # Check if username already exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Check if email already exists
    existing_email = await db.users.find_one({"email": user_data.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user_dict = {
        "id": str(uuid.uuid4()),
        "username": user_data.username,
        "email": user_data.email,
        "password_hash": hashed_password,
        "role": user_data.role,
        "active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    }
    
    await db.users.insert_one(user_dict)
    
    # Log user creation
    await log_user_action(
        user_id=current_user["id"],
        action="create_user",
        details={"new_user_id": user_dict["id"], "username": user_data.username, "role": user_data.role}
    )
    
    return User(**{k: v for k, v in user_dict.items() if k != "password_hash"})

@api_router.get("/auth/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """Get current user information"""
    return User(**{k: v for k, v in current_user.items() if k != "password_hash"})

# User Management Routes
@api_router.get("/users", response_model=List[User])
async def get_users(current_user: dict = Depends(require_role(UserRole.ADMIN))):
    """Get all users (Admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [User(**user) for user in users]

@api_router.put("/users/{user_id}/permissions")
async def set_user_device_permissions(
    user_id: str,
    device_permissions: Dict[str, PermissionLevel],
    current_user: dict = Depends(require_role(UserRole.ADMIN))
):
    """Set user permissions for devices"""
    # Verify user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove existing permissions
    await db.user_device_permissions.delete_many({"user_id": user_id})
    
    # Add new permissions
    permissions = []
    for device_id, permission_level in device_permissions.items():
        permission_dict = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "device_id": device_id,
            "permission_level": permission_level,
            "granted_by": current_user["id"],
            "granted_at": datetime.utcnow()
        }
        permissions.append(permission_dict)
    
    if permissions:
        await db.user_device_permissions.insert_many(permissions)
    
    # Log permission change
    await log_user_action(
        user_id=current_user["id"],
        action="update_user_permissions",
        details={"target_user_id": user_id, "permissions": device_permissions}
    )
    
    return {"message": "Permissions updated successfully"}

@api_router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: str,
    current_user: dict = Depends(require_role(UserRole.ADMIN))
):
    """Get user device permissions"""
    permissions = await db.user_device_permissions.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(1000)
    
    return {
        "user_id": user_id,
        "permissions": {perm["device_id"]: perm["permission_level"] for perm in permissions}
    }

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

# Enhanced Device Management with PiKVM Integration
class DeviceCreateEnterprise(BaseModel):
    name: str
    ip_address: str
    location: Optional[str] = None
    description: Optional[str] = None
    pikvm_username: str = "admin"
    pikvm_password: str = "admin"

class DeviceStatusUpdate(BaseModel):
    status: DeviceStatus

@api_router.post("/devices", response_model=Device)
async def create_device(
    device: DeviceCreateEnterprise, 
    current_user: dict = Depends(require_role(UserRole.ADMIN))
):
    """Create new device (Admin only)"""
    device_obj = Device(
        name=device.name,
        ip_address=device.ip_address,
        status=DeviceStatus.UNKNOWN
    )
    
    # Save to database
    device_dict = device_obj.dict()
    device_dict.update({
        "location": device.location,
        "description": device.description,
        "created_by": current_user["id"],
        "created_at": datetime.utcnow()
    })
    
    await db.devices.insert_one(device_dict)
    
    # Register with PiKVM Manager
    await pikvm_manager.register_device(
        device_obj.id, 
        device.ip_address,
        device.pikvm_username,
        device.pikvm_password
    )
    
    # Log device creation
    await log_user_action(
        user_id=current_user["id"],
        action="create_device",
        device_id=device_obj.id,
        details={"name": device.name, "ip": device.ip_address}
    )
    
    return device_obj

@api_router.get("/devices", response_model=List[Device])
async def get_devices(current_user: dict = Depends(get_current_active_user)):
    """Get devices accessible to current user"""
    accessible_device_ids = await get_user_accessible_devices(current_user)
    
    if not accessible_device_ids:
        return []
    
    devices = await db.devices.find(
        {"id": {"$in": accessible_device_ids}}, 
        {"_id": 0}
    ).to_list(1000)
    
    return [Device(**device) for device in devices]

@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str, current_user: dict = Depends(get_current_active_user)):
    """Get specific device if user has access"""
    # Check permissions
    if not await has_permission(current_user, device_id, PermissionLevel.VIEW_ONLY):
        raise HTTPException(status_code=403, detail="Access denied to this device")
    
    device = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return Device(**device)

@api_router.put("/devices/{device_id}/status")
async def update_device_status(
    device_id: str, 
    status_update: DeviceStatusUpdate,
    current_user: dict = Depends(require_role(UserRole.ADMIN))
):
    """Update device status (Admin only)"""
    result = await db.devices.update_one(
        {"id": device_id}, 
        {"$set": {"status": status_update.status, "last_seen": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    return {"message": f"Device status updated to {status_update.status}"}

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: dict = Depends(require_role(UserRole.ADMIN))):
    """Delete device (Admin only)"""
    result = await db.devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Remove from PiKVM manager
    if device_id in pikvm_manager.devices:
        del pikvm_manager.devices[device_id]
    
    # Remove all user permissions for this device
    await db.user_device_permissions.delete_many({"device_id": device_id})
    
    # Log device deletion
    await log_user_action(
        user_id=current_user["id"],
        action="delete_device",
        device_id=device_id
    )
    
    return {"message": "Device deleted successfully"}

# Power Management with Real PiKVM Integration
@api_router.post("/power/action")
async def execute_power_action(
    request: PowerActionRequest, 
    current_user: dict = Depends(get_current_active_user),
    client_request: Request = None
):
    """Execute power action on a device"""
    # Check permissions
    if not await has_permission(current_user, request.device_id, PermissionLevel.CONTROL):
        raise HTTPException(status_code=403, detail="Insufficient permissions for power control")
    
    # Verify device exists
    device = await db.devices.find_one({"id": request.device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Execute power action via PiKVM Manager
    success = await pikvm_manager.execute_power_action(request.device_id, request.action)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to execute power action")
    
    # Log the action
    action_log = {
        "id": str(uuid.uuid4()),
        "device_id": request.device_id,
        "action": request.action,
        "timestamp": datetime.utcnow(),
        "status": "success" if success else "failed",
        "user_id": current_user["id"]
    }
    
    await db.power_logs.insert_one(action_log)
    
    # Log user action for audit
    await log_user_action(
        user_id=current_user["id"],
        action="power_control",
        device_id=request.device_id,
        details={"power_action": request.action, "success": success},
        ip_address=client_request.client.host if client_request and client_request.client else "unknown"
    )
    
    await manager.broadcast(json.dumps({
        "type": "power_action",
        "device_id": request.device_id,
        "action": request.action,
        "timestamp": action_log["timestamp"].isoformat(),
        "user": current_user["username"]
    }))
    
    return {"message": f"Power action '{request.action}' executed successfully", "log_id": action_log["id"]}

# Input Control with Real PiKVM Integration
@api_router.post("/input/keyboard")
async def send_keyboard_input(
    input_data: KeyboardInput, 
    current_user: dict = Depends(get_current_active_user),
    client_request: Request = None
):
    """Send keyboard input to remote device"""
    # Check permissions
    if not await has_permission(current_user, input_data.device_id, PermissionLevel.CONTROL):
        raise HTTPException(status_code=403, detail="Insufficient permissions for input control")
    
    # Execute keyboard input via PiKVM Manager
    success = await pikvm_manager.send_keyboard_input(
        input_data.device_id, 
        input_data.keys, 
        input_data.modifiers or []
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send keyboard input")
    
    # Log the input
    input_log = {
        "id": str(uuid.uuid4()),
        "device_id": input_data.device_id,
        "type": "keyboard",
        "keys": input_data.keys,
        "modifiers": input_data.modifiers,
        "timestamp": datetime.utcnow(),
        "user_id": current_user["id"]
    }
    
    await db.input_logs.insert_one(input_log)
    
    # Log user action for audit
    await log_user_action(
        user_id=current_user["id"],
        action="keyboard_input",
        device_id=input_data.device_id,
        details={"keys": input_data.keys, "modifiers": input_data.modifiers},
        ip_address=client_request.client.host if client_request and client_request.client else "unknown"
    )
    
    await manager.broadcast(json.dumps({
        "type": "keyboard_input",
        "device_id": input_data.device_id,
        "keys": input_data.keys,
        "timestamp": input_log["timestamp"].isoformat(),
        "user": current_user["username"]
    }))
    
    return {"message": "Keyboard input sent successfully", "log_id": input_log["id"]}

@api_router.post("/input/mouse")
async def send_mouse_input(
    input_data: MouseInput, 
    current_user: dict = Depends(get_current_active_user),
    client_request: Request = None
):
    """Send mouse input to remote device"""
    # Check permissions
    if not await has_permission(current_user, input_data.device_id, PermissionLevel.CONTROL):
        raise HTTPException(status_code=403, detail="Insufficient permissions for input control")
    
    # Execute mouse input via PiKVM Manager
    success = await pikvm_manager.send_mouse_input(
        input_data.device_id,
        input_data.x,
        input_data.y,
        input_data.button,
        input_data.action
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send mouse input")
    
    # Log the input
    input_log = {
        "id": str(uuid.uuid4()),
        "device_id": input_data.device_id,
        "type": "mouse",
        "x": input_data.x,
        "y": input_data.y,
        "button": input_data.button,
        "action": input_data.action,
        "timestamp": datetime.utcnow(),
        "user_id": current_user["id"]
    }
    
    await db.input_logs.insert_one(input_log)
    
    # Log user action for audit
    await log_user_action(
        user_id=current_user["id"],
        action="mouse_input",
        device_id=input_data.device_id,
        details={"x": input_data.x, "y": input_data.y, "button": input_data.button, "action": input_data.action},
        ip_address=client_request.client.host if client_request and client_request.client else "unknown"
    )
    
    await manager.broadcast(json.dumps({
        "type": "mouse_input",
        "device_id": input_data.device_id,
        "x": input_data.x,
        "y": input_data.y,
        "action": input_data.action,
        "timestamp": input_log["timestamp"].isoformat(),
        "user": current_user["username"]
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

# Video Streaming Routes
@api_router.get("/devices/{device_id}/stream")
async def get_video_stream(
    device_id: str, 
    current_user: dict = Depends(get_current_active_user)
):
    """Get video stream URL for device"""
    # Check permissions
    if not await has_permission(current_user, device_id, PermissionLevel.VIEW_ONLY):
        raise HTTPException(status_code=403, detail="Insufficient permissions to view device")
    
    # Get stream URL from PiKVM Manager
    stream_url = await pikvm_manager.get_stream_url(device_id)
    
    if not stream_url:
        raise HTTPException(status_code=404, detail="Device not found or stream unavailable")
    
    # Log stream access
    await log_user_action(
        user_id=current_user["id"],
        action="access_video_stream",
        device_id=device_id
    )
    
    return {"stream_url": stream_url, "device_id": device_id}

# Audit and Logging Routes
@api_router.get("/audit/logs")
async def get_audit_logs(
    limit: int = 100,
    device_id: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(require_role(UserRole.ADMIN))
):
    """Get audit logs (Admin only)"""
    filter_query = {}
    
    if device_id:
        filter_query["device_id"] = device_id
    if user_id:
        filter_query["user_id"] = user_id
    
    logs = await db.audit_log.find(filter_query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs

@api_router.get("/logs/power")
async def get_power_logs(
    limit: int = 100, 
    current_user: dict = Depends(get_current_active_user)
):
    """Get power action logs for accessible devices"""
    accessible_device_ids = await get_user_accessible_devices(current_user)
    
    if not accessible_device_ids:
        return []
    
    logs = await db.power_logs.find(
        {"device_id": {"$in": accessible_device_ids}}, 
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return logs

@api_router.get("/logs/input")
async def get_input_logs(
    limit: int = 100, 
    current_user: dict = Depends(get_current_active_user)
):
    """Get input logs for accessible devices"""
    accessible_device_ids = await get_user_accessible_devices(current_user)
    
    if not accessible_device_ids:
        return []
    
    logs = await db.input_logs.find(
        {"device_id": {"$in": accessible_device_ids}}, 
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
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
