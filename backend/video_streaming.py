"""
Video Streaming Module
WebRTC and real-time video streaming integration
"""

import asyncio
import logging
import json
import base64
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
import aiohttp
from pydantic import BaseModel
from enum import Enum

logger = logging.getLogger(__name__)

class StreamQuality(str, Enum):
    LOW = "low"          # 640x480, 30fps, 1Mbps
    MEDIUM = "medium"    # 1280x720, 30fps, 2Mbps
    HIGH = "high"        # 1920x1080, 30fps, 4Mbps
    AUTO = "auto"        # Adaptive quality

class StreamType(str, Enum):
    WEBRTC = "webrtc"
    MJPEG = "mjpeg"
    H264 = "h264"

class VideoStreamConfig(BaseModel):
    device_id: str
    quality: StreamQuality = StreamQuality.MEDIUM
    stream_type: StreamType = StreamType.WEBRTC
    fps: int = 30
    bitrate: int = 2000  # kbps
    width: int = 1280
    height: int = 720
    enable_audio: bool = False

class WebRTCConnection(BaseModel):
    device_id: str
    client_id: str
    # Remove websocket from the model since it's not serializable
    peer_connection: Optional[Dict] = None
    is_active: bool = False
    created_at: datetime
    last_activity: datetime
    
    class Config:
        arbitrary_types_allowed = True

