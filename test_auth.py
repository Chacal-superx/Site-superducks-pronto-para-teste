#!/usr/bin/env python3
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import os

# Load environment
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'superducks_enterprise')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def test_auth():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Get admin user
    user = await db.users.find_one({"username": "admin"})
    if not user:
        print("❌ Admin user not found")
        return
    
    print(f"✅ Found user: {user['username']}")
    print(f"   Email: {user['email']}")
    print(f"   Role: {user['role']}")
    print(f"   Active: {user['active']}")
    print(f"   Password hash: {user['password_hash'][:50]}...")
    
    # Test password verification
    test_password = "admin123"
    is_valid = pwd_context.verify(test_password, user['password_hash'])
    
    print(f"\n🔐 Password verification for '{test_password}': {'✅ VALID' if is_valid else '❌ INVALID'}")
    
    # Test with wrong password
    wrong_password = "wrongpass"
    is_wrong = pwd_context.verify(wrong_password, user['password_hash'])
    print(f"🔐 Password verification for '{wrong_password}': {'✅ VALID' if is_wrong else '❌ INVALID'}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(test_auth())