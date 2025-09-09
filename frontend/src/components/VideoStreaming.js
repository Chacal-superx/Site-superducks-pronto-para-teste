import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const VideoStreaming = ({ deviceId, deviceName }) => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamType, setStreamType] = useState('webrtc');
    const [quality, setQuality] = useState('medium');
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [error, setError] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [activeStreams, setActiveStreams] = useState([]);
    
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const websocketRef = useRef(null);
    const peerConnectionRef = useRef(null);

    useEffect(() => {
        loadActiveStreams();
        return () => {
            cleanup();
        };
    }, []);

    useEffect(() => {
        if (deviceId && isStreaming) {
            initializeStream();
        }
        return () => {
            cleanup();
        };
    }, [deviceId, isStreaming, streamType]);

    const loadActiveStreams = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/streaming/active`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            if (response.ok) {
                const data = await response.json();
                setActiveStreams(data.active_streams || []);
            }
        } catch (error) {
            console.error('Error loading active streams:', error);
        }
    };

    const startStream = async () => {
        try {
            setError(null);
            const token = localStorage.getItem('token');
            
            const config = {
                stream_type: streamType,
                quality: quality,
                fps: 30,
                bitrate: quality === 'high' ? 4000 : quality === 'medium' ? 2000 : 1000,
                width: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 640,
                height: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480
            };

            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/streaming/start/${deviceId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(config)
                }
            );

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setIsStreaming(true);
                    setConnectionStatus('connecting');
                    await loadActiveStreams();
                } else {
                    setError(result.error || 'Failed to start stream');
                }
            } else {
                const errorData = await response.json();
                setError(errorData.detail || 'Failed to start stream');
            }
        } catch (error) {
            console.error('Error starting stream:', error);
            setError('Network error starting stream');
        }
    };

    const stopStream = async () => {
        try {
            const token = localStorage.getItem('token');
            
            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/streaming/stop/${deviceId}?stream_type=${streamType}`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );

            if (response.ok) {
                cleanup();
                setIsStreaming(false);
                setConnectionStatus('disconnected');
                await loadActiveStreams();
            }
        } catch (error) {
            console.error('Error stopping stream:', error);
        }
    };

    const initializeStream = async () => {
        if (streamType === 'webrtc') {
            initializeWebRTC();
        } else if (streamType === 'mjpeg') {
            initializeMJPEG();
        }
    };

    const initializeWebRTC = async () => {
        try {
            // Create WebSocket connection for signaling
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/api/webrtc/${deviceId}`;
            
            websocketRef.current = new WebSocket(wsUrl);
            
            websocketRef.current.onopen = () => {
                console.log('WebRTC signaling connected');
                setConnectionStatus('connected');
            };
            
            websocketRef.current.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                await handleWebRTCMessage(message);
            };
            
            websocketRef.current.onclose = () => {
                console.log('WebRTC signaling disconnected');
                setConnectionStatus('disconnected');
            };
            
            websocketRef.current.onerror = (error) => {
                console.error('WebRTC signaling error:', error);
                setError('WebRTC connection failed');
                setConnectionStatus('error');
            };
        } catch (error) {
            console.error('Error initializing WebRTC:', error);
            setError('Failed to initialize WebRTC');
        }
    };

    const initializeMJPEG = async () => {
        try {
            // Create WebSocket connection for MJPEG frames
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/api/stream/${deviceId}`;
            
            websocketRef.current = new WebSocket(wsUrl);
            
            websocketRef.current.onopen = () => {
                console.log('MJPEG streaming connected');
                setConnectionStatus('connected');
                
                // Request to start MJPEG stream
                websocketRef.current.send(JSON.stringify({
                    type: 'start_stream',
                    stream_type: 'mjpeg',
                    quality: quality
                }));
            };
            
            websocketRef.current.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleMJPEGFrame(message);
            };
            
            websocketRef.current.onclose = () => {
                console.log('MJPEG streaming disconnected');
                setConnectionStatus('disconnected');
            };
            
            websocketRef.current.onerror = (error) => {
                console.error('MJPEG streaming error:', error);
                setError('MJPEG connection failed');
                setConnectionStatus('error');
            };
        } catch (error) {
            console.error('Error initializing MJPEG:', error);
            setError('Failed to initialize MJPEG streaming');
        }
    };

    const handleWebRTCMessage = async (message) => {
        switch (message.type) {
            case 'webrtc_init':
                await setupPeerConnection(message.ice_servers);
                break;
            case 'answer':
                if (peerConnectionRef.current && message.sdp) {
                    await peerConnectionRef.current.setRemoteDescription(message.sdp);
                }
                break;
            case 'ice_candidate':
                if (peerConnectionRef.current && message.candidate) {
                    await peerConnectionRef.current.addIceCandidate(message.candidate);
                }
                break;
            case 'webrtc_status':
                setConnectionStatus(message.status);
                break;
        }
    };

    const setupPeerConnection = async (iceServers) => {
        try {
            peerConnectionRef.current = new RTCPeerConnection({
                iceServers: iceServers || [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            peerConnectionRef.current.onicecandidate = (event) => {
                if (event.candidate && websocketRef.current) {
                    websocketRef.current.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: event.candidate
                    }));
                }
            };

            peerConnectionRef.current.ontrack = (event) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = event.streams[0];
                }
            };

            // Create offer
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            
            // Send offer
            if (websocketRef.current) {
                websocketRef.current.send(JSON.stringify({
                    type: 'offer',
                    sdp: offer
                }));
            }
        } catch (error) {
            console.error('Error setting up peer connection:', error);
            setError('Failed to setup WebRTC connection');
        }
    };

    const handleMJPEGFrame = (message) => {
        if (message.type === 'mjpeg_frame' && message.image_data) {
            // Display MJPEG frame on canvas
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                };
                
                img.src = `data:${message.content_type};base64,${message.image_data}`;
            }
        } else if (message.type === 'stream_error') {
            setError(message.error);
            setConnectionStatus('error');
        }
    };

    const captureSnapshot = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(
                `${process.env.REACT_APP_BACKEND_URL}/api/hardware/devices/${deviceId}/snapshot`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    setSnapshot(`data:${result.content_type};base64,${result.image_data}`);
                } else {
                    setError(result.error || 'Failed to capture snapshot');
                }
            }
        } catch (error) {
            console.error('Error capturing snapshot:', error);
            setError('Failed to capture snapshot');
        }
    };

    const changeQuality = async (newQuality) => {
        setQuality(newQuality);
        
        if (isStreaming && websocketRef.current) {
            websocketRef.current.send(JSON.stringify({
                type: 'quality_change',
                quality: newQuality
            }));
        }
    };

    const cleanup = () => {
        if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
        }
        
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        
        setConnectionStatus('disconnected');
        setError(null);
    };

    const getConnectionStatusBadge = () => {
        switch (connectionStatus) {
            case 'connected':
                return <Badge className="bg-green-500">Connected</Badge>;
            case 'connecting':
                return <Badge className="bg-yellow-500">Connecting</Badge>;
            case 'error':
                return <Badge variant="destructive">Error</Badge>;
            default:
                return <Badge variant="secondary">Disconnected</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-6 bg-gray-800 border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white">
                        Video Streaming - {deviceName}
                    </h3>
                    {getConnectionStatusBadge()}
                </div>

                {/* Stream Controls */}
                <div className="space-y-4 mb-6">
                    <div className="flex gap-4 items-center">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Stream Type
                            </label>
                            <select
                                value={streamType}
                                onChange={(e) => setStreamType(e.target.value)}
                                disabled={isStreaming}
                                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="webrtc">WebRTC (Low Latency)</option>
                                <option value="mjpeg">MJPEG (Compatible)</option>
                                <option value="h264">H.264 (High Quality)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Quality
                            </label>
                            <select
                                value={quality}
                                onChange={(e) => changeQuality(e.target.value)}
                                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="low">Low (640x480)</option>
                                <option value="medium">Medium (1280x720)</option>
                                <option value="high">High (1920x1080)</option>
                                <option value="auto">Auto</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        {!isStreaming ? (
                            <Button 
                                onClick={startStream}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                Start Stream
                            </Button>
                        ) : (
                            <Button 
                                onClick={stopStream}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                Stop Stream
                            </Button>
                        )}
                        
                        <Button 
                            onClick={captureSnapshot}
                            variant="outline"
                        >
                            Capture Snapshot
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-500 rounded-md p-3 mb-4">
                        <p className="text-red-200 text-sm">{error}</p>
                    </div>
                )}

                {/* Video Display Area */}
                <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    {streamType === 'webrtc' ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full object-contain"
                        />
                    )}
                    
                    {!isStreaming && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center text-gray-400">
                                <div className="text-4xl mb-2">📹</div>
                                <p>Click "Start Stream" to begin video streaming</p>
                                <p className="text-sm mt-1">Device: {deviceName}</p>
                            </div>
                        </div>
                    )}
                    
                    {isStreaming && connectionStatus === 'connecting' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <div className="text-center text-white">
                                <div className="animate-spin text-2xl mb-2">⟳</div>
                                <p>Connecting to video stream...</p>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Snapshot Preview */}
            {snapshot && (
                <Card className="p-6 bg-gray-800 border-gray-700">
                    <h4 className="text-lg font-semibold text-white mb-4">Latest Snapshot</h4>
                    <div className="max-w-md mx-auto">
                        <img 
                            src={snapshot} 
                            alt="Device Snapshot" 
                            className="w-full rounded-lg border border-gray-600"
                        />
                    </div>
                </Card>
            )}

            {/* Active Streams Summary */}
            {activeStreams.length > 0 && (
                <Card className="p-6 bg-gray-800 border-gray-700">
                    <h4 className="text-lg font-semibold text-white mb-4">Active Streams</h4>
                    <div className="space-y-2">
                        {activeStreams.map(stream => (
                            <div key={stream.stream_id} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                                <div>
                                    <p className="text-white font-medium">Device: {stream.device_id}</p>
                                    <p className="text-gray-400 text-sm">
                                        {stream.stream_type.toUpperCase()} • {stream.quality.toUpperCase()} • {stream.resolution}
                                    </p>
                                </div>
                                <Badge variant="outline">
                                    {stream.connection_count} viewers
                                </Badge>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default VideoStreaming;