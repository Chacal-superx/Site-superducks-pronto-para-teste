import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Save, ArrowLeft } from 'lucide-react';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

const AddRobot = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    serial_number: '',
    client_name: '',
    client_email: '',
    local_ip: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const generateSerialNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `PKV-${timestamp}-${random}`;
  };

  const handleGenerateSerial = () => {
    setFormData(prev => ({
      ...prev,
      serial_number: generateSerialNumber()
    }));
  };

  const validateForm = () => {
    const required = ['name', 'serial_number', 'client_name', 'client_email'];
    for (const field of required) {
      if (!formData[field].trim()) {
        toast.error(`O campo ${field === 'name' ? 'Nome' : 
                                field === 'serial_number' ? 'Número Serial' :
                                field === 'client_name' ? 'Nome do Cliente' : 
                                'Email do Cliente'} é obrigatório`);
        return false;
      }
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.client_email)) {
      toast.error('Por favor, insira um email válido');
      return false;
    }

    // Validate IP if provided
    if (formData.local_ip) {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(formData.local_ip)) {
        toast.error('Por favor, insira um IP local válido');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await apiService.createRobot(formData);
      toast.success('Robô adicionado com sucesso!');
      navigate('/robots');
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('serial number')) {
        toast.error('Já existe um robô com este número serial');
      } else {
        toast.error('Erro ao adicionar robô');
      }
      console.error('Error creating robot:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Adicionar Novo Robô</h1>
          <p className="text-gray-600 mt-1">
            Registre um novo robô PiKVM no sistema
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Monitor className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            Informações do Robô
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Robô *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Ex: PiKVM-Escritorio-01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="serial_number" className="block text-sm font-medium text-gray-700 mb-2">
              Número Serial *
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                id="serial_number"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleInputChange}
                placeholder="PKV-XXXXXX-XXXX"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <button
                type="button"
                onClick={handleGenerateSerial}
                className="btn-secondary px-3 py-2 text-sm"
              >
                Gerar
              </button>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Informações do Cliente
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="client_name" className="block text-sm font-medium text-gray-700 mb-2">
                Nome do Cliente *
              </label>
              <input
                type="text"
                id="client_name"
                name="client_name"
                value={formData.client_name}
                onChange={handleInputChange}
                placeholder="Nome completo ou empresa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="client_email" className="block text-sm font-medium text-gray-700 mb-2">
                Email do Cliente *
              </label>
              <input
                type="email"
                id="client_email"
                name="client_email"
                value={formData.client_email}
                onChange={handleInputChange}
                placeholder="cliente@exemplo.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Configurações de Rede (Opcional)
          </h3>
          
          <div>
            <label htmlFor="local_ip" className="block text-sm font-medium text-gray-700 mb-2">
              IP Local
            </label>
            <input
              type="text"
              id="local_ip"
              name="local_ip"
              value={formData.local_ip}
              onChange={handleInputChange}
              placeholder="192.168.1.100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              IP local do Raspberry Pi na rede do cliente (se conhecido)
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? (
              <div className="loading-spinner mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Salvando...' : 'Salvar Robô'}
          </button>
        </div>
      </form>

      {/* Instructions */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="text-lg font-medium text-blue-900 mb-3">
          Próximos Passos
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>1. Após salvar, você poderá acessar os scripts de configuração</p>
          <p>2. Execute o script de setup no Raspberry Pi</p>
          <p>3. Configure o Tailscale para acesso remoto</p>
          <p>4. Execute os diagnósticos para verificar o funcionamento</p>
        </div>
      </div>
    </div>
  );
};

export default AddRobot;