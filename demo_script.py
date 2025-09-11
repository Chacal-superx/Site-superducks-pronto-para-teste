#!/usr/bin/env python3
"""
Script de Demonstração - Sistema PiKVM SuperDucks
Demonstra as principais funcionalidades da API
"""

import requests
import json
import time
from datetime import datetime

API_BASE = "http://localhost:8001/api"

def test_api_connection():
    """Testa conexão com a API"""
    try:
        response = requests.get(f"{API_BASE}/../")
        if response.status_code == 200:
            print("✅ API está funcionando!")
            return True
        else:
            print(f"❌ API retornou status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Erro ao conectar com API: {e}")
        return False

def create_demo_robots():
    """Cria robôs de demonstração"""
    demo_robots = [
        {
            "name": "PiKVM-Escritorio-01",
            "serial_number": "PKV-001-DEMO",
            "client_name": "Empresa ABC Ltda",
            "client_email": "admin@empresaabc.com.br",
            "local_ip": "192.168.1.100"
        },
        {
            "name": "PiKVM-Fabrica-02", 
            "serial_number": "PKV-002-DEMO",
            "client_name": "Industria XYZ S.A.",
            "client_email": "ti@industriaxyz.com.br",
            "local_ip": "192.168.2.50"
        },
        {
            "name": "PiKVM-Remoto-03",
            "serial_number": "PKV-003-DEMO", 
            "client_name": "Tech Solutions",
            "client_email": "suporte@techsolutions.com",
            "local_ip": "10.0.1.25"
        }
    ]
    
    created_robots = []
    
    for robot_data in demo_robots:
        try:
            response = requests.post(f"{API_BASE}/robots", json=robot_data)
            if response.status_code == 200:
                robot = response.json()
                print(f"✅ Robô criado: {robot['name']} (ID: {robot['id']})")
                created_robots.append(robot)
            else:
                print(f"❌ Erro ao criar robô {robot_data['name']}: {response.text}")
        except Exception as e:
            print(f"❌ Erro ao criar robô {robot_data['name']}: {e}")
    
    return created_robots

def simulate_robot_status_updates(robots):
    """Simula atualizações de status dos robôs"""
    statuses = ["online", "offline", "configuring"]
    
    for robot in robots:
        import random
        status = random.choice(statuses)
        tailscale_ip = f"100.{random.randint(100,200)}.{random.randint(1,255)}.{random.randint(1,255)}"
        
        update_data = {
            "status": status,
            "tailscale_ip": tailscale_ip
        }
        
        try:
            response = requests.put(f"{API_BASE}/robots/{robot['id']}", json=update_data)
            if response.status_code == 200:
                print(f"✅ Status atualizado: {robot['name']} -> {status} ({tailscale_ip})")
            else:
                print(f"❌ Erro ao atualizar {robot['name']}: {response.text}")
        except Exception as e:
            print(f"❌ Erro ao atualizar {robot['name']}: {e}")

def run_diagnostics(robots):
    """Executa diagnósticos nos robôs"""
    for robot in robots:
        try:
            response = requests.post(f"{API_BASE}/robots/{robot['id']}/diagnose")
            if response.status_code == 200:
                print(f"✅ Diagnóstico iniciado: {robot['name']}")
            else:
                print(f"❌ Erro no diagnóstico {robot['name']}: {response.text}")
        except Exception as e:
            print(f"❌ Erro no diagnóstico {robot['name']}: {e}")

def get_dashboard_stats():
    """Obtém estatísticas do dashboard"""
    try:
        response = requests.get(f"{API_BASE}/dashboard/stats")
        if response.status_code == 200:
            stats = response.json()
            print("\n📊 ESTATÍSTICAS DO DASHBOARD:")
            print(f"   Total de Robôs: {stats['total_robots']}")
            print(f"   Online: {stats['online_robots']}")
            print(f"   Offline: {stats['offline_robots']}")
            print(f"   Com Erro: {stats['error_robots']}")
            return stats
        else:
            print(f"❌ Erro ao obter stats: {response.text}")
    except Exception as e:
        print(f"❌ Erro ao obter stats: {e}")
    
    return None

def generate_configuration_script(robot):
    """Gera script de configuração para um robô"""
    try:
        response = requests.get(f"{API_BASE}/robots/{robot['id']}/configuration-script/setup")
        if response.status_code == 200:
            script_data = response.json()
            print(f"✅ Script gerado para {robot['name']}")
            
            # Salvar script em arquivo
            filename = f"/tmp/setup_{robot['serial_number']}.sh"
            with open(filename, 'w') as f:
                f.write(script_data['script'])
            print(f"   Script salvo em: {filename}")
            
            return script_data['script']
        else:
            print(f"❌ Erro ao gerar script para {robot['name']}: {response.text}")
    except Exception as e:
        print(f"❌ Erro ao gerar script para {robot['name']}: {e}")
    
    return None

def main():
    """Função principal da demonstração"""
    print("🚀 DEMONSTRAÇÃO DO SISTEMA PIKVM SUPERDUCKS")
    print("=" * 50)
    
    # 1. Testar conexão com API
    print("\n1. Testando conexão com a API...")
    if not test_api_connection():
        print("❌ Não foi possível conectar com a API. Verifique se o backend está rodando.")
        return
    
    # 2. Criar robôs de demonstração
    print("\n2. Criando robôs de demonstração...")
    robots = create_demo_robots()
    
    if not robots:
        print("❌ Nenhum robô foi criado. Verificando se já existem robôs...")
        try:
            response = requests.get(f"{API_BASE}/robots")
            if response.status_code == 200:
                robots = response.json()
                print(f"✅ Encontrados {len(robots)} robôs existentes")
            else:
                print("❌ Erro ao buscar robôs existentes")
                return
        except Exception as e:
            print(f"❌ Erro ao buscar robôs: {e}")
            return
    
    # 3. Simular atualizações de status
    print("\n3. Simulando atualizações de status...")
    simulate_robot_status_updates(robots)
    
    # 4. Aguardar um pouco
    print("\n4. Aguardando processamento...")
    time.sleep(2)
    
    # 5. Obter estatísticas
    print("\n5. Obtendo estatísticas do dashboard...")
    stats = get_dashboard_stats()
    
    # 6. Executar diagnósticos
    print("\n6. Executando diagnósticos...")
    run_diagnostics(robots[:2])  # Apenas nos primeiros 2 robôs
    
    # 7. Gerar scripts de configuração
    print("\n7. Gerando scripts de configuração...")
    for robot in robots[:1]:  # Apenas no primeiro robô
        generate_configuration_script(robot)
    
    # 8. Resumo final
    print("\n" + "=" * 50)
    print("🎉 DEMONSTRAÇÃO CONCLUÍDA!")
    print("\nO que foi demonstrado:")
    print("✅ Conexão com API REST")
    print("✅ Criação de robôs")
    print("✅ Atualização de status")
    print("✅ Obtenção de estatísticas")
    print("✅ Execução de diagnósticos")
    print("✅ Geração de scripts de configuração")
    
    print(f"\n📊 Robôs no sistema: {len(robots)}")
    print("\n🌐 Acesse o dashboard em: http://localhost:3000")
    print("📚 Documentação da API: http://localhost:8001/docs")
    
    print("\n" + "=" * 50)

if __name__ == "__main__":
    main()