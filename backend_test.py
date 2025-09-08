#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for PiKVM Enterprise Manager
Tests all implemented backend APIs with realistic data
"""

import requests
import json
import uuid
import time
import asyncio
import websockets
from datetime import datetime
import os
from pathlib import Path

# Configuration
BASE_URL = "https://pikvm-manager.preview.emergentagent.com/api"
TIMEOUT = 30

class PiKVMAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.timeout = TIMEOUT
        self.test_device_id = None
        self.test_results = []
        
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if not success and response_data:
            print(f"   Response: {response_data}")
    
    def test_health_check(self):
        """Test health check endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log_test("Health Check", True, "API is healthy", data)
                    return True
                else:
                    self.log_test("Health Check", False, f"Unhealthy status: {data.get('status')}", data)
                    return False
            else:
                self.log_test("Health Check", False, f"HTTP {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "PiKVM Enterprise Manager API" in data.get("message", ""):
                    self.log_test("Root Endpoint", True, "Root endpoint accessible", data)
                    return True
                else:
                    self.log_test("Root Endpoint", False, "Unexpected response format", data)
                    return False
            else:
                self.log_test("Root Endpoint", False, f"HTTP {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_test("Root Endpoint", False, f"Error: {str(e)}")
            return False
    
    def test_device_management(self):
        """Test complete device management flow"""
        # Test creating a device
        device_data = {
            "name": "Production Server 01",
            "ip_address": "192.168.1.100"
        }
        
        try:
            # Create device
            response = self.session.post(f"{self.base_url}/devices", json=device_data)
            if response.status_code == 200:
                device = response.json()
                self.test_device_id = device.get("id")
                self.log_test("Create Device", True, f"Device created with ID: {self.test_device_id}", device)
            else:
                self.log_test("Create Device", False, f"HTTP {response.status_code}", response.text)
                return False
            
            # List devices
            response = self.session.get(f"{self.base_url}/devices")
            if response.status_code == 200:
                devices = response.json()
                if isinstance(devices, list) and len(devices) > 0:
                    self.log_test("List Devices", True, f"Retrieved {len(devices)} devices", {"count": len(devices)})
                else:
                    self.log_test("List Devices", False, "No devices returned or invalid format", devices)
                    return False
            else:
                self.log_test("List Devices", False, f"HTTP {response.status_code}", response.text)
                return False
            
            # Get specific device
            if self.test_device_id:
                response = self.session.get(f"{self.base_url}/devices/{self.test_device_id}")
                if response.status_code == 200:
                    device = response.json()
                    if device.get("id") == self.test_device_id:
                        self.log_test("Get Device", True, "Device retrieved successfully", device)
                    else:
                        self.log_test("Get Device", False, "Device ID mismatch", device)
                        return False
                else:
                    self.log_test("Get Device", False, f"HTTP {response.status_code}", response.text)
                    return False
            
            return True
            
        except Exception as e:
            self.log_test("Device Management", False, f"Error: {str(e)}")
            return False
    
    def test_power_management(self):
        """Test power management APIs"""
        if not self.test_device_id:
            self.log_test("Power Management", False, "No test device available")
            return False
        
        power_actions = ["power_on", "power_off", "restart", "reset", "sleep"]
        
        for action in power_actions:
            try:
                power_request = {
                    "device_id": self.test_device_id,
                    "action": action
                }
                
                response = self.session.post(f"{self.base_url}/power/action", json=power_request)
                if response.status_code == 200:
                    result = response.json()
                    if "successfully" in result.get("message", "").lower():
                        self.log_test(f"Power Action - {action}", True, f"Action executed: {result.get('message')}", result)
                    else:
                        self.log_test(f"Power Action - {action}", False, "Unexpected response format", result)
                        return False
                else:
                    self.log_test(f"Power Action - {action}", False, f"HTTP {response.status_code}", response.text)
                    return False
                
                # Small delay between actions
                time.sleep(0.5)
                
            except Exception as e:
                self.log_test(f"Power Action - {action}", False, f"Error: {str(e)}")
                return False
        
        return True
    
    def test_input_control(self):
        """Test keyboard and mouse input APIs"""
        if not self.test_device_id:
            self.log_test("Input Control", False, "No test device available")
            return False
        
        # Test keyboard input
        try:
            keyboard_data = {
                "device_id": self.test_device_id,
                "keys": "ctrl+alt+del",
                "modifiers": ["ctrl", "alt"]
            }
            
            response = self.session.post(f"{self.base_url}/input/keyboard", json=keyboard_data)
            if response.status_code == 200:
                result = response.json()
                if "successfully" in result.get("message", "").lower():
                    self.log_test("Keyboard Input", True, f"Keyboard input sent: {result.get('message')}", result)
                else:
                    self.log_test("Keyboard Input", False, "Unexpected response format", result)
                    return False
            else:
                self.log_test("Keyboard Input", False, f"HTTP {response.status_code}", response.text)
                return False
            
            # Test mouse input
            mouse_data = {
                "device_id": self.test_device_id,
                "x": 500,
                "y": 300,
                "button": "left",
                "action": "click"
            }
            
            response = self.session.post(f"{self.base_url}/input/mouse", json=mouse_data)
            if response.status_code == 200:
                result = response.json()
                if "successfully" in result.get("message", "").lower():
                    self.log_test("Mouse Input", True, f"Mouse input sent: {result.get('message')}", result)
                else:
                    self.log_test("Mouse Input", False, "Unexpected response format", result)
                    return False
            else:
                self.log_test("Mouse Input", False, f"HTTP {response.status_code}", response.text)
                return False
            
            return True
            
        except Exception as e:
            self.log_test("Input Control", False, f"Error: {str(e)}")
            return False
    
    def test_system_monitoring(self):
        """Test system metrics endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/system/metrics")
            if response.status_code == 200:
                metrics = response.json()
                required_fields = ["cpu_usage", "memory_usage", "disk_usage", "uptime", "timestamp"]
                
                missing_fields = [field for field in required_fields if field not in metrics]
                if not missing_fields:
                    self.log_test("System Metrics", True, f"All metrics retrieved successfully", {
                        "cpu": f"{metrics.get('cpu_usage')}%",
                        "memory": f"{metrics.get('memory_usage')}%",
                        "disk": f"{metrics.get('disk_usage')}%"
                    })
                    return True
                else:
                    self.log_test("System Metrics", False, f"Missing fields: {missing_fields}", metrics)
                    return False
            else:
                self.log_test("System Metrics", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("System Metrics", False, f"Error: {str(e)}")
            return False
    
    def test_file_upload_list(self):
        """Test file upload listing (without actual upload due to complexity)"""
        try:
            response = self.session.get(f"{self.base_url}/upload/files")
            if response.status_code == 200:
                files = response.json()
                if isinstance(files, list):
                    self.log_test("File Upload List", True, f"File list retrieved: {len(files)} files", {"count": len(files)})
                    return True
                else:
                    self.log_test("File Upload List", False, "Invalid response format", files)
                    return False
            else:
                self.log_test("File Upload List", False, f"HTTP {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("File Upload List", False, f"Error: {str(e)}")
            return False
    
    def test_activity_logs(self):
        """Test activity logging endpoints"""
        try:
            # Test power logs
            response = self.session.get(f"{self.base_url}/logs/power")
            if response.status_code == 200:
                power_logs = response.json()
                if isinstance(power_logs, list):
                    self.log_test("Power Logs", True, f"Power logs retrieved: {len(power_logs)} entries", {"count": len(power_logs)})
                else:
                    self.log_test("Power Logs", False, "Invalid response format", power_logs)
                    return False
            else:
                self.log_test("Power Logs", False, f"HTTP {response.status_code}", response.text)
                return False
            
            # Test input logs
            response = self.session.get(f"{self.base_url}/logs/input")
            if response.status_code == 200:
                input_logs = response.json()
                if isinstance(input_logs, list):
                    self.log_test("Input Logs", True, f"Input logs retrieved: {len(input_logs)} entries", {"count": len(input_logs)})
                else:
                    self.log_test("Input Logs", False, "Invalid response format", input_logs)
                    return False
            else:
                self.log_test("Input Logs", False, f"HTTP {response.status_code}", response.text)
                return False
            
            return True
            
        except Exception as e:
            self.log_test("Activity Logs", False, f"Error: {str(e)}")
            return False
    
    def test_status_endpoints(self):
        """Test status check endpoints"""
        try:
            # Create status check
            status_data = {"client_name": "Enterprise Dashboard"}
            response = self.session.post(f"{self.base_url}/status", json=status_data)
            if response.status_code == 200:
                status = response.json()
                if status.get("client_name") == "Enterprise Dashboard":
                    self.log_test("Create Status Check", True, "Status check created successfully", status)
                else:
                    self.log_test("Create Status Check", False, "Unexpected response format", status)
                    return False
            else:
                self.log_test("Create Status Check", False, f"HTTP {response.status_code}", response.text)
                return False
            
            # Get status checks
            response = self.session.get(f"{self.base_url}/status")
            if response.status_code == 200:
                statuses = response.json()
                if isinstance(statuses, list):
                    self.log_test("Get Status Checks", True, f"Status checks retrieved: {len(statuses)} entries", {"count": len(statuses)})
                else:
                    self.log_test("Get Status Checks", False, "Invalid response format", statuses)
                    return False
            else:
                self.log_test("Get Status Checks", False, f"HTTP {response.status_code}", response.text)
                return False
            
            return True
            
        except Exception as e:
            self.log_test("Status Endpoints", False, f"Error: {str(e)}")
            return False
    
    def test_websocket_connection(self):
        """Test WebSocket connection (basic connectivity test)"""
        try:
            # Convert HTTPS URL to WSS for WebSocket
            ws_url = self.base_url.replace("https://", "wss://").replace("http://", "ws://")
            test_device_id = self.test_device_id or "test-device"
            ws_endpoint = f"{ws_url}/ws/{test_device_id}"
            
            async def test_ws():
                try:
                    # Use ping_timeout instead of timeout parameter
                    async with websockets.connect(ws_endpoint, ping_timeout=10) as websocket:
                        # Send heartbeat message
                        await websocket.send(json.dumps({"type": "heartbeat"}))
                        
                        # Wait for response
                        response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        data = json.loads(response)
                        
                        if data.get("type") == "heartbeat_response":
                            return True, "WebSocket heartbeat successful"
                        else:
                            return False, f"Unexpected response: {data}"
                            
                except asyncio.TimeoutError:
                    return False, "WebSocket timeout"
                except Exception as e:
                    return False, f"WebSocket error: {str(e)}"
            
            # Run async test
            success, message = asyncio.run(test_ws())
            self.log_test("WebSocket Connection", success, message)
            return success
            
        except Exception as e:
            self.log_test("WebSocket Connection", False, f"Error: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Clean up test device"""
        if self.test_device_id:
            try:
                response = self.session.delete(f"{self.base_url}/devices/{self.test_device_id}")
                if response.status_code == 200:
                    self.log_test("Cleanup Test Device", True, "Test device deleted successfully")
                else:
                    self.log_test("Cleanup Test Device", False, f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_test("Cleanup Test Device", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run comprehensive test suite"""
        print(f"\n🚀 Starting PiKVM Enterprise Manager API Tests")
        print(f"📡 Testing endpoint: {self.base_url}")
        print("=" * 60)
        
        # Core connectivity tests
        if not self.test_health_check():
            print("\n❌ Health check failed - stopping tests")
            return False
        
        if not self.test_root_endpoint():
            print("\n❌ Root endpoint failed - stopping tests")
            return False
        
        # API functionality tests
        test_methods = [
            self.test_device_management,
            self.test_power_management,
            self.test_input_control,
            self.test_system_monitoring,
            self.test_file_upload_list,
            self.test_activity_logs,
            self.test_status_endpoints,
            self.test_websocket_connection
        ]
        
        passed_tests = 0
        total_tests = len(test_methods)
        
        for test_method in test_methods:
            if test_method():
                passed_tests += 1
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"✅ Passed: {passed_tests}/{total_tests}")
        print(f"❌ Failed: {total_tests - passed_tests}/{total_tests}")
        
        if passed_tests == total_tests:
            print("🎉 ALL TESTS PASSED!")
            return True
        else:
            print("⚠️  SOME TESTS FAILED - Check details above")
            return False

def main():
    """Main test execution"""
    tester = PiKVMAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_results_detailed.json', 'w') as f:
        json.dump(tester.test_results, f, indent=2, default=str)
    
    print(f"\n📄 Detailed results saved to: /app/test_results_detailed.json")
    
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)