class VideoStreamManager:
    """Manages video streaming from PiKVM devices"""
    
    def __init__(self):
        self.active_streams: Dict[str, VideoStreamConfig] = {}
        self.webrtc_connections: Dict[str, WebRTCConnection] = {}
        self.websocket_connections: Dict[str, Set[WebSocket]] = {}
        self.stream_tasks: Dict[str, asyncio.Task] = {}
        
    async def start_stream(self, config: VideoStreamConfig) -> Dict[str, Any]:
        """Start video stream for a device"""
        try:
            stream_id = f"{config.device_id}_{config.stream_type.value}"
            
            if stream_id in self.active_streams:
                return {
                    "success": True,
                    "stream_id": stream_id,
                    "message": "Stream already active",
                    "stream_url": self.get_stream_url(config)
                }
            
            self.active_streams[stream_id] = config
            
            # Start streaming task based on type
            if config.stream_type == StreamType.WEBRTC:
                task = asyncio.create_task(self._handle_webrtc_stream(config))
            elif config.stream_type == StreamType.MJPEG:
                task = asyncio.create_task(self._handle_mjpeg_stream(config))
            elif config.stream_type == StreamType.H264:
                task = asyncio.create_task(self._handle_h264_stream(config))
                
            self.stream_tasks[stream_id] = task
            
            logger.info(f"Started {config.stream_type.value} stream for device {config.device_id}")
            
            return {
                "success": True,
                "stream_id": stream_id,
                "device_id": config.device_id,
                "stream_type": config.stream_type.value,
                "quality": config.quality.value,
                "stream_url": self.get_stream_url(config),
                "webrtc_signaling": f"/api/webrtc/{config.device_id}" if config.stream_type == StreamType.WEBRTC else None
            }
            
        except Exception as e:
            logger.error(f"Failed to start stream for device {config.device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "device_id": config.device_id
            }
    
    async def stop_stream(self, device_id: str, stream_type: StreamType = None) -> Dict[str, Any]:
        """Stop video stream for a device"""
        try:
            streams_to_stop = []
            
            if stream_type:
                stream_id = f"{device_id}_{stream_type.value}"
                if stream_id in self.active_streams:
                    streams_to_stop.append(stream_id)
            else:
                # Stop all streams for device
                for stream_id in list(self.active_streams.keys()):
                    if stream_id.startswith(f"{device_id}_"):
                        streams_to_stop.append(stream_id)
            
            stopped_streams = []
            for stream_id in streams_to_stop:
                # Cancel task
                if stream_id in self.stream_tasks:
                    task = self.stream_tasks[stream_id]
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                    del self.stream_tasks[stream_id]
                
                # Remove from active streams
                if stream_id in self.active_streams:
                    config = self.active_streams[stream_id]
                    del self.active_streams[stream_id]
                    stopped_streams.append(config.stream_type.value)
                
                # Close WebSocket connections
                if device_id in self.websocket_connections:
                    connections = list(self.websocket_connections[device_id])
                    for ws in connections:
                        try:
                            await ws.close()
                        except:
                            pass
                    del self.websocket_connections[device_id]
            
            logger.info(f"Stopped streams {stopped_streams} for device {device_id}")
            
            return {
                "success": True,
                "device_id": device_id,
                "stopped_streams": stopped_streams
            }
            
        except Exception as e:
            logger.error(f"Failed to stop stream for device {device_id}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "device_id": device_id
            }
    
    def get_stream_url(self, config: VideoStreamConfig) -> str:
        """Get stream URL for a configuration"""
        if config.stream_type == StreamType.WEBRTC:
            return f"/api/webrtc/{config.device_id}"
        elif config.stream_type == StreamType.MJPEG:
            return f"/api/stream/mjpeg/{config.device_id}"
        elif config.stream_type == StreamType.H264:
            return f"/api/stream/h264/{config.device_id}"
        else:
            return f"/api/stream/{config.device_id}"
    
    async def add_websocket_connection(self, device_id: str, websocket: WebSocket):
        """Add WebSocket connection for streaming"""
        if device_id not in self.websocket_connections:
            self.websocket_connections[device_id] = set()
        
        self.websocket_connections[device_id].add(websocket)
        logger.info(f"Added WebSocket connection for device {device_id}")
    
    async def remove_websocket_connection(self, device_id: str, websocket: WebSocket):
        """Remove WebSocket connection"""
        if device_id in self.websocket_connections:
            self.websocket_connections[device_id].discard(websocket)
            if not self.websocket_connections[device_id]:
                del self.websocket_connections[device_id]
        
        logger.info(f"Removed WebSocket connection for device {device_id}")
    
    async def broadcast_to_device_connections(self, device_id: str, message: Dict[str, Any]):
        """Broadcast message to all connections for a device"""
        if device_id not in self.websocket_connections:
            return
        
        connections = list(self.websocket_connections[device_id])
        disconnected = []
        
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send message to websocket: {str(e)}")
                disconnected.append(websocket)
        
        # Clean up disconnected websockets
        for ws in disconnected:
            await self.remove_websocket_connection(device_id, ws)
    
    async def _handle_webrtc_stream(self, config: VideoStreamConfig):
        """Handle WebRTC streaming"""
        try:
            logger.info(f"Starting WebRTC stream for device {config.device_id}")
            
            # This would integrate with actual PiKVM WebRTC implementation
            # For now, we'll simulate WebRTC signaling
            
            while True:
                # Send periodic updates to connected clients
                await self.broadcast_to_device_connections(config.device_id, {
                    "type": "webrtc_status",
                    "device_id": config.device_id,
                    "status": "active",
                    "quality": config.quality.value,
                    "timestamp": datetime.now().isoformat()
                })
                
                await asyncio.sleep(5)  # Status update every 5 seconds
                
        except asyncio.CancelledError:
            logger.info(f"WebRTC stream cancelled for device {config.device_id}")
        except Exception as e:
            logger.error(f"WebRTC stream error for device {config.device_id}: {str(e)}")
    
    async def _handle_mjpeg_stream(self, config: VideoStreamConfig):
        """Handle MJPEG streaming"""
        try:
            logger.info(f"Starting MJPEG stream for device {config.device_id}")
            
            # Import the hardware manager
            from pikvm_hardware import pikvm_hardware_manager
            
            while True:
                # Get snapshot from PiKVM device
                snapshot_result = await pikvm_hardware_manager.get_video_snapshot(config.device_id)
                
                if snapshot_result.get("success"):
                    # Broadcast snapshot to connected clients
                    await self.broadcast_to_device_connections(config.device_id, {
                        "type": "mjpeg_frame",
                        "device_id": config.device_id,
                        "image_data": snapshot_result["image_data"],
                        "content_type": snapshot_result["content_type"],
                        "timestamp": snapshot_result["timestamp"]
                    })
                else:
                    # Send error status
                    await self.broadcast_to_device_connections(config.device_id, {
                        "type": "stream_error",
                        "device_id": config.device_id,
                        "error": snapshot_result.get("error", "Unknown error"),
                        "timestamp": datetime.now().isoformat()
                    })
                
                # Control frame rate
                await asyncio.sleep(1.0 / config.fps)
                
        except asyncio.CancelledError:
            logger.info(f"MJPEG stream cancelled for device {config.device_id}")
        except Exception as e:
            logger.error(f"MJPEG stream error for device {config.device_id}: {str(e)}")
    
    async def _handle_h264_stream(self, config: VideoStreamConfig):
        """Handle H.264 streaming"""
        try:
            logger.info(f"Starting H.264 stream for device {config.device_id}")
            
            # This would integrate with actual PiKVM H.264 streaming
            # For now, we'll send status updates
            
            while True:
                await self.broadcast_to_device_connections(config.device_id, {
                    "type": "h264_status",
                    "device_id": config.device_id,
                    "status": "active",
                    "bitrate": config.bitrate,
                    "resolution": f"{config.width}x{config.height}",
                    "fps": config.fps,
                    "timestamp": datetime.now().isoformat()
                })
                
                await asyncio.sleep(10)  # Status update every 10 seconds
                
        except asyncio.CancelledError:
            logger.info(f"H.264 stream cancelled for device {config.device_id}")
        except Exception as e:
            logger.error(f"H.264 stream error for device {config.device_id}: {str(e)}")
    
    async def handle_webrtc_signaling(self, device_id: str, websocket: WebSocket):
        """Handle WebRTC signaling through WebSocket"""
        try:
            await self.add_websocket_connection(device_id, websocket)
            
            # Send initial WebRTC offer/answer setup
            await websocket.send_json({
                "type": "webrtc_init",
                "device_id": device_id,
                "supported_codecs": ["H264", "VP8", "VP9"],
                "ice_servers": [
                    {"urls": "stun:stun.l.google.com:19302"},
                    {"urls": "stun:stun1.l.google.com:19302"}
                ]
            })
            
            while True:
                try:
                    # Receive WebRTC signaling messages
                    message = await websocket.receive_json()
                    await self._handle_webrtc_message(device_id, message, websocket)
                    
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    logger.error(f"WebRTC signaling error: {str(e)}")
                    break
            
        finally:
            await self.remove_websocket_connection(device_id, websocket)
    
    async def _handle_webrtc_message(self, device_id: str, message: Dict[str, Any], websocket: WebSocket):
        """Handle individual WebRTC signaling message"""
        message_type = message.get("type")
        
        if message_type == "offer":
            # Handle WebRTC offer
            await websocket.send_json({
                "type": "answer",
                "device_id": device_id,
                "sdp": {
                    "type": "answer",
                    "sdp": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"  # Simplified SDP
                }
            })
            
        elif message_type == "ice_candidate":
            # Handle ICE candidate
            await websocket.send_json({
                "type": "ice_candidate_ack",
                "device_id": device_id,
                "candidate": message.get("candidate")
            })
            
        elif message_type == "quality_change":
            # Handle quality change request
            new_quality = message.get("quality", "medium")
            await self._change_stream_quality(device_id, new_quality)
    
    async def _change_stream_quality(self, device_id: str, quality: str):
        """Change stream quality dynamically"""
        # Find active stream for device
        for stream_id, config in self.active_streams.items():
            if config.device_id == device_id and config.stream_type == StreamType.WEBRTC:
                # Update quality
                old_quality = config.quality
                config.quality = StreamQuality(quality)
                
                # Notify clients of quality change
                await self.broadcast_to_device_connections(device_id, {
                    "type": "quality_changed",
                    "device_id": device_id,
                    "old_quality": old_quality.value,
                    "new_quality": quality,
                    "timestamp": datetime.now().isoformat()
                })
                
                logger.info(f"Changed stream quality for device {device_id}: {old_quality.value} -> {quality}")
                break
    
    def get_active_streams(self) -> List[Dict[str, Any]]:
        """Get list of all active streams"""
        streams = []
        for stream_id, config in self.active_streams.items():
            connection_count = len(self.websocket_connections.get(config.device_id, set()))
            
            streams.append({
                "stream_id": stream_id,
                "device_id": config.device_id,
                "stream_type": config.stream_type.value,
                "quality": config.quality.value,
                "fps": config.fps,
                "bitrate": config.bitrate,
                "resolution": f"{config.width}x{config.height}",
                "connection_count": connection_count,
                "stream_url": self.get_stream_url(config)
            })
        
        return streams
    
    async def cleanup(self):
        """Clean up all streaming resources"""
        # Cancel all streaming tasks
        for task in self.stream_tasks.values():
            task.cancel()
        
        # Wait for all tasks to complete
        if self.stream_tasks:
            await asyncio.gather(*self.stream_tasks.values(), return_exceptions=True)
        
        # Close all WebSocket connections
        for device_connections in self.websocket_connections.values():
            for ws in list(device_connections):
                try:
                    await ws.close()
                except:
                    pass
        
        # Clear all data
        self.active_streams.clear()
        self.webrtc_connections.clear()
        self.websocket_connections.clear()
        self.stream_tasks.clear()

# Global video stream manager instance
video_stream_manager = VideoStreamManager()