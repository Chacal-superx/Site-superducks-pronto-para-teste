from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
import asyncio
import httpx
import json
import subprocess
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId
import logging
import hashlib
import schedule
import time
import threading
import psutil
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PiKVM Manager", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://www.superducks.com.br"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017/pikvm_manager")
client = MongoClient(MONGO_URL)
db = client.pikvm_manager

# Security
security = HTTPBearer()

# Data Models
class PiKVMRobot(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    serial_number: str
    client_name: str
    client_email: str
    tailscale_ip: Optional[str] = None
    local_ip: Optional[str] = None
    oracle_proxy_ip: Optional[str] = None
    status: str = "offline"  # offline, online, error, configuring
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    configuration: Dict[str, Any] = Field(default_factory=dict)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat() if v else None
        }

class PiKVMCreate(BaseModel):
    name: str
    serial_number: str
    client_name: str
    client_email: str
    local_ip: Optional[str] = None

class PiKVMUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    tailscale_ip: Optional[str] = None
    local_ip: Optional[str] = None
    oracle_proxy_ip: Optional[str] = None
    status: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = None

class DiagnosticResult(BaseModel):
    robot_id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    tests: Dict[str, Any]
    overall_status: str
    recommendations: List[str] = Field(default_factory=list)

class ConfigurationScript(BaseModel):
    robot_id: str
    script_type: str  # setup, optimization, diagnostic
    content: str
    description: str

# Helper functions
def robot_dict(robot) -> dict:
    """Convert MongoDB document to dict"""
    if robot:
        robot_copy = dict(robot)
        robot_copy["id"] = str(robot_copy["_id"])
        del robot_copy["_id"]
        # Convert datetime objects to strings
        if "created_at" in robot_copy and robot_copy["created_at"]:
            robot_copy["created_at"] = robot_copy["created_at"].isoformat()
        if "last_seen" in robot_copy and robot_copy["last_seen"]:
            robot_copy["last_seen"] = robot_copy["last_seen"].isoformat()
        return robot_copy
    return robot

