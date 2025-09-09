# 🚀 QUICK START - PiKVM Enterprise Manager

## ⚡ Início Rápido (5 minutos)

### 1️⃣ **Preparar Sistema**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install docker.io docker-compose git -y

# CentOS/RHEL  
sudo yum install docker docker-compose git -y

# Iniciar Docker
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker
```

### 2️⃣ **Baixar e Iniciar**
```bash
# Clonar repositório
git clone https://github.com/SEU_USUARIO/pikvm-enterprise-manager.git
cd pikvm-enterprise-manager

# Executar deployment automático
chmod +x deploy.sh
./deploy.sh
```

### 3️⃣ **Acessar Sistema**
- 🌐 **URL**: http://localhost:3000
- 👤 **Admin**: admin / admin123
- 👤 **User**: viewer1 / viewer123

---

## 🎯 **Configuração Inicial**

### **Para Administradores:**

1. **Login inicial**: admin / admin123
2. **Alterar senha** (obrigatório)
3. **Adicionar PiKVM**: 
   - Nome: PiKVM-Teste6
   - IP: 100.102.63.36
   - User/Pass: admin/admin
4. **Criar usuários** da equipe
5. **Configurar permissões** por dispositivo

### **Para Usuários Finais:**

1. **Receber credenciais** do administrador
2. **Acessar**: http://localhost:3000
3. **Login** com suas credenciais
4. **Selecionar dispositivo** permitido
5. **Usar controles** de power e teclado

---

## 🔧 **Comandos Essenciais**

```bash
# Ver status
docker-compose ps

# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Parar
docker-compose down

# Atualizar
git pull && docker-compose up --build -d
```

---

## 🆘 **Ajuda Rápida**

### **Não consegue acessar?**
```bash
# Verificar se está rodando
docker-compose ps

# Testar localmente
curl http://localhost:3000
curl http://localhost:8001/api/
```

### **Esqueceu senha admin?**
```bash
# Recriar usuário admin
docker exec pikvm_backend python init_admin.py
```

### **Portas ocupadas?**
```bash
# Ver o que está usando as portas
sudo netstat -tulpn | grep -E ':(80|3000|8001|27017)'

# Parar serviços conflitantes
sudo systemctl stop nginx apache2
```

---

## 📱 **URLs Importantes**

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8001/api/
- **Docs API**: http://localhost:8001/docs
- **Health Check**: http://localhost/health

---

## 🎉 **Próximos Passos**

1. ✅ **Configurar domínio** (superducks.com.br)
2. ✅ **Instalar SSL** certificado
3. ✅ **Backup automático**
4. ✅ **Monitoramento** avançado
5. ✅ **Integrar** todos os 50+ PiKVMs

**💪 Seu sistema enterprise está funcionando!**