# 🚀 DEPLOY ORACLE - SUPERDUCKS.COM.BR

## 🎯 **INFRAESTRUTURA ATUAL IDENTIFICADA:**

- ✅ **Instância Oracle**: Ubuntu 24.04.3 LTS
- ✅ **IP Público**: 167.234.242.22
- ✅ **SSH**: ubuntu@167.234.242.22 (com chave privada)
- ✅ **Nginx**: Rodando e ativo (fazendo proxy)
- ✅ **Domínio**: superducks.com.br → proxy direto para PiKVM
- ✅ **PiKVM**: Tailscale IP 100.102.63.36

## 🎯 **OBJETIVO:**
Implementar a interface SuperDucks na instância Oracle, mantendo superducks.com.br, mas agora servindo a interface que gerencia o(s) PiKVM(s).

---

## 📋 **PLANO DE IMPLEMENTAÇÃO**

### **ESTRUTURA FINAL:**
```
superducks.com.br (usuários)
        ↓
Instância Oracle (167.234.242.22)
        ↓
Interface SuperDucks (Nova)
        ↓
PiKVM (100.102.63.36) via proxy
```

### **PASSOS:**
1. ✅ Conectar na instância Oracle
2. ✅ Instalar Docker na Oracle
3. ✅ Fazer deploy da interface SuperDucks
4. ✅ Reconfigurar Nginx para servir a interface
5. ✅ Configurar proxy para PiKVM 
6. ✅ Testar funcionamento completo

---

## 🔧 **COMANDOS PARA EXECUTAR**

### **1. CONECTAR NA INSTÂNCIA:**
```bash
ssh -i chave_privada.pem ubuntu@167.234.242.22
```

### **2. PREPARAR AMBIENTE:**
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
sudo apt install docker.io docker-compose git curl -y

# Configurar Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
newgrp docker

# Verificar Docker
docker --version
docker-compose --version
```

### **3. FAZER BACKUP DA CONFIGURAÇÃO ATUAL:**
```bash
# Backup config nginx atual
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup
sudo cp -r /etc/nginx /etc/nginx.backup

# Ver configuração atual
sudo cat /etc/nginx/sites-available/default
```

### **4. DEPLOY DO SISTEMA SUPERDUCKS:**
```bash
# Clonar repositório (assumindo que você já atualizou no GitHub)
git clone https://github.com/Chacal-superx/superducks-enterprise-manager.git
cd superducks-enterprise-manager

# Criar diretórios
mkdir -p uploads nginx/ssl

# Configurar para Oracle (não usar porta 80 - nginx já usa)
nano docker-compose.yml
```

### **5. DOCKER-COMPOSE ADAPTADO PARA ORACLE:**
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: superducks_mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: superducks_admin_2025
      MONGO_INITDB_DATABASE: superducks_enterprise
    networks:
      - superducks_network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: superducks_backend
    restart: unless-stopped
    ports:
      - "8001:8001"
    depends_on:
      - mongodb
    environment:
      MONGO_URL: mongodb://admin:superducks_admin_2025@mongodb:27017/superducks_enterprise?authSource=admin
      DB_NAME: superducks_enterprise
      JWT_SECRET: super_secret_jwt_key_change_in_production_2025
      JWT_EXPIRE_HOURS: 24
      ENVIRONMENT: production
      LOG_LEVEL: INFO
      CORS_ORIGINS: "*"
    volumes:
      - ./uploads:/tmp/uploads
    networks:
      - superducks_network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: superducks_frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      REACT_APP_BACKEND_URL: https://superducks.com.br/api
      NODE_ENV: production
    networks:
      - superducks_network

volumes:
  mongodb_data:
    driver: local

networks:
  superducks_network:
    driver: bridge
```

### **6. INICIAR SISTEMA:**
```bash
# Executar deploy
chmod +x deploy.sh
sudo ./deploy.sh

# Verificar se containers estão rodando
docker-compose ps
```

### **7. CONFIGURAR NGINX PARA SUPERDUCKS.COM.BR:**
```bash
# Editar configuração nginx
sudo nano /etc/nginx/sites-available/default
```

**Nova configuração Nginx:**
```nginx
server {
    listen 80;
    server_name superducks.com.br www.superducks.com.br;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API routes para backend
    location /api/ {
        proxy_pass http://localhost:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # Proxy para PiKVM direto (para streaming de vídeo)
    location /pikvm/ {
        proxy_pass http://100.102.63.36/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support para streaming
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Interface SuperDucks (frontend)
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### **8. APLICAR CONFIGURAÇÕES:**
```bash
# Testar configuração nginx
sudo nginx -t

# Se OK, recarregar nginx
sudo systemctl reload nginx

# Verificar status
sudo systemctl status nginx
```

### **9. CONFIGURAR FIREWALL (se necessário):**
```bash
# Verificar portas abertas
sudo ufw status

# Abrir portas necessárias
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

---

## 🧪 **TESTES**

### **Verificar se tudo está funcionando:**
```bash
# 1. Containers rodando
docker-compose ps

# 2. Backend respondendo
curl http://localhost:8001/api/

# 3. Frontend respondendo  
curl http://localhost:3000

# 4. Nginx configurado
sudo nginx -t

# 5. Acesso externo
curl https://superducks.com.br
```

### **Teste no navegador:**
1. **Acesse**: https://superducks.com.br
2. **Deve mostrar**: Interface SuperDucks (não mais PiKVM direto)
3. **Login**: admin / admin123
4. **Adicionar dispositivo**: Nome "PiKVM-Cliente", IP "100.102.63.36"

---

## 🔧 **CONFIGURAÇÃO DO PIKVM NO SISTEMA**

### **Depois do login como admin:**

1. **Adicionar dispositivo PiKVM:**
   - Nome: PiKVM-Cliente-01
   - IP: 100.102.63.36
   - Usuário: admin
   - Senha: admin (ou a senha do seu PiKVM)

2. **Criar usuários para clientes:**
   - Role: Viewer (para só ver e controlar)
   - Permissões: VIEW_ONLY ou CONTROL no dispositivo específico

3. **Configurar proxy de vídeo:**
   - O streaming de vídeo vai via /pikvm/ no nginx
   - Interface vai mostrar o stream do PiKVM real

---

## 📊 **RESULTADO FINAL**

### **ANTES:**
- superducks.com.br → PiKVM direto
- Só um PiKVM visível
- Sem controle de usuários

### **DEPOIS:**
- superducks.com.br → Interface SuperDucks
- Login admin / usuários
- Múltiplos PiKVMs gerenciáveis
- Controles específicos por usuário
- Streaming de vídeo integrado

---

## 🔥 **COMANDOS RESUMIDOS PARA COPIAR:**

```bash
# Na instância Oracle:
ssh -i chave_privada.pem ubuntu@167.234.242.22

# Preparar ambiente:
sudo apt update && sudo apt install docker.io docker-compose git -y
sudo systemctl start docker && sudo usermod -aG docker ubuntu && newgrp docker

# Deploy:
git clone https://github.com/Chacal-superx/superducks-enterprise-manager.git
cd superducks-enterprise-manager
mkdir -p uploads nginx/ssl
chmod +x deploy.sh
sudo ./deploy.sh

# Configurar Nginx:
sudo nano /etc/nginx/sites-available/default
# (colar configuração acima)
sudo nginx -t && sudo systemctl reload nginx

# Testar:
curl https://superducks.com.br
```

**🎯 Resultado: superducks.com.br servirá a interface SuperDucks que gerencia o PiKVM!**