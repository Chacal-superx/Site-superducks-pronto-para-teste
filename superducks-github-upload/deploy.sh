#!/bin/bash

# Super Ducks Enterprise Manager - Deployment Script
# Autor: SuperDucks Team
# Data: 2025

set -e

echo "🚀 Super Ducks Enterprise Manager - Deployment Script"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    print_status "Verificando se Docker está instalado..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker não encontrado! Por favor instale o Docker primeiro."
        echo "Ubuntu/Debian: sudo apt-get update && sudo apt-get install docker.io docker-compose"
        echo "CentOS/RHEL: sudo yum install docker docker-compose"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose não encontrado! Por favor instale o Docker Compose."
        exit 1
    fi
    
    print_success "Docker e Docker Compose encontrados!"
}

# Check if ports are available
check_ports() {
    print_status "Verificando portas disponíveis..."
    
    ports=(80 443 3000 8001 27017)
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
            print_warning "Porta $port está em uso. Verifique se não há conflitos."
        fi
    done
}

# Create necessary directories
create_directories() {
    print_status "Criando diretórios necessários..."
    
    mkdir -p uploads
    mkdir -p nginx/ssl
    mkdir -p mongo-init
    
    print_success "Diretórios criados!"
}

# Generate SSL certificates (self-signed for development)
generate_ssl() {
    print_status "Gerando certificados SSL..."
    
    if [ ! -f nginx/ssl/server.crt ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/server.key \
            -out nginx/ssl/server.crt \
            -subj "/C=BR/ST=SP/L=SaoPaulo/O=SuperDucks/CN=localhost" \
            2>/dev/null || print_warning "Falha ao gerar SSL. Continuando sem HTTPS..."
        
        if [ -f nginx/ssl/server.crt ]; then
            print_success "Certificados SSL gerados!"
        fi
    else
        print_success "Certificados SSL já existem!"
    fi
}

# Build and start services
start_services() {
    print_status "Construindo e iniciando serviços..."
    
    # Stop any existing containers
    docker-compose down 2>/dev/null || true
    
    # Build and start
    docker-compose up --build -d
    
    print_success "Serviços iniciados!"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Aguardando serviços ficarem prontos..."
    
    # Wait for MongoDB
    print_status "Aguardando MongoDB..."
    sleep 10
    
    # Wait for Backend
    print_status "Aguardando Backend..."
    for i in {1..30}; do
        if curl -s http://localhost:8001/api/ > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    # Wait for Frontend
    print_status "Aguardando Frontend..."
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    print_success "Todos os serviços estão prontos!"
}

# Show final information
show_info() {
    echo ""
    echo "🎉 DEPLOYMENT CONCLUÍDO COM SUCESSO!"
    echo "===================================="
    echo ""
    print_success "Super Ducks Enterprise Manager está rodando!"
    echo ""
    echo -e "${BLUE}📱 URLs de Acesso:${NC}"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend API: http://localhost:8001/api"
    echo "   Nginx (Proxy): http://localhost"
    echo ""
    echo -e "${BLUE}👤 Credenciais Padrão:${NC}"
    echo "   Super Admin: admin / admin123"
    echo "   Operador: operator1 / operator123"
    echo "   Visualizador: viewer1 / viewer123"
    echo ""
    echo -e "${BLUE}🔧 Comandos Úteis:${NC}"
    echo "   Ver logs: docker-compose logs -f"
    echo "   Parar: docker-compose down"
    echo "   Reiniciar: docker-compose restart"
    echo "   Status: docker-compose ps"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANTE:${NC}"
    echo "   1. Altere as senhas padrão após o primeiro login"
    echo "   2. Configure seus dispositivos PiKVM reais"
    echo "   3. Crie usuários para sua equipe"
    echo "   4. Para produção, configure SSL certificados válidos"
    echo ""
    print_success "Acesse http://localhost:3000 para começar!"
}

# Main execution
main() {
    echo ""
    print_status "Iniciando deployment do Super Ducks Enterprise Manager..."
    echo ""
    
    check_docker
    check_ports
    create_directories
    generate_ssl
    start_services
    wait_for_services
    show_info
}

# Run main function
main