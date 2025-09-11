import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import axios from 'axios';
import {
  MessageCircle,
  Send,
  Mic,
  MicOff,
  Users,
  Settings,
  Volume2,
  VolumeX,
  Reply,
  Edit3,
  Trash2,
  Plus,
  Hash,
  UserPlus,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  X,
  Check,
  CheckCheck
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('http', 'ws');

const ChatSystem = ({ user, token }) => {
  // State management
  const [chatRooms, setChatRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [userTyping, setUserTyping] = useState({});
  const [roomFilter, setRoomFilter] = useState('all'); // 'all', 'direct', 'groups'

  // Refs
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auth headers
  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` }
  };

  // Initialize chat system
  useEffect(() => {
    fetchChatRooms();
    fetchOnlineUsers();
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch chat rooms
  const fetchChatRooms = async () => {
    try {
      const response = await axios.get(`${API}/chat/rooms`, authHeaders);
      setChatRooms(response.data);
      
      // Auto-select first room if none selected
      if (response.data.length > 0 && !selectedRoom) {
        setSelectedRoom(response.data[0]);
      }
    } catch (error) {
      console.error('Error fetching chat rooms:', error);
    }
  };

  // Fetch online users
  const fetchOnlineUsers = async () => {
    try {
      const response = await axios.get(`${API}/chat/users/online`, authHeaders);
      setOnlineUsers(response.data.online_users || []);
    } catch (error) {
      console.error('Error fetching online users:', error);
    }
  };

  // Connect to WebSocket
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsURL = `${WS_URL}/api/chat/ws?token=${encodeURIComponent(token)}`;
    wsRef.current = new WebSocket(wsURL);

    wsRef.current.onopen = () => {
      console.log('Chat WebSocket connected');
      setIsConnected(true);
      
      // Join selected room if any
      if (selectedRoom) {
        wsRef.current.send(JSON.stringify({
          type: 'join_room',
          room_id: selectedRoom.id
        }));
      }
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    wsRef.current.onclose = () => {
      console.log('Chat WebSocket disconnected');
      setIsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('Chat WebSocket error:', error);
    };
  };

  // Handle WebSocket messages
  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'new_message':
        if (data.message.chat_room_id === selectedRoom?.id) {
          setMessages(prev => [...prev, data.message]);
        }
        break;
      
      case 'message_edited':
        if (data.message.chat_room_id === selectedRoom?.id) {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === data.message.id ? data.message : msg
            )
          );
        }
        break;
      
      case 'message_deleted':
        if (data.message.chat_room_id === selectedRoom?.id) {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === data.message.id ? data.message : msg
            )
          );
        }
        break;
      
      case 'user_status':
        setOnlineUsers(prev => {
          const updated = prev.filter(u => u.user_id !== data.user_id);
          if (data.status === 'online') {
            updated.push({
              user_id: data.user_id,
              status: data.status,
              last_seen: data.timestamp
            });
          }
          return updated;
        });
        break;
      
      case 'user_typing':
        if (data.room_id === selectedRoom?.id) {
          setUserTyping(prev => ({
            ...prev,
            [data.user_id]: {
              username: data.username,
              is_typing: data.is_typing,
              timestamp: Date.now()
            }
          }));
          
          // Clear typing after 3 seconds
          setTimeout(() => {
            setUserTyping(prev => {
              const updated = { ...prev };
              delete updated[data.user_id];
              return updated;
            });
          }, 3000);
        }
        break;
      
      case 'pong':
        // Handle ping response
        break;
      
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  // Fetch messages for selected room
  const fetchMessages = async (roomId, before = null) => {
    try {
      const url = `${API}/chat/rooms/${roomId}/messages${before ? `?before=${before}` : ''}`;
      const response = await axios.get(url, authHeaders);
      
      if (before) {
        // Prepend older messages
        setMessages(prev => [...response.data.messages, ...prev]);
      } else {
        // Set initial messages
        setMessages(response.data.messages);
      }
      
      return response.data.has_more;
    } catch (error) {
      console.error('Error fetching messages:', error);
      return false;
    }
  };

  // Select room and load messages
  const selectRoom = async (room) => {
    if (selectedRoom?.id === room.id) return;
    
    // Leave current room
    if (selectedRoom && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_room',
        room_id: selectedRoom.id
      }));
    }
    
    setSelectedRoom(room);
    setMessages([]);
    setReplyTo(null);
    setEditingMessage(null);
    
    // Join new room
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'join_room',
        room_id: room.id
      }));
    }
    
    // Fetch messages
    await fetchMessages(room.id);
  };

  // Send text message
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom) return;
    
    try {
      if (editingMessage) {
        // Edit existing message
        await axios.put(
          `${API}/chat/messages/${editingMessage.id}`,
          { content: newMessage },
          authHeaders
        );
        setEditingMessage(null);
      } else {
        // Send new message
        const messageData = {
          chat_room_id: selectedRoom.id,
          message_type: 'text',
          content: newMessage,
          reply_to: replyTo?.id
        };
        
        const response = await axios.post(`${API}/chat/messages`, messageData, authHeaders);
        
        // Add message to local state immediately
        setMessages(prev => [...prev, response.data]);
      }
      
      setNewMessage('');
      setReplyTo(null);
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!selectedRoom || !wsRef.current) return;
    
    // Send typing indicator
    wsRef.current.send(JSON.stringify({
      type: 'typing',
      room_id: selectedRoom.id,
      is_typing: true
    }));
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'typing',
          room_id: selectedRoom.id,
          is_typing: false
        }));
      }
    }, 3000);
  }, [selectedRoom]);

  // Start audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Erro ao acessar o microfone');
    }
  };

  // Stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Send audio message
  const sendAudioMessage = async () => {
    if (!audioURL || !selectedRoom) return;
    
    try {
      // Convert audio URL to file
      const response = await fetch(audioURL);
      const audioBlob = await response.blob();
      
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'audio.wav');
      formData.append('duration', '5.0'); // You would calculate actual duration
      
      await axios.post(
        `${API}/chat/messages/audio?room_id=${selectedRoom.id}`,
        formData,
        {
          ...authHeaders,
          headers: {
            ...authHeaders.headers,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      setAudioURL(null);
      
    } catch (error) {
      console.error('Error sending audio message:', error);
    }
  };

  // Create new chat room
  const createChatRoom = async (roomData) => {
    try {
      const response = await axios.post(`${API}/chat/rooms`, roomData, authHeaders);
      setChatRooms(prev => [response.data, ...prev]);
      setSelectedRoom(response.data);
      setShowCreateRoom(false);
    } catch (error) {
      console.error('Error creating chat room:', error);
    }
  };

  // Delete message
  const deleteMessage = async (messageId) => {
    if (!confirm('Tem certeza que deseja deletar esta mensagem?')) return;
    
    try {
      await axios.delete(`${API}/chat/messages/${messageId}`, authHeaders);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Format message time
  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  };

  // Get user status color
  const getUserStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  // Get typing users text
  const getTypingText = () => {
    const typingUsers = Object.values(userTyping).filter(u => u.is_typing);
    if (typingUsers.length === 0) return '';
    if (typingUsers.length === 1) return `${typingUsers[0].username} está digitando...`;
    if (typingUsers.length === 2) return `${typingUsers[0].username} e ${typingUsers[1].username} estão digitando...`;
    return `${typingUsers.length} pessoas estão digitando...`;
  };

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar - Chat Rooms and Users */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <Button size="sm" onClick={() => setShowCreateRoom(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Room filter tabs */}
          <div className="flex gap-1">
            <Button
              variant={roomFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoomFilter('all')}
              className="flex-1"
            >
              Todas
            </Button>
            <Button
              variant={roomFilter === 'direct' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoomFilter('direct')}
              className="flex-1"
            >
              Diretas
            </Button>
            <Button
              variant={roomFilter === 'groups' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoomFilter('groups')}
              className="flex-1"
            >
              Grupos
            </Button>
          </div>
        </div>

        {/* Chat Rooms List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {chatRooms
              .filter(room => {
                if (roomFilter === 'direct') return room.room_type === 'direct';
                if (roomFilter === 'groups') return room.room_type !== 'direct';
                return true;
              })
              .map(room => (
                <div
                  key={room.id}
                  onClick={() => selectRoom(room)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors mb-1 ${
                    selectedRoom?.id === room.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {room.room_type === 'direct' ? (
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <Users className="h-4 w-4 text-gray-600" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                          <Hash className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{room.name}</h4>
                      <p className="text-sm text-gray-500 truncate">
                        {room.participants.length} participantes
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Online Users */}
        <div className="border-t border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Online ({onlineUsers.length})
          </h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {onlineUsers.map(user => (
              <div key={user.user_id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getUserStatusColor(user.status)}`}></div>
                <span className="text-sm text-gray-700 truncate">{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedRoom ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {selectedRoom.room_type === 'direct' ? (
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-gray-600" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Hash className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedRoom.name}</h2>
                    <p className="text-sm text-gray-500">
                      {selectedRoom.participants.length} participantes
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm">
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {messages.map((message, index) => (
                <div key={message.id} className="group">
                  {/* Show date separator */}
                  {index === 0 || new Date(messages[index - 1].timestamp).toDateString() !== new Date(message.timestamp).toDateString() && (
                    <div className="flex items-center justify-center my-4">
                      <div className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                        {new Date(message.timestamp).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  )}
                  
                  <div className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender_id === user.id
                        ? 'bg-blue-500 text-white'
                        : message.message_type === 'system'
                        ? 'bg-gray-100 text-gray-600 text-center'
                        : 'bg-white border border-gray-200'
                    }`}>
                      {/* Reply indicator */}
                      {message.reply_to && (
                        <div className="text-xs opacity-75 mb-1 border-l-2 border-gray-300 pl-2">
                          Respondendo a mensagem...
                        </div>
                      )}
                      
                      {/* Sender name (if not own message) */}
                      {message.sender_id !== user.id && message.message_type !== 'system' && (
                        <div className="text-xs font-medium text-gray-600 mb-1">
                          {message.sender_username}
                        </div>
                      )}
                      
                      {/* Message content */}
                      {message.message_type === 'text' && (
                        <div className="break-words">
                          {message.content}
                          {message.edited && (
                            <span className="text-xs opacity-75 ml-2">(editada)</span>
                          )}
                        </div>
                      )}
                      
                      {message.message_type === 'audio' && (
                        <div className="flex items-center gap-2">
                          <Volume2 className="h-4 w-4" />
                          <span className="text-sm">Mensagem de áudio</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`${API}/chat/messages/${message.id}/audio`)}
                          >
                            <Volume2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      
                      {message.message_type === 'system' && (
                        <div className="text-sm">{message.content}</div>
                      )}
                      
                      {/* Message time */}
                      <div className={`text-xs mt-1 ${
                        message.sender_id === user.id ? 'text-blue-100' : 'text-gray-500'
                      }`}>
                        {formatMessageTime(message.timestamp)}
                      </div>
                    </div>
                    
                    {/* Message actions (show on hover) */}
                    {message.sender_id === user.id && message.message_type === 'text' && (
                      <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-start gap-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingMessage(message);
                            setNewMessage(message.content);
                          }}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMessage(message.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    {/* Reply button for other users' messages */}
                    {message.sender_id !== user.id && (
                      <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-start gap-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReplyTo(message)}
                        >
                          <Reply className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Typing indicator */}
              {getTypingText() && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm">
                    {getTypingText()}
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Reply indicator */}
            {replyTo && (
              <div className="px-4 py-2 bg-blue-50 border-t border-blue-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Reply className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-blue-700">
                      Respondendo a {replyTo.sender_username}: {replyTo.content.substring(0, 50)}...
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReplyTo(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Audio preview */}
            {audioURL && (
              <div className="px-4 py-3 bg-green-50 border-t border-green-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <audio controls src={audioURL} className="h-8" />
                    <span className="text-sm text-green-700">Áudio gravado</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={sendAudioMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAudioURL(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm">
                  <Paperclip className="h-4 w-4" />
                </Button>
                
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        handleTyping();
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={
                        editingMessage 
                          ? 'Editando mensagem...' 
                          : `Mensagem para ${selectedRoom.name}`
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      disabled={!selectedRoom || !isConnected}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2"
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="sm"
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || !selectedRoom || !isConnected}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              {editingMessage && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingMessage(null);
                      setNewMessage('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* No room selected */
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Selecione uma sala de chat
              </h3>
              <p className="text-gray-500">
                Escolha uma sala existente ou crie uma nova para começar a conversar
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateRoom && (
        <CreateRoomModal
          onClose={() => setShowCreateRoom(false)}
          onCreate={createChatRoom}
        />
      )}
    </div>
  );
};

// Create Room Modal Component
const CreateRoomModal = ({ onClose, onCreate }) => {
  const [roomData, setRoomData] = useState({
    name: '',
    description: '',
    room_type: 'public'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (roomData.name.trim()) {
      onCreate(roomData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Criar Nova Sala</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Sala
              </label>
              <input
                type="text"
                value={roomData.name}
                onChange={(e) => setRoomData({...roomData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Digite o nome da sala"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição (opcional)
              </label>
              <textarea
                value={roomData.description}
                onChange={(e) => setRoomData({...roomData, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Descreva o propósito da sala"
                rows={3}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo da Sala
              </label>
              <select
                value={roomData.room_type}
                onChange={(e) => setRoomData({...roomData, room_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="public">Pública</option>
                <option value="private">Privada</option>
              </select>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Criar Sala
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatSystem;