#!/usr/bin/env python3
"""
Initialize Admin User Script
Creates the initial super admin user for PiKVM Enterprise Manager
"""
import asyncio
import os
import uuid
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'test_database')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin_user():
    """Create initial admin user"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Check if admin user already exists
        existing_admin = await db.users.find_one({"username": "admin"})
        
        if existing_admin:
            print("❌ Admin user already exists!")
            return
        
        # Create admin user
        admin_user = {
            "id": str(uuid.uuid4()),
            "username": "admin",
            "email": "admin@pikvm-enterprise.local",
            "password_hash": pwd_context.hash("admin123"),
            "role": "super_admin",
            "active": True,
            "created_at": datetime.utcnow(),
            "last_login": None
        }
        
        await db.users.insert_one(admin_user)
        
        print("✅ Admin user created successfully!")
        print(f"   Username: admin")
        print(f"   Password: admin123")
        print(f"   Email: admin@pikvm-enterprise.local")
        print(f"   Role: super_admin")
        print("\n⚠️  IMPORTANT: Change the default password after first login!")
        
        # Create some example users for testing
        test_users = [
            {
                "id": str(uuid.uuid4()),
                "username": "operator1",
                "email": "operator1@company.com",
                "password_hash": pwd_context.hash("operator123"),
                "role": "operator",
                "active": True,
                "created_at": datetime.utcnow(),
                "last_login": None
            },
            {
                "id": str(uuid.uuid4()),
                "username": "viewer1",
                "email": "viewer1@company.com", 
                "password_hash": pwd_context.hash("viewer123"),
                "role": "viewer",
                "active": True,
                "created_at": datetime.utcnow(),
                "last_login": None
            }
        ]
        
        await db.users.insert_many(test_users)
        
        print("\n✅ Test users created:")
        print("   Username: operator1, Password: operator123, Role: operator")
        print("   Username: viewer1, Password: viewer123, Role: viewer")
        
    except Exception as e:
        print(f"❌ Error creating admin user: {str(e)}")
    finally:
        client.close()

async def setup_database_indexes():
    """Setup database indexes for better performance"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # User indexes
        await db.users.create_index("username", unique=True)
        await db.users.create_index("email", unique=True)
        await db.users.create_index("role")
        
        # Device indexes
        await db.devices.create_index("id", unique=True)
        await db.devices.create_index("ip_address")
        await db.devices.create_index("status")
        
        # Permission indexes
        await db.user_device_permissions.create_index([("user_id", 1), ("device_id", 1)], unique=True)
        await db.user_device_permissions.create_index("user_id")
        await db.user_device_permissions.create_index("device_id")
        
        # Log indexes
        await db.audit_log.create_index("timestamp")
        await db.audit_log.create_index("user_id")
        await db.audit_log.create_index("device_id")
        await db.power_logs.create_index("timestamp")
        await db.input_logs.create_index("timestamp")
        
        print("✅ Database indexes created successfully!")
        
    except Exception as e:
        print(f"❌ Error creating indexes: {str(e)}")
    finally:
        client.close()

async def main():
    print("🚀 Initializing PiKVM Enterprise Manager Database...")
    
    await setup_database_indexes()
    await create_admin_user()
    
    print("\n🎉 Initialization complete!")
    print("\n📋 Next steps:")
    print("1. Start the backend server")
    print("2. Login with admin/admin123")
    print("3. Change the default password")
    print("4. Add your PiKVM devices")
    print("5. Create users and assign permissions")

if __name__ == "__main__":
    asyncio.run(main())