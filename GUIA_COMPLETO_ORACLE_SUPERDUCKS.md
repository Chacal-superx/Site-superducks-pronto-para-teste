# 🔥 GUIA COMPLETO - IMPLEMENTAÇÃO ORACLE SUPERDUCKS.COM.BR

## 🎯 **CENÁRIO ATUAL → OBJETIVO FINAL**

### **SITUAÇÃO ATUAL:**
```
Cliente (navegador)
        ↓
superducks.com.br
        ↓
Instância Oracle (167.234.242.22)
        ↓
Nginx → Proxy direto para PiKVM
        ↓
PiKVM (100.102.63.36) via Tailscale
```

### **SITUAÇÃO DESEJADA:**
```
Cliente (navegador)
        ↓
superducks.com.br
        ↓
Instância Oracle (167.234.242.22)
        ↓
Nginx → Interface SuperDucks
        ↓
Sistema SuperDucks → Gerencia múltiplos PiKVMs
        ↓
PiKVM (100.102.63.36) + outros PiKVMs
```

---

## 📋 **IMPLEMENTAÇÃO PASSO A PASSO DETALHADA**

### **FASE 1: PREPARAÇÃO DA INSTÂNCIA ORACLE**

#### **1.1 Conectar e Verificar Estado Atual:**
```bash
# Conectar na instância
ssh -i chave_privada.pem ubuntu@167.234.242.22

# Verificar sistema
uname -a
df -h
free -h
sudo systemctl status nginx

# Ver configuração nginx atual
sudo cat /etc/nginx/sites-available/default

# Ver processos rodando
ps aux | grep nginx
netstat -tulpn | grep :80
```

#### **1.2 Fazer Backup Completo:**
```bash
# Backup configuração nginx
sudo mkdir -p /backup/nginx-$(date +%Y%m%d)
sudo cp -r /etc/nginx/* /backup/nginx-$(date +%Y%m%d)/

# Backup de qualquer site/app existente
sudo cp -r /var/www /backup/www-$(date +%Y%m%d)/ 2>/dev/null || true

# Listar backups
ls -la /backup/
```

#### **1.3 Instalar Dependências:**
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
sudo apt install docker.io docker-compose git curl wget htop -y

# Configurar Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu

# Aplicar mudanças de grupo
newgrp docker

# Verificar instalação
docker --version
docker-compose --version
docker info
```

### **FASE 2: DEPLOY DO SISTEMA SUPERDUCKS**

#### **2.1 Baixar e Preparar Código:**
```bash
# Ir para diretório home
cd ~

# Clonar repositório
git clone https://github.com/Chacal-superx/superducks-enterprise-manager.git
cd superducks-enterprise-manager

# Verificar estrutura
ls -la
ls backend/
ls frontend/src/

# Criar diretórios necessários
mkdir -p uploads nginx/ssl logs
chmod 755 uploads nginx/ssl logs
```

#### **2.2 Configurar Ambiente para Oracle:**
```bash
# Editar variáveis de ambiente do frontend
nano frontend/.env
```

**Conteúdo do frontend/.env:**
```env
REACT_APP_BACKEND_URL=https://superducks.com.br/api
NODE_ENV=production
WDS_SOCKET_PORT=443
```

```bash
# Editar variáveis do backend
nano backend/.env
```

**Conteúdo do backend/.env:**
```env
MONGO_URL=mongodb://admin:superducks_admin_2025@mongodb:27017/superducks_enterprise?authSource=admin
DB_NAME=superducks_enterprise
JWT_SECRET=superducks_jwt_secret_oracle_2025_change_me
JWT_EXPIRE_HOURS=24
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=https://superducks.com.br,http://superducks.com.br
PIKVM_DEFAULT_USER=admin
PIKVM_DEFAULT_PASS=admin
PIKVM_TIMEOUT=30
```

#### **2.3 Ajustar Docker Compose para Oracle:**
```bash
nano docker-compose.yml
```

**Docker Compose ajustado:**
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: superducks_mongodb
    restart: unless-stopped
    ports:
      - "127.0.0.1:27017:27017"  # Bind apenas localhost
    volumes:
      - mongodb_data:/data/db
      - ./logs/mongodb:/var/log/mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: superducks_admin_2025
      MONGO_INITDB_DATABASE: superducks_enterprise
    networks:
      - superducks_network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: superducks_backend
    restart: unless-stopped
    ports:
      - "127.0.0.1:8001:8001"  # Bind apenas localhost
    depends_on:
      - mongodb
    environment:
      MONGO_URL: mongodb://admin:superducks_admin_2025@mongodb:27017/superducks_enterprise?authSource=admin
      DB_NAME: superducks_enterprise
      JWT_SECRET: superducks_jwt_secret_oracle_2025_change_me
      JWT_EXPIRE_HOURS: 24
      ENVIRONMENT: production
      LOG_LEVEL: INFO
      CORS_ORIGINS: "https://superducks.com.br,http://superducks.com.br"
    volumes:
      - ./uploads:/tmp/uploads
      - ./logs/backend:/app/logs
    networks:
      - superducks_network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: superducks_frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"  # Bind apenas localhost
    depends_on:
      - backend
    environment:
      REACT_APP_BACKEND_URL: https://superducks.com.br/api
      NODE_ENV: production
    networks:
      - superducks_network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  mongodb_data:
    driver: local

networks:
  superducks_network:
    driver: bridge
```

