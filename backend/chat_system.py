from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import json
import asyncio
import os
import base64
import aiofiles
from pathlib import Path
from auth import get_current_active_user, User
import logging

logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Chat Models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_room_id: str
    sender_id: str
    sender_username: str
    message_type: str  # "text", "audio", "file", "system"
    content: str
    audio_data: Optional[str] = None  # Base64 encoded audio
    audio_duration: Optional[float] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    edited: bool = False
    edited_at: Optional[datetime] = None
    reply_to: Optional[str] = None  # Message ID being replied to
    read_by: List[str] = Field(default_factory=list)  # User IDs who read the message

class ChatRoom(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    room_type: str  # "public", "private", "direct"
    participants: List[str] = Field(default_factory=list)  # User IDs
    admins: List[str] = Field(default_factory=list)  # User IDs with admin rights
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class ChatUser(BaseModel):
    user_id: str
    username: str
    status: str  # "online", "away", "busy", "offline"
    last_seen: datetime
    current_room: Optional[str] = None

class MessageCreate(BaseModel):
    chat_room_id: str
    message_type: str = "text"
    content: str
    reply_to: Optional[str] = None

class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    room_type: str = "public"
    participants: Optional[List[str]] = None

class MessageUpdate(BaseModel):
    content: str

# WebSocket Connection Manager for Chat
class ChatConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}  # user_id -> [websockets]
        self.user_rooms: Dict[str, List[str]] = {}  # user_id -> [room_ids]
        self.online_users: Dict[str, ChatUser] = {}

    async def connect(self, websocket: WebSocket, user_id: str, username: str):
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        
        # Update user status
        self.online_users[user_id] = ChatUser(
            user_id=user_id,
            username=username,
            status="online",
            last_seen=datetime.utcnow()
        )
        
        # Broadcast user online status
        await self.broadcast_user_status(user_id, "online")
        
        logger.info(f"Chat WebSocket connected for user {username} ({user_id})")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            try:
                self.active_connections[user_id].remove(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                    if user_id in self.online_users:
                        del self.online_users[user_id]
            except ValueError:
                pass
        
        logger.info(f"Chat WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    dead_connections.append(connection)
            
            # Remove dead connections
            for dead_conn in dead_connections:
                try:
                    self.active_connections[user_id].remove(dead_conn)
                except ValueError:
                    pass

    async def broadcast_to_room(self, message: dict, room_id: str, exclude_user: Optional[str] = None):
        # Get room participants
        room = await db.chat_rooms.find_one({"id": room_id})
        if not room:
            return
        
        participants = room.get("participants", [])
        
        for user_id in participants:
            if exclude_user and user_id == exclude_user:
                continue
            await self.send_personal_message(message, user_id)

    async def broadcast_user_status(self, user_id: str, status: str):
        message = {
            "type": "user_status",
            "user_id": user_id,
            "status": status,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast to all online users
        for online_user_id in self.active_connections.keys():
            if online_user_id != user_id:
                await self.send_personal_message(message, online_user_id)

    def get_online_users(self) -> List[ChatUser]:
        return list(self.online_users.values())

    async def join_room(self, user_id: str, room_id: str):
        if user_id not in self.user_rooms:
            self.user_rooms[user_id] = []
        
        if room_id not in self.user_rooms[user_id]:
            self.user_rooms[user_id].append(room_id)
        
        # Update user's current room
        if user_id in self.online_users:
            self.online_users[user_id].current_room = room_id

    async def leave_room(self, user_id: str, room_id: str):
        if user_id in self.user_rooms and room_id in self.user_rooms[user_id]:
            self.user_rooms[user_id].remove(room_id)
        
        # Clear current room if leaving it
        if user_id in self.online_users and self.online_users[user_id].current_room == room_id:
            self.online_users[user_id].current_room = None

chat_manager = ChatConnectionManager()

# Chat Router
chat_router = APIRouter(prefix="/chat", tags=["chat"])

# Chat Room Routes
@chat_router.post("/rooms", response_model=ChatRoom)
async def create_chat_room(
    room_data: RoomCreate,
    current_user: dict = Depends(get_current_active_user)
):
    """Create a new chat room"""
    room = ChatRoom(
        name=room_data.name,
        description=room_data.description,
        room_type=room_data.room_type,
        participants=[current_user["id"]],
        admins=[current_user["id"]],
        created_by=current_user["id"]
    )
    
    # Add additional participants if provided
    if room_data.participants:
        for participant_id in room_data.participants:
            if participant_id not in room.participants:
                room.participants.append(participant_id)
    
    await db.chat_rooms.insert_one(room.dict())
    
    logger.info(f"Chat room '{room.name}' created by {current_user['username']}")
    
    return room

@chat_router.get("/rooms", response_model=List[ChatRoom])
async def get_user_chat_rooms(current_user: dict = Depends(get_current_active_user)):
    """Get chat rooms where user is a participant"""
    rooms = await db.chat_rooms.find(
        {
            "participants": current_user["id"],
            "is_active": True
        },
        {"_id": 0}
    ).sort("last_activity", -1).to_list(100)
    
    return [ChatRoom(**room) for room in rooms]

@chat_router.get("/rooms/{room_id}", response_model=ChatRoom)
async def get_chat_room(
    room_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get specific chat room details"""
    room = await db.chat_rooms.find_one({"id": room_id}, {"_id": 0})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Check if user is participant
    if current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied to this chat room")
    
    return ChatRoom(**room)

@chat_router.post("/rooms/{room_id}/join")
async def join_chat_room(
    room_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Join a chat room"""
    room = await db.chat_rooms.find_one({"id": room_id})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Add user to participants if not already there
    if current_user["id"] not in room.get("participants", []):
        await db.chat_rooms.update_one(
            {"id": room_id},
            {
                "$addToSet": {"participants": current_user["id"]},
                "$set": {"last_activity": datetime.utcnow()}
            }
        )
    
    # Update WebSocket manager
    await chat_manager.join_room(current_user["id"], room_id)
    
    # Send system message
    system_message = ChatMessage(
        chat_room_id=room_id,
        sender_id="system",
        sender_username="Sistema",
        message_type="system",
        content=f"{current_user['username']} entrou na sala"
    )
    
    await db.chat_messages.insert_one(system_message.dict())
    
    # Broadcast to room
    await chat_manager.broadcast_to_room(
        {
            "type": "new_message",
            "message": system_message.dict()
        },
        room_id
    )
    
    return {"message": "Joined chat room successfully"}

@chat_router.post("/rooms/{room_id}/leave")
async def leave_chat_room(
    room_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Leave a chat room"""
    room = await db.chat_rooms.find_one({"id": room_id})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    # Remove user from participants
    await db.chat_rooms.update_one(
        {"id": room_id},
        {
            "$pull": {"participants": current_user["id"], "admins": current_user["id"]},
            "$set": {"last_activity": datetime.utcnow()}
        }
    )
    
    # Update WebSocket manager
    await chat_manager.leave_room(current_user["id"], room_id)
    
    # Send system message
    system_message = ChatMessage(
        chat_room_id=room_id,
        sender_id="system",
        sender_username="Sistema",
        message_type="system",
        content=f"{current_user['username']} saiu da sala"
    )
    
    await db.chat_messages.insert_one(system_message.dict())
    
    # Broadcast to room
    await chat_manager.broadcast_to_room(
        {
            "type": "new_message",
            "message": system_message.dict()
        },
        room_id
    )
    
    return {"message": "Left chat room successfully"}

# Message Routes
@chat_router.post("/messages", response_model=ChatMessage)
async def send_message(
    message_data: MessageCreate,
    current_user: dict = Depends(get_current_active_user)
):
    """Send a text message to a chat room"""
    # Verify user is participant of the room
    room = await db.chat_rooms.find_one({"id": message_data.chat_room_id})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    if current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied to this chat room")
    
    # Create message
    message = ChatMessage(
        chat_room_id=message_data.chat_room_id,
        sender_id=current_user["id"],
        sender_username=current_user["username"],
        message_type=message_data.message_type,
        content=message_data.content,
        reply_to=message_data.reply_to
    )
    
    # Save to database
    await db.chat_messages.insert_one(message.dict())
    
    # Update room last activity
    await db.chat_rooms.update_one(
        {"id": message_data.chat_room_id},
        {"$set": {"last_activity": datetime.utcnow()}}
    )
    
    # Broadcast to room participants
    await chat_manager.broadcast_to_room(
        {
            "type": "new_message",
            "message": message.dict()
        },
        message_data.chat_room_id,
        exclude_user=current_user["id"]
    )
    
    logger.info(f"Message sent by {current_user['username']} to room {message_data.chat_room_id}")
    
    return message

@chat_router.get("/rooms/{room_id}/messages")
async def get_room_messages(
    room_id: str,
    limit: int = 50,
    before: Optional[str] = None,  # Message ID to load messages before
    current_user: dict = Depends(get_current_active_user)
):
    """Get messages from a chat room (with pagination)"""
    # Verify user is participant
    room = await db.chat_rooms.find_one({"id": room_id})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    if current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied to this chat room")
    
    # Build query for pagination
    query = {"chat_room_id": room_id}
    
    # Only get messages from last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    query["timestamp"] = {"$gte": thirty_days_ago}
    
    # If 'before' parameter provided, get messages before that message
    if before:
        before_message = await db.chat_messages.find_one({"id": before})
        if before_message:
            query["timestamp"]["$lt"] = before_message["timestamp"]
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Reverse to get chronological order
    messages.reverse()
    
    return {
        "messages": [ChatMessage(**msg) for msg in messages],
        "has_more": len(messages) == limit
    }

@chat_router.put("/messages/{message_id}")
async def edit_message(
    message_id: str,
    message_update: MessageUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """Edit a message (only by sender within 10 minutes)"""
    message = await db.chat_messages.find_one({"id": message_id})
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check if user is the sender
    if message["sender_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Can only edit your own messages")
    
    # Check if message is within edit time limit (10 minutes)
    message_time = message["timestamp"]
    time_limit = datetime.utcnow() - timedelta(minutes=10)
    
    if message_time < time_limit:
        raise HTTPException(status_code=400, detail="Message can only be edited within 10 minutes")
    
    # Update message
    await db.chat_messages.update_one(
        {"id": message_id},
        {
            "$set": {
                "content": message_update.content,
                "edited": True,
                "edited_at": datetime.utcnow()
            }
        }
    )
    
    # Get updated message
    updated_message = await db.chat_messages.find_one({"id": message_id}, {"_id": 0})
    
    # Broadcast update to room
    await chat_manager.broadcast_to_room(
        {
            "type": "message_edited",
            "message": updated_message
        },
        message["chat_room_id"]
    )
    
    return {"message": "Message updated successfully"}

@chat_router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Delete a message (only by sender or room admin)"""
    message = await db.chat_messages.find_one({"id": message_id})
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check permissions
    room = await db.chat_rooms.find_one({"id": message["chat_room_id"]})
    is_sender = message["sender_id"] == current_user["id"]
    is_admin = current_user["id"] in room.get("admins", [])
    
    if not (is_sender or is_admin):
        raise HTTPException(status_code=403, detail="Cannot delete this message")
    
    # Soft delete (mark as deleted)
    await db.chat_messages.update_one(
        {"id": message_id},
        {
            "$set": {
                "content": "[Mensagem deletada]",
                "message_type": "system",
                "edited": True,
                "edited_at": datetime.utcnow()
            }
        }
    )
    
    # Get updated message
    updated_message = await db.chat_messages.find_one({"id": message_id}, {"_id": 0})
    
    # Broadcast deletion to room
    await chat_manager.broadcast_to_room(
        {
            "type": "message_deleted",
            "message": updated_message
        },
        message["chat_room_id"]
    )
    
    return {"message": "Message deleted successfully"}

# Audio Message Routes
@chat_router.post("/messages/audio")
async def send_audio_message(
    room_id: str,
    audio_file: UploadFile = File(...),
    duration: float = 0,
    current_user: dict = Depends(get_current_active_user)
):
    """Send an audio message"""
    # Verify user is participant
    room = await db.chat_rooms.find_one({"id": room_id})
    
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    
    if current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied to this chat room")
    
    # Validate audio file
    if not audio_file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    # Read and encode audio data
    audio_content = await audio_file.read()
    audio_base64 = base64.b64encode(audio_content).decode()
    
    # Create audio message
    message = ChatMessage(
        chat_room_id=room_id,
        sender_id=current_user["id"],
        sender_username=current_user["username"],
        message_type="audio",
        content=f"Mensagem de áudio ({duration:.1f}s)",
        audio_data=audio_base64,
        audio_duration=duration,
        file_name=audio_file.filename,
        file_size=len(audio_content)
    )
    
    # Save to database
    await db.chat_messages.insert_one(message.dict())
    
    # Update room last activity
    await db.chat_rooms.update_one(
        {"id": room_id},
        {"$set": {"last_activity": datetime.utcnow()}}
    )
    
    # For broadcasting, don't include the full audio data
    broadcast_message = message.dict()
    broadcast_message["audio_data"] = f"[{len(audio_base64)} bytes]"  # Just show size
    
    # Broadcast to room participants
    await chat_manager.broadcast_to_room(
        {
            "type": "new_message",
            "message": broadcast_message
        },
        room_id,
        exclude_user=current_user["id"]
    )
    
    logger.info(f"Audio message sent by {current_user['username']} to room {room_id}")
    
    return message

@chat_router.get("/messages/{message_id}/audio")
async def get_audio_message(
    message_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get audio data for an audio message"""
    message = await db.chat_messages.find_one({"id": message_id})
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message["message_type"] != "audio":
        raise HTTPException(status_code=400, detail="Message is not an audio message")
    
    # Verify user has access to the room
    room = await db.chat_rooms.find_one({"id": message["chat_room_id"]})
    if current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        "message_id": message_id,
        "audio_data": message.get("audio_data"),
        "duration": message.get("audio_duration"),
        "file_name": message.get("file_name")
    }

# User Status Routes
@chat_router.get("/users/online")
async def get_online_users(current_user: dict = Depends(get_current_active_user)):
    """Get list of online users"""
    return {
        "online_users": chat_manager.get_online_users(),
        "total_count": len(chat_manager.get_online_users())
    }

@chat_router.post("/users/status")
async def update_user_status(
    status: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Update user status (online, away, busy, etc.)"""
    valid_statuses = ["online", "away", "busy", "offline"]
    
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    # Update in memory
    if current_user["id"] in chat_manager.online_users:
        chat_manager.online_users[current_user["id"]].status = status
        chat_manager.online_users[current_user["id"]].last_seen = datetime.utcnow()
    
    # Broadcast status change
    await chat_manager.broadcast_user_status(current_user["id"], status)
    
    return {"message": f"Status updated to {status}"}

# Mark messages as read
@chat_router.post("/rooms/{room_id}/read/{message_id}")
async def mark_message_as_read(
    room_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Mark a message as read by current user"""
    # Verify access to room
    room = await db.chat_rooms.find_one({"id": room_id})
    if not room or current_user["id"] not in room.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update message read status
    await db.chat_messages.update_one(
        {
            "id": message_id,
            "chat_room_id": room_id
        },
        {
            "$addToSet": {"read_by": current_user["id"]}
        }
    )
    
    return {"message": "Message marked as read"}

# WebSocket endpoint for real-time chat
@chat_router.websocket("/ws")
async def chat_websocket(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time chat"""
    try:
        # Verify token and get user
        from auth import verify_token
        payload = verify_token(token)
        username = payload.get("sub")
        
        if not username:
            await websocket.close(code=1008, reason="Invalid token")
            return
        
        # Get user from database
        user = await db.users.find_one({"username": username})
        if not user:
            await websocket.close(code=1008, reason="User not found")
            return
        
        # Connect user
        await chat_manager.connect(websocket, user["id"], user["username"])
        
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                message_type = message.get("type")
                
                if message_type == "ping":
                    # Respond to ping
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    }))
                
                elif message_type == "join_room":
                    # Join a chat room
                    room_id = message.get("room_id")
                    if room_id:
                        await chat_manager.join_room(user["id"], room_id)
                        await websocket.send_text(json.dumps({
                            "type": "room_joined",
                            "room_id": room_id
                        }))
                
                elif message_type == "leave_room":
                    # Leave a chat room
                    room_id = message.get("room_id")
                    if room_id:
                        await chat_manager.leave_room(user["id"], room_id)
                        await websocket.send_text(json.dumps({
                            "type": "room_left",
                            "room_id": room_id
                        }))
                
                elif message_type == "typing":
                    # Broadcast typing indicator
                    room_id = message.get("room_id")
                    if room_id:
                        await chat_manager.broadcast_to_room(
                            {
                                "type": "user_typing",
                                "user_id": user["id"],
                                "username": user["username"],
                                "room_id": room_id,
                                "is_typing": message.get("is_typing", True)
                            },
                            room_id,
                            exclude_user=user["id"]
                        )
                
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"Chat WebSocket error: {str(e)}")
    
    finally:
        chat_manager.disconnect(websocket, user["id"])
        # Broadcast user offline status
        await chat_manager.broadcast_user_status(user["id"], "offline")