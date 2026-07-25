import sys, os
sys.path.insert(0, os.path.abspath("."))

from fastapi.testclient import TestClient
from main import app

from app.database.postgres import Base, engine, get_db
from app.database.models import User
import jwt

client = TestClient(app)

def test_auth_flow():
    # 1. Mock google auth login (Dev mode JWT token)
    # Generate a dummy unverified google token payload
    dummy_payload = {
        "sub": "test_google_12345",
        "email": "trader@example.com",
        "name": "Trader Test",
        "picture": "https://example.com/avatar.jpg"
    }
    dummy_token = jwt.encode(dummy_payload, "secret", algorithm="HS256")

    response = client.post("/api/auth/google", json={"credential": dummy_token})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "trader@example.com"
    assert data["user"]["name"] == "Trader Test"
    
    access_token = data["access_token"]
    cookies = response.cookies
    assert "refresh_token" in cookies

    # 2. Test /api/auth/me with Bearer token
    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data["email"] == "trader@example.com"

    # 3. Test /api/auth/refresh with cookie
    refresh_response = client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": cookies["refresh_token"]}
    )
    assert refresh_response.status_code == 200
    new_data = refresh_response.json()
    assert "access_token" in new_data

    # 4. Test /api/auth/logout
    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    print("\n[SUCCESS] Auth API flow verified 100%!")

if __name__ == "__main__":
    test_auth_flow()