#### **2.4 Executar Deploy:**
```bash
# Dar permissões
chmod +x deploy.sh

# Executar deploy
sudo ./deploy.sh

# OU se der problema, fazer manual:
docker-compose down
docker-compose up --build -d

# Aguardar containers subirem
sleep 30

# Verificar status
docker-compose ps
docker-compose logs --tail=50
```

### **FASE 3: CONFIGURAÇÃO NGINX PARA SUPERDUCKS.COM.BR**

#### **3.1 Parar Nginx Temporariamente:**
```bash
# Parar nginx
sudo systemctl stop nginx

# Verificar se parou
sudo systemctl status nginx
```

#### **3.2 Nova Configuração Nginx:**
```bash
# Backup da configuração atual
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.pikvm.backup

# Criar nova configuração
sudo nano /etc/nginx/sites-available/default
```

**Nova configuração completa:**
```nginx
# SuperDucks Enterprise Manager
# Configuração para superducks.com.br

upstream superducks_backend {
    server 127.0.0.1:8001;
    keepalive 32;
}

upstream superducks_frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream pikvm_device {
    server 100.102.63.36:80;
    keepalive 16;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

server {
    listen 80;
    server_name superducks.com.br www.superducks.com.br;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    # Logs
    access_log /var/log/nginx/superducks_access.log;
    error_log /var/log/nginx/superducks_error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # API routes para SuperDucks Backend
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://superducks_backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS headers
        add_header Access-Control-Allow-Origin "https://superducks.com.br" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;
        add_header Access-Control-Allow-Credentials "true" always;
        
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }

    # Login rate limiting
    location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://superducks_backend/api/auth/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket para real-time updates
    location /api/ws/ {
        proxy_pass http://superducks_backend/api/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Proxy para PiKVM direto (para stream de vídeo)
    location /pikvm/ {
        proxy_pass http://pikvm_device/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para streaming
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 86400s;
        
        # Buffer settings para streaming
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Interface SuperDucks (Frontend) - Rota principal
    location / {
        proxy_pass http://superducks_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Try files para React Router
        try_files $uri $uri/ @fallback;
    }

    # Fallback para React Router
    location @fallback {
        proxy_pass http://superducks_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files com cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://superducks_frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        access_log off;
        return 200 "SuperDucks OK\n";
        add_header Content-Type text/plain;
    }
}
```

#### **3.3 Testar e Aplicar Configuração:**
```bash
# Testar configuração
sudo nginx -t

# Se OK, iniciar nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verificar status
sudo systemctl status nginx

# Ver logs em tempo real
sudo tail -f /var/log/nginx/superducks_error.log
```

### **FASE 4: VERIFICAÇÃO E TESTES**

#### **4.1 Verificar Containers:**
```bash
# Status dos containers
docker-compose ps

# Logs dos containers
docker-compose logs --tail=50 backend
docker-compose logs --tail=50 frontend
docker-compose logs --tail=50 mongodb

# Verificar conectividade interna
docker exec superducks_backend curl -s http://localhost:8001/api/
docker exec superducks_frontend curl -s http://localhost:3000/
```

#### **4.2 Testes de Conectividade:**
```bash
# Teste local (na instância)
curl -s http://localhost:3000/
curl -s http://localhost:8001/api/
curl -s http://localhost:80/

# Teste externo (do seu computador)
curl -s http://superducks.com.br/
curl -s http://superducks.com.br/api/
```

#### **4.3 Verificar Logs:**
```bash
# Logs nginx
sudo tail -f /var/log/nginx/superducks_access.log
sudo tail -f /var/log/nginx/superducks_error.log

# Logs containers
docker-compose logs -f --tail=100

# Logs sistema
sudo journalctl -f -u nginx
```

### **FASE 5: CONFIGURAÇÃO INICIAL DO SISTEMA**

#### **5.1 Primeiro Acesso:**
1. **Abrir navegador**: http://superducks.com.br
2. **Deve mostrar**: Interface SuperDucks (não mais PiKVM direto)
3. **Login**: admin / admin123

