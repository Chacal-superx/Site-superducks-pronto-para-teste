# 🚀 PiKVM Enterprise Manager - Guia de Deployment

## 📋 Pré-requisitos

### Sistema Operacional Suportado:
- Ubuntu 20.04+ / Debian 11+
- CentOS 8+ / RHEL 8+
- Docker & Docker Compose

### Recursos Mínimos:
- **CPU**: 2 cores
- **RAM**: 4GB
- **Disco**: 20GB livres
- **Rede**: Acesso à internet para download

## 🔧 Instalação Rápida (Modo Automático)

### 1. Clone ou baixe o projeto
```bash
# Opção 1: Clone do repositório (se já estiver no GitHub)
git clone https://github.com/seu-usuario/pikvm-enterprise-manager.git
cd pikvm-enterprise-manager

# Opção 2: Criar diretório e copiar arquivos
mkdir pikvm-enterprise-manager
cd pikvm-enterprise-manager
# Copie todos os arquivos do projeto para este diretório
```

### 2. Execute o script de deployment
```bash
# Dar permissão de execução
chmod +x deploy.sh

# Executar deployment
./deploy.sh
```

### 3. Aguarde a instalação
O script irá:
- ✅ Verificar dependências (Docker, Docker Compose)
- ✅ Criar diretórios necessários
- ✅ Gerar certificados SSL
- ✅ Construir e iniciar todos os serviços
- ✅ Configurar banco de dados
- ✅ Criar usuários padrão

### 4. Acesse o sistema
- **URL**: http://localhost:3000
- **Admin**: admin / admin123

---

## 🔧 Instalação Manual (Passo a Passo)

### 1. Instalar Docker (Ubuntu/Debian)
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
sudo apt install docker.io docker-compose -y

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Reiniciar sessão ou executar:
newgrp docker

# Verificar instalação
docker --version
docker-compose --version
```

### 2. Instalar Docker (CentOS/RHEL)
```bash
# Instalar Docker
sudo yum install -y docker docker-compose

# Iniciar e habilitar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Verificar instalação
docker --version
docker-compose --version
```

### 3. Preparar ambiente
```bash
# Criar diretório do projeto
mkdir pikvm-enterprise-manager
cd pikvm-enterprise-manager

# Criar estrutura de diretórios
mkdir -p backend frontend nginx uploads nginx/ssl mongo-init

# Copiar todos os arquivos do projeto para os diretórios apropriados
```

### 4. Configurar variáveis de ambiente (opcional)
```bash
# Editar docker-compose.yml se necessário
nano docker-compose.yml

# Principais variáveis para alterar:
# - MONGO_INITDB_ROOT_PASSWORD
# - JWT_SECRET
# - REACT_APP_BACKEND_URL (se usando domínio personalizado)
```

### 5. Iniciar serviços
```bash
# Construir e iniciar todos os serviços
docker-compose up --build -d

# Verificar status
docker-compose ps

# Ver logs (opcional)
docker-compose logs -f
```

### 6. Verificar funcionamento
```bash
# Testar Backend
curl http://localhost:8001/api/

# Testar Frontend
curl http://localhost:3000

# Testar Nginx (proxy)
curl http://localhost
```

---

## 🌐 Configuração de Domínio Personalizado

### 1. Configurar DNS
Aponte seu domínio (ex: superducks.com.br) para o IP do servidor.

### 2. Atualizar configurações
```bash
# Editar docker-compose.yml
nano docker-compose.yml

# Alterar:
REACT_APP_BACKEND_URL: https://superducks.com.br

# Editar nginx.conf
nano nginx/nginx.conf

# Alterar:
server_name superducks.com.br www.superducks.com.br;
```

### 3. Configurar SSL (Let's Encrypt)
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d superducks.com.br -d www.superducks.com.br

# Copiar certificados para Docker
sudo cp /etc/letsencrypt/live/superducks.com.br/fullchain.pem nginx/ssl/server.crt
sudo cp /etc/letsencrypt/live/superducks.com.br/privkey.pem nginx/ssl/server.key

# Reiniciar serviços
docker-compose restart
```

---

## 📊 Comandos de Gerenciamento

### Comandos Docker Compose:
```bash
# Ver status dos serviços
docker-compose ps

# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb

# Reiniciar todos os serviços
docker-compose restart

# Reiniciar um serviço específico
docker-compose restart backend

# Parar todos os serviços
docker-compose down

# Parar e remover volumes (CUIDADO: apaga dados)
docker-compose down -v

# Reconstruir e reiniciar
docker-compose up --build -d

# Atualizar apenas um serviço
docker-compose up -d --no-deps backend
```

