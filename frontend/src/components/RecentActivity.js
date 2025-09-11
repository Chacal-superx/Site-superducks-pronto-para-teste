import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Monitor, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

const RecentActivity = ({ robots = [] }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'offline':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'configuring':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Monitor className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'text-green-600 bg-green-50';
      case 'offline':
        return 'text-red-600 bg-red-50';
      case 'error':
        return 'text-orange-600 bg-orange-50';
      case 'configuring':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (robots.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        <p>Nenhuma atividade recente</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {robots.map((robot) => (
        <div key={robot.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
          <div className="flex-shrink-0">
            {getStatusIcon(robot.status)}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {robot.name}
            </p>
            <p className="text-sm text-gray-500 truncate">
              Cliente: {robot.client_name}
            </p>
          </div>
          
          <div className="flex-shrink-0 text-right">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(robot.status)}`}>
              {robot.status === 'online' ? 'Online' :
               robot.status === 'offline' ? 'Offline' :
               robot.status === 'error' ? 'Erro' :
               robot.status === 'configuring' ? 'Configurando' : 'Desconhecido'}
            </span>
            {robot.created_at && (
              <p className="text-xs text-gray-400 mt-1">
                {formatDistanceToNow(new Date(robot.created_at), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecentActivity;