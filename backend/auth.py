"""
Authentication and Authorization module for PiKVM Enterprise Manager
"""
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel
from enum import Enum
import os
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("JWT_SECRET", "your-super-secret-key-change-in-production"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Database connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# Enums
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin" 
    OPERATOR = "operator"
    VIEWER = "viewer"

class PermissionLevel(str, Enum):
    FULL_CONTROL = "full_control"
    CONTROL = "control"
    VIEW_ONLY = "view_only"
    NO_ACCESS = "no_access"

# Models
class User(BaseModel):
    id: str
    username: str
    email: str
    role: UserRole
    active: bool = True
    created_at: datetime
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: UserRole = UserRole.VIEWER

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class UserDevicePermission(BaseModel):
    id: str
    user_id: str
    device_id: str
    permission_level: PermissionLevel
    granted_by: str
    granted_at: datetime

class AuditLogEntry(BaseModel):
    id: str
    user_id: str
    device_id: Optional[str] = None
    action: str
    details: dict
    ip_address: str
    timestamp: datetime

# Password utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# JWT utilities
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_user_by_username(username: str) -> Optional[dict]:
    user = await db.users.find_one({"username": username}, {"_id": 0})
    return user

async def get_user_by_id(user_id: str) -> Optional[dict]:
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return user

async def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = await get_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    if not user.get("active", True):
        return None
    return user

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await get_user_by_username(username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("active", True):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Permission utilities
async def get_user_device_permission(user_id: str, device_id: str) -> Optional[PermissionLevel]:
    permission = await db.user_device_permissions.find_one({
        "user_id": user_id,
        "device_id": device_id
    }, {"_id": 0})
    
    if permission:
        return PermissionLevel(permission["permission_level"])
    return None

async def has_permission(user: dict, device_id: str, required_permission: PermissionLevel) -> bool:
    # Super admin has access to everything
    if user.get("role") == UserRole.SUPER_ADMIN:
        return True
    
    # Check specific device permission
    user_permission = await get_user_device_permission(user["id"], device_id)
    
    if user_permission is None:
        return False
    
    # Permission hierarchy
    permission_hierarchy = {
        PermissionLevel.NO_ACCESS: 0,
        PermissionLevel.VIEW_ONLY: 1,
        PermissionLevel.CONTROL: 2,
        PermissionLevel.FULL_CONTROL: 3
    }
    
    return permission_hierarchy[user_permission] >= permission_hierarchy[required_permission]

async def get_user_accessible_devices(user: dict) -> List[str]:
    """Get list of device IDs that user can access"""
    if user.get("role") == UserRole.SUPER_ADMIN:
        # Super admin can see all devices
        devices = await db.devices.find({}, {"id": 1, "_id": 0}).to_list(1000)
        return [device["id"] for device in devices]
    
    # Get devices with permissions
    permissions = await db.user_device_permissions.find({
        "user_id": user["id"],
        "permission_level": {"$ne": PermissionLevel.NO_ACCESS}
    }, {"device_id": 1, "_id": 0}).to_list(1000)
    
    return [perm["device_id"] for perm in permissions]

# Audit logging
async def log_user_action(user_id: str, action: str, device_id: Optional[str] = None, 
                         details: dict = None, ip_address: str = "unknown"):
    """Log user action for audit trail"""
    audit_entry = AuditLogEntry(
        id=str(uuid.uuid4()),
        user_id=user_id,
        device_id=device_id,
        action=action,
        details=details or {},
        ip_address=ip_address,
        timestamp=datetime.utcnow()
    )
    
    await db.audit_log.insert_one(audit_entry.dict())

# Role-based access decorators
def require_role(required_role: UserRole):
    async def role_checker(current_user: dict = Depends(get_current_active_user)):
        role_hierarchy = {
            UserRole.VIEWER: 1,
            UserRole.OPERATOR: 2,
            UserRole.ADMIN: 3,
            UserRole.SUPER_ADMIN: 4
        }
        
        user_role = UserRole(current_user.get("role", UserRole.VIEWER))
        
        if role_hierarchy[user_role] < role_hierarchy[required_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker

def require_device_permission(device_id: str, required_permission: PermissionLevel):
    async def permission_checker(current_user: dict = Depends(get_current_active_user)):
        if not await has_permission(current_user, device_id, required_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient device permissions"
            )
        return current_user
    return permission_checker