async def ping_robot(ip: str) -> bool:
    """Check if robot is reachable"""
    try:
        process = await asyncio.create_subprocess_exec(
            'ping', '-c', '1', '-W', '2', ip,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return process.returncode == 0
    except:
        return False

async def check_pikvm_service(ip: str) -> Dict[str, Any]:
    """Check PiKVM service status"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"http://{ip}/api/info", auth=("admin", "admin"))
            if response.status_code == 200:
                return {"status": "online", "data": response.json()}
            else:
                return {"status": "error", "error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"status": "offline", "error": str(e)}

# API Routes
@app.get("/")
async def root():
    return {"message": "PiKVM Manager API", "version": "1.0.0"}

@app.get("/api/robots")
def get_robots():
    """Get all registered robots"""
    robots = list(db.robots.find())
    result = []
    for robot in robots:
        robot_copy = dict(robot)
        robot_copy["id"] = str(robot_copy["_id"])
        del robot_copy["_id"]
        # Convert datetime objects to strings
        if "created_at" in robot_copy and robot_copy["created_at"]:
            robot_copy["created_at"] = robot_copy["created_at"].isoformat()
        if "last_seen" in robot_copy and robot_copy["last_seen"]:
            robot_copy["last_seen"] = robot_copy["last_seen"].isoformat()
        result.append(robot_copy)
    return result

@app.get("/api/robots/{robot_id}", response_model=PiKVMRobot)
def get_robot(robot_id: str):
    """Get specific robot by ID"""
    robot = db.robots.find_one({"_id": ObjectId(robot_id)})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    return robot_dict(robot)

@app.post("/api/robots", response_model=PiKVMRobot)
def create_robot(robot: PiKVMCreate):
    """Register a new robot"""
    # Check if serial number already exists
    existing = db.robots.find_one({"serial_number": robot.serial_number})
    if existing:
        raise HTTPException(status_code=400, detail="Robot with this serial number already exists")
    
    # Create robot document
    robot_doc = {
        **robot.dict(),
        "status": "configuring",
        "created_at": datetime.now(),
        "configuration": {
            "ntp_configured": False,
            "tailscale_configured": False,
            "optimizations_applied": False
        },
        "diagnostics": {}
    }
    
    result = db.robots.insert_one(robot_doc)
    robot_doc["_id"] = result.inserted_id
    
    return robot_dict(robot_doc)

@app.put("/api/robots/{robot_id}", response_model=PiKVMRobot)
def update_robot(robot_id: str, robot_update: PiKVMUpdate):
    """Update robot information"""
    update_data = {k: v for k, v in robot_update.dict().items() if v is not None}
    
    result = db.robots.update_one(
        {"_id": ObjectId(robot_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Robot not found")
    
    robot = db.robots.find_one({"_id": ObjectId(robot_id)})
    return robot_dict(robot)

@app.delete("/api/robots/{robot_id}")
def delete_robot(robot_id: str):
    """Delete a robot"""
    result = db.robots.delete_one({"_id": ObjectId(robot_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"message": "Robot deleted successfully"}

@app.post("/api/robots/{robot_id}/diagnose")
async def diagnose_robot(robot_id: str, background_tasks: BackgroundTasks):
    """Run diagnostics on a robot"""
    robot = await db.robots.find_one({"_id": ObjectId(robot_id)})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    
    background_tasks.add_task(perform_robot_diagnostics, robot_id)
    return {"message": "Diagnostics started", "robot_id": robot_id}

async def perform_robot_diagnostics(robot_id: str):
    """Perform comprehensive diagnostics on a robot"""
    robot = await db.robots.find_one({"_id": ObjectId(robot_id)})
    if not robot:
        return
    
    tests = {}
    recommendations = []
    
    # Test 1: Ping test
    if robot.get("tailscale_ip"):
        ping_result = await ping_robot(robot["tailscale_ip"])
        tests["ping"] = {"status": "pass" if ping_result else "fail", "ip": robot["tailscale_ip"]}
        if not ping_result:
            recommendations.append("Check Tailscale connection")
    
    # Test 2: PiKVM service check
    if robot.get("tailscale_ip"):
        service_result = await check_pikvm_service(robot["tailscale_ip"])
        tests["pikvm_service"] = service_result
        if service_result["status"] != "online":
            recommendations.append("Check PiKVM service status")
    
    # Test 3: Local connectivity
    if robot.get("local_ip"):
        local_ping = await ping_robot(robot["local_ip"])
        tests["local_ping"] = {"status": "pass" if local_ping else "fail", "ip": robot["local_ip"]}
    
    # Determine overall status
    overall_status = "healthy"
    if any(test.get("status") == "fail" for test in tests.values()):
        overall_status = "issues"
    if not tests:
        overall_status = "unknown"
    
    # Save diagnostic results
    diagnostic = {
        "robot_id": robot_id,
        "timestamp": datetime.now(),
        "tests": tests,
        "overall_status": overall_status,
        "recommendations": recommendations
    }
    
    await db.diagnostics.insert_one(diagnostic)
    await db.robots.update_one(
        {"_id": ObjectId(robot_id)},
        {"$set": {"diagnostics": tests, "last_seen": datetime.now()}}
    )

@app.get("/api/robots/{robot_id}/diagnostics")
async def get_robot_diagnostics(robot_id: str):
    """Get diagnostic history for a robot"""
    diagnostics = await db.diagnostics.find({"robot_id": robot_id}).sort("timestamp", -1).to_list(50)
    for diag in diagnostics:
        diag["id"] = str(diag["_id"])
        del diag["_id"]
    return diagnostics

@app.get("/api/robots/{robot_id}/configuration-script/{script_type}")
async def generate_configuration_script(robot_id: str, script_type: str):
    """Generate configuration script for a robot"""
    robot = await db.robots.find_one({"_id": ObjectId(robot_id)})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    
    scripts = {
        "setup": generate_setup_script(robot),
        "optimization": generate_optimization_script(robot),
        "diagnostic": generate_diagnostic_script(robot),
        "ntp": generate_ntp_script(robot)
    }
    
    if script_type not in scripts:
        raise HTTPException(status_code=400, detail="Invalid script type")
    
    return {"script": scripts[script_type], "robot_id": robot_id, "type": script_type}

def generate_setup_script(robot):
    """Generate initial setup script for PiKVM"""
    return f"""#!/bin/bash
# PiKVM Setup Script for {robot['name']} (Serial: {robot['serial_number']})
# Generated at: {datetime.now().isoformat()}

echo "=== PiKVM Setup for {robot['name']} ==="

# 1. Configure NTP for automatic time sync
echo "Configuring NTP..."
rw
systemctl enable systemd-timesyncd
cat > /etc/systemd/timesyncd.conf << EOF
[Time]
NTP=pool.ntp.org 0.pool.ntp.org 1.pool.ntp.org
FallbackNTP=time.cloudflare.com time.google.com
RootDistanceMaxSec=5
PollIntervalMinSec=32
PollIntervalMaxSec=2048
EOF
systemctl restart systemd-timesyncd
timedatectl set-ntp true
ro

# 2. Install Tailscale
echo "Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-auth-kpAsuRYnf511CNTRL-WgGBbuo9n7E33CSF88Aw7EomcF5hv3VG --hostname=pikvm-{robot['serial_number']}

# 3. Create diagnostic script
cat > /root/pikvm_ready.sh << 'EOF'
#!/bin/bash
echo "=== PiKVM READY CHECK ==="

# Network tests
ping -c 2 8.8.8.8 && echo "[OK] Internet" || echo "[ERROR] No internet"
ping -c 2 192.168.0.1 && echo "[OK] Gateway" || echo "[ERROR] Gateway unreachable"

# Services
systemctl is-active --quiet kvmd && echo "[OK] KVMD active" || echo "[ERROR] KVMD failed"
systemctl is-active --quiet kvmd-nginx && echo "[OK] Nginx active" || echo "[ERROR] Nginx failed"

# Ports
ss -tlnp | grep -E ":80|:443" && echo "[OK] Nginx listening" || echo "[ERROR] Nginx not listening"

# Tailscale
tailscale status && echo "[OK] Tailscale connected" || echo "[ERROR] Tailscale disconnected"

# Time sync
timedatectl status | grep "System clock synchronized: yes" && echo "[OK] Time synchronized" || echo "[WARNING] Time not synchronized"

echo "=== END CHECK ==="
EOF
chmod +x /root/pikvm_ready.sh

echo "Setup completed for {robot['name']}"
echo "Tailscale IP: $(tailscale ip -4)"
echo "Run /root/pikvm_ready.sh to verify setup"
"""

def generate_optimization_script(robot):
    """Generate optimization script for PiKVM"""
    return f"""#!/bin/bash
# PiKVM Optimization Script for {robot['name']}
# Generated at: {datetime.now().isoformat()}

echo "=== PiKVM Optimization for {robot['name']} ==="

# 1. USB optimizations
echo "Applying USB optimizations..."
rw
cat > /etc/udev/rules.d/99-kvmd-extra.rules << 'EOF'
# Universal USB optimizations for reduced latency
SUBSYSTEM=="usb", ACTION=="add", TEST=="/power/control", ATTR{{power/control}}="on"
SUBSYSTEM=="usb", ACTION=="add", ATTR{{power/autosuspend}}="-1"
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", MODE="0666"
SUBSYSTEM=="input", GROUP="input", MODE="0666"
EOF

# Apply udev rules
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb
udevadm trigger --subsystem-match=input

# 2. Streaming optimizations
echo "Configuring streaming optimizations..."
cat > /etc/kvmd/override.yaml << 'EOF'
kvmd:
    streamer:
        forever: true
        cmd:
            - /usr/bin/ustreamer
            - --device=/dev/kvmd-video
            - --resolution=1280x720
            - --format=MJPEG
            - --quality=60
            - --desired-fps=30
            - --drop-same-frames=10
            - --last-as-base
            - --no-log-colors
            - --perf
            - --unix=/run/kvmd/streamer.sock
EOF

# 3. Network optimizations
echo "Applying network optimizations..."
cat > /etc/sysctl.d/99-kvmd-optimizations.conf << 'EOF'
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF

sysctl --system

# 4. Disable unnecessary services
echo "Disabling unnecessary services..."
systemctl disable --now avahi-daemon.service
systemctl disable --now bluetooth.service
systemctl disable --now triggerhappy.service

# 5. Restart services
systemctl restart kvmd
ro

echo "Optimization completed for {robot['name']}"
"""

def generate_diagnostic_script(robot):
    """Generate comprehensive diagnostic script"""
    return f"""#!/bin/bash
# PiKVM Diagnostic Script for {robot['name']}
# Generated at: {datetime.now().isoformat()}

echo "=== COMPREHENSIVE DIAGNOSTIC FOR {robot['name']} ==="

# System Information
echo "--- SYSTEM INFO ---"
echo "Hostname: $(hostname)"
echo "Serial: {robot['serial_number']}"
echo "Uptime: $(uptime -p)"
echo "Load: $(uptime | awk -F'load average:' '{{print $2}}')"
echo "Memory: $(free -h | grep Mem | awk '{{print $3 "/" $2}}')"
echo "Disk: $(df -h / | tail -1 | awk '{{print $3 "/" $2 " (" $5 " used)"}}')"
echo "Temperature: $(vcgencmd measure_temp 2>/dev/null || echo 'N/A')"

# Network Diagnostics
echo "--- NETWORK DIAGNOSTICS ---"
echo "Local IP: $(hostname -I | awk '{{print $1}}')"
echo "Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'Not configured')"
echo "Gateway: $(ip route | grep default | awk '{{print $3}}')"

# Connectivity Tests
echo "Testing internet connectivity..."
ping -c 3 8.8.8.8 > /dev/null && echo "[OK] Internet reachable" || echo "[ERROR] No internet"
ping -c 3 1.1.1.1 > /dev/null && echo "[OK] DNS working" || echo "[ERROR] DNS issues"

# Service Status
echo "--- SERVICE STATUS ---"
for service in kvmd kvmd-nginx tailscaled systemd-timesyncd; do
    if systemctl is-active --quiet $service; then
        echo "[OK] $service is running"
    else
        echo "[ERROR] $service is not running"
    fi
done

# Port Status
echo "--- PORT STATUS ---"
ss -tlnp | grep -E ":80|:443" > /dev/null && echo "[OK] Web ports open" || echo "[ERROR] Web ports closed"
ss -tlnp | grep ":22" > /dev/null && echo "[OK] SSH port open" || echo "[ERROR] SSH port closed"

# PiKVM Specific Tests
echo "--- PIKVM SPECIFIC ---"
if [ -f /opt/vc/bin/vcgencmd ]; then
    echo "Throttling: $(vcgencmd get_throttled)"
    echo "CPU Frequency: $(vcgencmd measure_clock arm)"
    echo "GPU Memory: $(vcgencmd get_mem gpu)"
fi

# Tailscale Status
echo "--- TAILSCALE STATUS ---"
if command -v tailscale > /dev/null; then
    tailscale status
else
    echo "Tailscale not installed"
fi

# Time Sync Status
echo "--- TIME SYNC ---"
timedatectl status

# USB Devices
echo "--- USB DEVICES ---"
lsusb 2>/dev/null || echo "lsusb not available"

# Log Analysis
echo "--- RECENT ERRORS ---"
journalctl -u kvmd --no-pager -n 10 | grep -i error || echo "No recent KVMD errors"

echo "=== DIAGNOSTIC COMPLETED ==="
"""

def generate_ntp_script(robot):
    """Generate NTP configuration script"""
    return f"""#!/bin/bash
# NTP Configuration Script for {robot['name']}
# Generated at: {datetime.now().isoformat()}

echo "=== NTP Configuration for {robot['name']} ==="

# Make system writable
rw

# Configure timezone (Brazil)
timedatectl set-timezone America/Sao_Paulo

# Enable NTP
systemctl enable systemd-timesyncd

# Configure NTP servers
cat > /etc/systemd/timesyncd.conf << 'EOF'
[Time]
NTP=a.st1.ntp.br b.st1.ntp.br c.st1.ntp.br
FallbackNTP=pool.ntp.org 0.pool.ntp.org 1.pool.ntp.org
RootDistanceMaxSec=5
PollIntervalMinSec=32
PollIntervalMaxSec=2048
EOF

# Restart time sync service
systemctl restart systemd-timesyncd

# Enable NTP synchronization
timedatectl set-ntp true

# Make system read-only again
ro

# Show status
echo "--- TIME SYNC STATUS ---"
timedatectl status

echo "NTP configuration completed for {robot['name']}"
echo "Current time: $(date)"
echo "Timezone: $(timedatectl | grep 'Time zone' | awk '{{print $3}}')"
"""

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    total_robots = await db.robots.count_documents({})
    online_robots = await db.robots.count_documents({"status": "online"})
    offline_robots = await db.robots.count_documents({"status": "offline"})
    error_robots = await db.robots.count_documents({"status": "error"})
    
    # Recent diagnostics
    recent_diagnostics = await db.diagnostics.find().sort("timestamp", -1).limit(10).to_list(10)
    
    return {
        "total_robots": total_robots,
        "online_robots": online_robots,
        "offline_robots": offline_robots,
        "error_robots": error_robots,
        "recent_diagnostics": len(recent_diagnostics)
    }

@app.post("/api/bulk-operations/diagnose-all")
async def diagnose_all_robots(background_tasks: BackgroundTasks):
    """Run diagnostics on all robots"""
    robots = await db.robots.find().to_list(1000)
    for robot in robots:
        background_tasks.add_task(perform_robot_diagnostics, str(robot["_id"]))
    
    return {"message": f"Diagnostics started for {len(robots)} robots"}

@app.get("/api/bulk-operations/export-configs")
async def export_all_configurations():
    """Export configuration scripts for all robots"""
    robots = await db.robots.find().to_list(1000)
    configs = []
    
    for robot in robots:
        robot_dict_data = robot_dict(robot)
        configs.append({
            "robot": robot_dict_data,
            "setup_script": generate_setup_script(robot),
            "optimization_script": generate_optimization_script(robot),
            "diagnostic_script": generate_diagnostic_script(robot),
            "ntp_script": generate_ntp_script(robot)
        })
    
    return {"configurations": configs, "total_robots": len(configs)}

# Background task for monitoring
def monitor_robots():
    """Background monitoring task"""
    while True:
        try:
            asyncio.run(check_all_robots_status())
        except Exception as e:
            logger.error(f"Monitoring error: {e}")
        time.sleep(300)  # Check every 5 minutes

async def check_all_robots_status():
    """Check status of all robots"""
    robots = await db.robots.find().to_list(1000)
    for robot in robots:
        if robot.get("tailscale_ip"):
            is_online = await ping_robot(robot["tailscale_ip"])
            status = "online" if is_online else "offline"
            await db.robots.update_one(
                {"_id": robot["_id"]},
                {"$set": {"status": status, "last_seen": datetime.now()}}
            )

# Start background monitoring
monitoring_thread = threading.Thread(target=monitor_robots, daemon=True)
monitoring_thread.start()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)