import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8001/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      // Redirect to login if needed
    }
    
    return Promise.reject(error);
  }
);

// API service functions
export const apiService = {
  // Robots
  getRobots: () => api.get('/robots'),
  getRobot: (id) => api.get(`/robots/${id}`),
  createRobot: (data) => api.post('/robots', data),
  updateRobot: (id, data) => api.put(`/robots/${id}`, data),
  deleteRobot: (id) => api.delete(`/robots/${id}`),

  // Diagnostics
  diagnoseRobot: (id) => api.post(`/robots/${id}/diagnose`),
  getRobotDiagnostics: (id) => api.get(`/robots/${id}/diagnostics`),
  diagnoseAllRobots: () => api.post('/bulk-operations/diagnose-all'),

  // Configuration Scripts
  getConfigurationScript: (id, type) => api.get(`/robots/${id}/configuration-script/${type}`),
  
  // Dashboard
  getDashboardStats: () => api.get('/dashboard/stats'),

  // Bulk Operations
  exportAllConfigurations: () => api.get('/bulk-operations/export-configs'),
};

export { api };
export default apiService;