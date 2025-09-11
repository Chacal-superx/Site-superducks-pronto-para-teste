import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Monitor, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  ExternalLink,
  Settings,
  Trash2,
  Eye
} from 'lucide-react';
import { apiService } from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import toast from 'react-hot-toast';

const RobotList = () => {
  const [robots, setRobots] = useState([]);
  const [filteredRobots, setFilteredRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    loadRobots();
  }, []);

  useEffect(() => {
    filterAndSortRobots();
  }, [robots, searchTerm, statusFilter, sortBy]);

  const loadRobots = async () => {
    try {
      const response = await apiService.getRobots();
      setRobots(response.data);
    } catch (error) {
      toast.error('Erro ao carregar lista de robôs');
      console.error('Error loading robots:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortRobots = () => {
    let filtered = robots.filter(robot => {
      const matchesSearch = robot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           robot.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           robot.serial_number.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || robot.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });

    // Sort robots
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'client':
          return a.client_name.localeCompare(b.client_name);
        case 'created':
          return new Date(b.created_at) - new Date(a.created_at);
        default:
          return 0;
      }
    });

    setFilteredRobots(filtered);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'offline':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'configuring':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      default:
        return <Monitor className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      online: 'bg-green-100 text-green-800',
      offline: 'bg-red-100 text-red-800',
      error: 'bg-orange-100 text-orange-800',
      configuring: 'bg-blue-100 text-blue-800',
    };

    const labels = {
      online: 'Online',
      offline: 'Offline',
      error: 'Erro',
      configuring: 'Configurando',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || 'Desconhecido'}
      </span>
    );
  };

  const handleDeleteRobot = async (robotId, robotName) => {
    if (!window.confirm(`Tem certeza que deseja excluir o robô "${robotName}"?`)) {
      return;
    }

    try {
      await apiService.deleteRobot(robotId);
      toast.success('Robô excluído com sucesso');
      loadRobots();
    } catch (error) {
      toast.error('Erro ao excluir robô');
      console.error('Error deleting robot:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Carregando robôs..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Robôs PiKVM</h1>
          <p className="text-gray-600 mt-1">
            Gerencie todos os seus robôs PiKVM
          </p>
        </div>
        <Link to="/add-robot" className="btn-primary">
          <Monitor className="h-4 w-4 mr-2" />
          Adicionar Robô
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, cliente ou serial..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todos os Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="error">Com Erro</option>
              <option value="configuring">Configurando</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="name">Ordenar por Nome</option>
              <option value="status">Ordenar por Status</option>
              <option value="client">Ordenar por Cliente</option>
              <option value="created">Ordenar por Data</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Mostrando {filteredRobots.length} de {robots.length} robôs
      </div>

      {/* Robot Grid */}
      {filteredRobots.length === 0 ? (
        <div className="card text-center py-12">
          <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lr font-medium text-gray-900 mb-2">
            Nenhum robô encontrado
          </h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all' 
              ? 'Tente ajustar os filtros de busca'
              : 'Comece adicionando seu primeiro robô PiKVM'
            }
          </p>
          {!searchTerm && statusFilter === 'all' && (
            <Link to="/add-robot" className="btn-primary">
              Adicionar Primeiro Robô
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRobots.map((robot) => (
            <div key={robot.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(robot.status)}
                  <div>
                    <h3 className="font-semibold text-gray-900">{robot.name}</h3>
                    <p className="text-sm text-gray-600">#{robot.serial_number}</p>
                  </div>
                </div>
                {getStatusBadge(robot.status)}
              </div>

              <div className="space-y-2 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">Cliente</p>
                  <p className="text-sm text-gray-600">{robot.client_name}</p>
                </div>
                
                {robot.tailscale_ip && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">IP Tailscale</p>
                    <p className="text-sm text-gray-600 font-mono">{robot.tailscale_ip}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="flex space-x-2">
                  <Link
                    to={`/robots/${robot.id}`}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Detalhes
                  </Link>
                  
                  {robot.tailscale_ip && robot.status === 'online' && (
                    <a
                      href={`http://${robot.tailscale_ip}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Acessar
                    </a>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteRobot(robot.id, robot.name)}
                  className="text-red-600 hover:text-red-800 p-1"
                  title="Excluir robô"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RobotList;