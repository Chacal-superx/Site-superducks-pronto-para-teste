# 📋 Manual Completo - Configuração PiKVM + Oracle Cloud + Tailscale

## 📅 Data: 24/08/2025
## 🎯 Objetivo: Configurar PiKVM com acesso remoto seguro via Oracle Cloud

---

## 🔧 1. PREPARAÇÃO DO PIKVM LOCAL

### 1.1 Acessar o PiKVM via SSH
```bash
ssh root@192.168.0.193
# Senha: root
```

### 1.2 Verificar serviços do PiKVM
```bash
systemctl status kvmd-nginx kvmd
```

### 1.3 Configurar para aceitar HTTP (remover redirecionamento HTTPS)
```bash
nano /etc/kvmd/nginx/nginx.conf.mako
```

**Localizar e comentar as linhas:**
```nginx
# return 301 https://$host$request_uri;
# return 301 https://$host:${https_port}$request_uri;
```

### 1.4 Recriar configuração e reiniciar
```bash
/usr/bin/kvmd-nginx-mkconf /etc/kvmd/nginx/nginx.conf.mako /run/kvmd/nginx.conf
systemctl restart kvmd-nginx
```

### 1.5 Testar localmente
```bash
curl -v http://127.0.0.1:80/ 2>&1 | grep "HTTP/"
# Deve retornar: HTTP/1.1 302 Found (redirecionamento para login - NORMAL)
```

---

## 🌐 2. CONFIGURAÇÃO DO ORACLE CLOUD

### 2.1 Acessar a instância Oracle
```bash
ssh -i chave_privada.pem ubuntu@167.234.242.22
```

### 2.2 Instalar e configurar Nginx
```bash
sudo apt update
sudo apt install -y nginx
```

### 2.3 Criar configuração do proxy reverso
```bash
sudo nano /etc/nginx/conf.d/pikvm.conf
```

### 2.4 Configuração completa do proxy
```nginx
server {
    listen 80;
    server_name 167.234.242.22 superducks.com.br www.superducks.com.br;
    
    client_max_body_size 0;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        proxy_pass http://100.102.63.36:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    access_log /var/log/nginx/pikvm-access.log;
    error_log /var/log/nginx/pikvm-error.log;
}
```

### 2.5 Testar e recarregar configuração
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔗 3. CONFIGURAÇÃO TAILSCALE

### 3.1 No PiKVM
```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-auth-kpAsuRYnf511CNTRL-WgG8buo9n7E33CSF88Aw7Eomcf5hv3VG --hostname=pikvm1
tailscale ip -4
# Anotar IP: 100.102.63.36
```

### 3.2 No Oracle Cloud
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-kpAsuRYnf511CNTRL-WgG8buo9n7E33CSF88Aw7Eomcf5hv3VG --hostname=oracle-server
tailscale ip -4
# Anotar IP: 100.117.252.60
```

---

## 🧪 4. TESTES E VALIDAÇÃO

### 4.1 Testar conectividade Tailscale
```bash
# No Oracle Cloud:
ping 100.102.63.36
tailscale status
```

### 4.2 Testar proxy reverso
```bash
curl -v http://167.234.242.22/ 2>&1 | grep "HTTP/"
# Esperado: HTTP/1.1 302 Found
```

### 4.3 Testar página de login
```bash
curl -s http://167.234.242.22/login | grep -i "password\|login"
```

### 4.4 Verificar logs
```bash
sudo tail -f /var/log/nginx/pikvm-access.log
```

---

## ⚠️ 5. SOLUÇÃO DE PROBLEMAS COMUNS

### 🔴 Problema: Conflito de portas
**Sintoma:** Nginx não inicia, porta 80 já em uso
**Solução:**
```bash
# Verificar processos na porta 80
ss -tulpn | grep :80