#### **5.2 Configuração Inicial:**
1. **Alterar senha admin** (obrigatório)
2. **Adicionar PiKVM existente:**
   - Nome: PiKVM-Cliente-Principal
   - IP: 100.102.63.36
   - Usuário: admin
   - Senha: [senha do seu PiKVM]
   - Localização: Cliente Principal
3. **Testar conectividade** do dispositivo

#### **5.3 Criar Usuários:**
1. **Para o cliente:**
   - Username: cliente_visualizador
   - Role: Viewer
   - Permissão: VIEW_ONLY no PiKVM específico
2. **Para você (admin):**
   - Manter admin principal
   - Criar backup admin se necessário

---

## 🔧 **TROUBLESHOOTING COMPLETO**

### **Problema: Containers não sobem**
```bash
# Verificar logs
docker-compose logs

# Verificar portas
sudo netstat -tulpn | grep -E ':(3000|8001|27017)'

# Limpar e recriar
docker-compose down -v
docker system prune -f
docker-compose up --build -d
```

### **Problema: Nginx não conecta nos containers**
```bash
# Verificar se containers estão rodando
docker-compose ps

# Testar conectividade interna
curl http://127.0.0.1:3000
curl http://127.0.0.1:8001/api/

# Ver logs nginx
sudo tail -f /var/log/nginx/superducks_error.log
```

### **Problema: Site não carrega externamente**
```bash
# Verificar DNS
nslookup superducks.com.br
dig superducks.com.br

# Verificar firewall
sudo ufw status
sudo iptables -L

# Testar do próprio servidor
curl -H "Host: superducks.com.br" http://localhost/
```

### **Problema: PiKVM não conecta**
```bash
# Testar conectividade com PiKVM
curl -s http://100.102.63.36/
telnet 100.102.63.36 80

# Verificar rota Tailscale
ip route | grep 100.102.63.36
ping 100.102.63.36
```

---

## 📊 **MONITORAMENTO CONTÍNUO**

### **Scripts de Monitoramento:**
```bash
# Criar script de status
cat > ~/status_superducks.sh << 'EOF'
#!/bin/bash
echo "=== SuperDucks Status $(date) ==="
echo ""
echo "--- Containers ---"
docker-compose ps
echo ""
echo "--- Nginx Status ---"
sudo systemctl status nginx --no-pager
echo ""
echo "--- URLs Test ---"
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "Backend:  %{http_code}\n" http://localhost:8001/api/
curl -s -o /dev/null -w "Site:     %{http_code}\n" http://superducks.com.br/
echo ""
echo "--- Disk Usage ---"
df -h /
echo ""
echo "--- Memory Usage ---"
free -h
EOF

chmod +x ~/status_superducks.sh

# Executar
~/status_superducks.sh
```

### **Crontab para Monitoramento:**
```bash
# Adicionar ao crontab
crontab -e

# Adicionar estas linhas:
# Verificar status a cada 5 minutos
*/5 * * * * /home/ubuntu/status_superducks.sh >> /home/ubuntu/superducks_monitor.log 2>&1

# Restart automático se necessário (opcional)
0 3 * * * docker-compose -f /home/ubuntu/superducks-enterprise-manager/docker-compose.yml restart
```

---

## 🎯 **RESULTADO FINAL ESPERADO**

### **ANTES DA IMPLEMENTAÇÃO:**
- superducks.com.br → Interface básica PiKVM
- Apenas 1 dispositivo visível
- Sem controle de usuários
- Interface técnica do PiKVM

### **DEPOIS DA IMPLEMENTAÇÃO:**
- superducks.com.br → Interface SuperDucks empresarial
- Login admin para gerenciamento
- Sistema multi-usuário com permissões
- Interface profissional com branding SuperDucks
- Possibilidade de adicionar múltiplos PiKVMs
- Controles específicos por usuário
- Auditoria completa de ações
- Dashboard com métricas

### **FUNCIONALIDADES ATIVAS:**
✅ **Login/Cadastro** de usuários
✅ **Gerenciamento** de múltiplos PiKVMs
✅ **Permissões** granulares por dispositivo
✅ **Controles de energia** (Power On/Off/Restart)
✅ **Ações de teclado** (Ctrl+Alt+Del, Alt+Tab, etc.)
✅ **Reset HID** (teclado/mouse)
✅ **Configurações de resolução** (5 opções)
✅ **Upload de ISOs** para os PiKVMs
✅ **Streaming de vídeo** integrado
✅ **Logs de atividade** completos
✅ **Interface responsiva** (mobile/desktop)

**🚀 Com essa implementação, superducks.com.br se tornará uma plataforma empresarial completa para gerenciamento de múltiplos PiKVMs!**