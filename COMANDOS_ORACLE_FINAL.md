# 🎯 COMANDOS FINAIS PARA INSTÂNCIA ORACLE

## 📱 **COPIE E EXECUTE SEQUENCIALMENTE**

### **1. 🔌 CONECTAR NA INSTÂNCIA ORACLE:**
```bash
ssh -i chave_privada.pem ubuntu@167.234.242.22
```

### **2. 🛠️ PREPARAR AMBIENTE:**
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker e Git
sudo apt install docker.io docker-compose git curl -y

# Configurar Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
newgrp docker

# Verificar instalação
docker --version
docker-compose --version
```

### **3. 💾 BACKUP CONFIGURAÇÃO NGINX ATUAL:**
```bash
# Fazer backup da config atual
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Ver configuração atual (para referência)
sudo cat /etc/nginx/sites-available/default
```

### **4. 📥 CLONAR E CONFIGURAR PROJETO:**
```bash
# Clonar repositório
git clone https://github.com/Chacal-superx/superducks-enterprise-manager.git
cd superducks-enterprise-manager

# Criar diretórios necessários
mkdir -p uploads nginx/ssl

# Editar docker-compose para não conflitar com nginx
nano docker-compose.yml
```

**Confirme que o docker-compose.yml tem esta configuração (sem porta 80):**
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

### **5. 🚀 INICIAR SISTEMA SUPERDUCKS:**
```bash
# Executar deploy
chmod +x deploy.sh
sudo ./deploy.sh

# Aguardar conclusão (10-15 minutos)

# Verificar se containers estão rodando
docker-compose ps

# Deve mostrar 3 containers: mongodb, backend, frontend
```

### **6. ⚙️ CONFIGURAR NGINX PARA NOVA INTERFACE:**
```bash
# Editar configuração do nginx
sudo nano /etc/nginx/sites-available/default
```

**Substitua todo o conteúdo por:**
```nginx
server {
    listen 80;
    server_name superducks.com.br www.superducks.com.br;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API routes para backend SuperDucks
    location /api/ {
        proxy_pass http://localhost:8001/api/;
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

    # Proxy direto para PiKVM (para quando a interface precisar acessar)
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
        
        # Timeout para streaming
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Interface SuperDucks (frontend) - rota principal
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### **7. ✅ APLICAR E TESTAR CONFIGURAÇÕES:**
```bash
# Testar configuração nginx
sudo nginx -t

# Se OK, recarregar nginx
sudo systemctl reload nginx

# Verificar status nginx
sudo systemctl status nginx

# Verificar containers
docker-compose ps
```

### **8. 🧪 TESTES FINAIS:**
```bash
# Testar API backend
curl http://localhost:8001/api/

# Testar frontend local
curl http://localhost:3000

# Testar acesso externo
curl http://superducks.com.br

# Se todos retornarem dados, está funcionando!
```

---

## 🌐 **ACESSO E CONFIGURAÇÃO**

### **1. ACESSAR NOVA INTERFACE:**
- **URL**: http://superducks.com.br
- **Login**: admin
- **Senha**: admin123

### **2. CONFIGURAR PRIMEIRO PIKVM:**
1. Após login, clique "Add Device"
2. **Nome**: PiKVM-Cliente-01
3. **IP**: 100.102.63.36
4. **Usuário**: admin
5. **Senha**: admin (ou senha do seu PiKVM)
6. Salvar

### **3. CRIAR USUÁRIOS PARA CLIENTES:**
1. Menu "Usuários" → "Adicionar"
2. **Role**: Viewer (para clientes só verem/controlarem)
3. **Permissões**: Configurar acesso apenas ao PiKVM específico

---

## 🔧 **COMANDOS DE MONITORAMENTO:**

```bash
# Ver status dos containers
docker-compose ps

# Ver logs em tempo real
docker-compose logs -f

# Ver logs específicos
docker-compose logs backend
docker-compose logs frontend

# Reiniciar serviços se necessário
docker-compose restart

# Ver status nginx
sudo systemctl status nginx

# Ver logs nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🎯 **RESULTADO ESPERADO**

### **ANTES:**
- superducks.com.br → PiKVM direto
- Interface básica do PiKVM
- Sem gestão de usuários

### **DEPOIS:**
- superducks.com.br → Interface SuperDucks empresarial
- Login admin para gerenciar
- Múltiplos PiKVMs (quando adicionar mais)
- Usuários com permissões específicas
- Controles de power, teclado, resolução
- Design profissional SuperDucks

---

## 🚨 **SE DER PROBLEMA:**

### **Portas ocupadas:**
```bash
sudo netstat -tulpn | grep -E ':(3000|8001|27017)'
```

### **Containers não sobem:**
```bash
docker-compose logs
docker-compose down -v
docker-compose up --build -d
```

### **Nginx não recarrega:**
```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🎉 **COMANDOS RESUMO FINAL:**

**Copie e cole tudo de uma vez:**

```bash
# Conectar
ssh -i chave_privada.pem ubuntu@167.234.242.22

# Preparar
sudo apt update && sudo apt install docker.io docker-compose git -y
sudo systemctl start docker && sudo usermod -aG docker ubuntu && newgrp docker

# Deploy
git clone https://github.com/Chacal-superx/superducks-enterprise-manager.git
cd superducks-enterprise-manager
mkdir -p uploads nginx/ssl
chmod +x deploy.sh
sudo ./deploy.sh

# Aguardar containers subirem
docker-compose ps

# Configurar nginx (editar /etc/nginx/sites-available/default)
sudo nano /etc/nginx/sites-available/default
# (colar configuração acima)

# Aplicar
sudo nginx -t && sudo systemctl reload nginx

# Testar
curl http://superducks.com.br
```

**🎯 Resultado: superducks.com.br agora servindo a interface SuperDucks que gerencia os PiKVMs!**