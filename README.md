# 🚀 PiKVM Enterprise Manager

Sistema completo de gestão centralizada para múltiplos dispositivos PiKVM com interface web empresarial, controle de usuários e permissões granulares.

![PiKVM Enterprise Manager](https://img.shields.io/badge/PiKVM-Enterprise-blue) ![Docker](https://img.shields.io/badge/Docker-Ready-green) ![React](https://img.shields.io/badge/React-18-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green)

## ✨ Características Principais

- 🔐 **Sistema Multi-usuário** com 4 níveis de acesso (Super Admin, Admin, Operator, Viewer)
- 🎯 **Interface Dupla**: Admin (completa) + User (simplificada focada no controle)
- 🌐 **Portal Único** para gerenciar 50+ dispositivos PiKVM centralizadamente
- 🛡️ **Segurança Enterprise** com JWT + Audit Logs + Rate Limiting
- ⚡ **Deploy Rápido** com Docker Compose (5 minutos)
- 🎨 **Interface Moderna** em português com branding personalizado
- 📱 **Design Responsivo** para mobile, tablet e desktop
- 🔧 **Integração Real** com dispositivos PiKVM via HTTP API

## 🎯 Problema Resolvido

**ANTES**: 50+ interfaces PiKVM separadas, sem controle de usuários, sem auditoria
**DEPOIS**: 1 portal único, permissões granulares, auditoria completa, interface empresarial

## 🚀 Início Rápido (5 minutos)

### Pré-requisitos
- Docker & Docker Compose
- 4GB RAM, 2 CPU cores, 20GB disco

### Instalação Automática
```bash
# 1. Clonar repositório
git clone https://github.com/SEU_USUARIO/pikvm-enterprise-manager.git
cd pikvm-enterprise-manager

# 2. Executar deployment automático
chmod +x deploy.sh
./deploy.sh

# 3. Aguardar conclusão (5-10 minutos)
# O script fará tudo automaticamente!
```

### Acesso Imediato
Após a instalação:
- **🌐 URL**: http://localhost:3000
- **👤 Super Admin**: admin / admin123
- **👤 Operador**: operator1 / operator123  
- **👤 Visualizador**: viewer1 / viewer123

⭐ **Se este projeto te ajudou, dê uma estrela no GitHub!** ⭐