# Parar serviço conflitante
systemctl stop kvmd-nginx  # ou outro serviço
```

### 🔴 Problema: Redirecionamento HTTPS indesejado
**Sintoma:** HTTP 301 para HTTPS
**Solução:**
```bash
# No PiKVM:
grep -r "return 301" /etc/kvmd/
nano /etc/kvmd/nginx/nginx.conf.mako
# Comentar linhas de redirecionamento
```

### 🔴 Problema: Erro de configuração Nginx
**Sintoma:** `nginx: configuration file test failed`
**Solução:**
```bash
# Verificar sintaxe
nginx -t

# Verificar logs detalhados
nginx -T
```

### 🔴 Problema: Conexão recusada
**Sintoma:** `Connection refused`
**Solução:**
```bash
# Verificar firewall
sudo ufw status
sudo ufw allow 80/tcp

# Verificar se serviço está rodando
systemctl status kvmd-nginx
```

---

## 🎯 6. COMANDOS DE MONITORAMENTO

### Verificar status dos serviços
```bash
systemctl status kvmd-nginx kvmd nginx
```

### Verificar conexões de rede
```bash
netstat -tulpn | grep :80
ss -tulpn | grep nginx
```

### Monitorar logs em tempo real
```bash
# Logs do PiKVM
journalctl -u kvmd-nginx -f

# Logs do Nginx Oracle
sudo tail -f /var/log/nginx/pikvm-access.log
```

### Testar performance
```bash
# Teste de conectividade
curl -o /dev/null -w "Tempo: %{time_total}s\n" http://167.234.242.22/

# Teste de velocidade
curl -o /dev/null -w "Velocidade: %{speed_download} bytes/s\n" http://167.234.242.22/share/js/kvm/janus.js
```

---

## 📊 7. OTIMIZAÇÕES RECOMENDADAS

### No PiKVM - Melhorar performance de streaming
```bash
nano /etc/kvmd/custom.yaml
```

```yaml
streamer:
  cmd:
    - /usr/bin/ustreamer
    - --device=/dev/video0
    - --persistent
    - --resolution=1280x720
    - --format=MJPEG
    - --quality=50
    - --desired-fps=30
    - --drop-same-frames=30
    - --no-hw-accel
```

### Reiniciar serviços após otimizações
```bash
systemctl restart kvmd
```

---

## 🔒 8. SEGURANÇA

### Alterar senhas padrão
1. Acessar http://167.234.242.22/
2. Login: admin / admin
3. **IMEDIATAMENTE** alterar senha do admin
4. Alterar senha do root via SSH

### Configurar firewall Oracle
```bash
sudo ufw allow 80/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## ✅ 9. CHECKLIST FINAL

- [ ] PiKVM acessível localmente: http://192.168.0.193/
- [ ] PiKVM acessível via Tailscale: http://100.102.63.36/
- [ ] PiKVM acessível via Oracle: http://167.234.242.22/
- [ ] Streaming de vídeo funcionando
- [ ] Controle de mouse/teclado funcionando
- [ ] Senhas padrão alteradas
- [ ] Logs sem erros críticos
- [ ] Performance adequada

---

## 📞 10. SUPORTE

### Comandos de diagnóstico
```bash
# Verificar todos os serviços
systemctl list-units | grep -E "(kvmd|nginx)"

# Verificar uso de recursos
htop
df -h

# Testar conectividade completa
curl -v http://167.234.242.22/ > /dev/null 2>&1 && echo "✅ ONLINE" || echo "❌ OFFLINE"
```

### Logs importantes
- PiKVM: `/var/log/kvmd/nginx.log`
- Oracle: `/var/log/nginx/pikvm-access.log`
- Tailscale: `tailscale status`

---

**🎯 CONFIGURAÇÃO CONCLUÍDA COM SUCESSO!**
Seu PiKVM está pronto para acesso remoto seguro via Oracle Cloud + Tailscale.

**📋 Arquivo salvo como: manual_pikvm_oracle_setup.txt**
**🔄 Para recriar esta configuração: Execute os comandos na ordem apresentada.**