### Comandos de Backup:
```bash
# Backup do banco de dados
docker exec pikvm_mongodb mongodump --out /backup
docker cp pikvm_mongodb:/backup ./backup-$(date +%Y%m%d)

# Backup dos uploads
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/
```

### Comandos de Monitoramento:
```bash
# Ver uso de recursos
docker stats

# Ver espaço em disco
docker system df

# Limpar containers/imagens não utilizados
docker system prune -a
```

---

## 🔒 Configurações de Segurança

### 1. Alterar senhas padrão
- Faça login como admin (admin/admin123)
- Vá em configurações de usuário
- Altere a senha padrão

### 2. Configurar Firewall
```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable

# CentOS/RHEL (FirewallD)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 3. Configurar SSL em produção
- Use certificados Let's Encrypt ou certificados válidos
- Force HTTPS redirect
- Configure HSTS headers

---

## 🔧 Configuração dos PiKVMs

### 1. Após o sistema estar rodando:
1. Faça login como admin
2. Vá em "Add Device"
3. Configure cada PiKVM:
   - Nome: "PiKVM-01"
   - IP: "100.102.63.36" (seu IP Tailscale)
   - Usuário: "admin"
   - Senha: "admin"

### 2. Configurar permissões:
1. Crie usuários para sua equipe
2. Configure permissões por dispositivo
3. Teste o acesso

---

## 🐛 Troubleshooting

### Problema: Serviços não iniciam
```bash
# Ver logs detalhados
docker-compose logs

# Verificar portas em uso
sudo netstat -tulpn | grep -E ':(80|3000|8001|27017)'

# Parar serviços conflitantes
sudo systemctl stop nginx  # Se tiver nginx nativo
sudo systemctl stop apache2  # Se tiver apache
```

### Problema: Não consegue acessar
```bash
# Verificar se serviços estão rodando
docker-compose ps

# Testar conectividade local
curl http://localhost:3000
curl http://localhost:8001/api/

# Verificar logs do nginx
docker-compose logs nginx
```

### Problema: Banco de dados não conecta
```bash
# Verificar logs do MongoDB
docker-compose logs mongodb

# Reiniciar apenas o MongoDB
docker-compose restart mongodb

# Verificar conectividade
docker exec pikvm_mongodb mongo --eval "db.stats()"
```

### Problema: Frontend não carrega
```bash
# Verificar logs do frontend
docker-compose logs frontend

# Reconstruir frontend
docker-compose up -d --no-deps --build frontend

# Limpar cache do browser
# Usar Ctrl+Shift+R ou modo anônimo
```

---

## 📈 Monitoramento e Logs

### Localização dos Logs:
- **Backend**: `docker-compose logs backend`
- **Frontend**: `docker-compose logs frontend`
- **MongoDB**: `docker-compose logs mongodb`
- **Nginx**: `docker-compose logs nginx`

### Monitoramento de Performance:
```bash
# Ver uso de recursos
docker stats

# Monitoramento contínuo
watch -n 5 docker stats --no-stream
```

---

## 🔄 Atualizações

### Para atualizar o sistema:
```bash
# Baixar nova versão
git pull origin main

# Reconstruir e reiniciar
docker-compose up --build -d

# Verificar logs
docker-compose logs -f
```

---

## 📞 Suporte

### Em caso de problemas:
1. Verificar logs: `docker-compose logs`
2. Verificar status: `docker-compose ps`
3. Reiniciar serviços: `docker-compose restart`
4. Verificar recursos: `docker stats`

### Informações para suporte:
- Versão do Docker: `docker --version`
- Versão do SO: `cat /etc/os-release`
- Logs dos serviços: `docker-compose logs`
- Status dos containers: `docker-compose ps`

---

## 🎉 Finalização

Após a instalação bem-sucedida:

1. ✅ **Acesse**: http://localhost:3000 (ou seu domínio)
2. ✅ **Login**: admin / admin123
3. ✅ **Configure** seus PiKVMs reais
4. ✅ **Crie usuários** para sua equipe
5. ✅ **Teste** todas as funcionalidades
6. ✅ **Altere senhas** padrão
7. ✅ **Configure SSL** para produção

**🚀 Seu PiKVM Enterprise Manager está pronto para usar!**