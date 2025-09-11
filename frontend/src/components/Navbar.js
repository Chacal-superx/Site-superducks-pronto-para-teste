import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Monitor, 
  Plus, 
  BarChart3, 
  Settings, 
  Cpu, 
  Stethoscope 
} from 'lucide-react';

const Navbar = () => {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  const navItems = [
    { path: '/', icon: BarChart3, label: 'Dashboard' },
    { path: '/robots', icon: Monitor, label: 'Robôs' },
    { path: '/add-robot', icon: Plus, label: 'Adicionar Robô' },
    { path: '/bulk-operations', icon: Settings, label: 'Operações em Lote' },
    { path: '/diagnostics', icon: Stethoscope, label: 'Diagnósticos' },
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-2 rounded-lg">
              <Cpu className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">PiKVM Manager</h1>
              <p className="text-sm text-gray-600">SuperDucks</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Status indicator */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Sistema Online</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;