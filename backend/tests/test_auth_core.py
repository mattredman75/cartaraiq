"""Tests for backend/auth.py — password hashing, JWT, and auth dependencies."""

import pytest
from datetime import timedelta
from jose import jwt

from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    generate_refresh_token,
)
from backend.config import settings
from backend.tests.conftest import make_user, auth_headers


class TestPasswordHashing:
    def test_hash_and_verify_roundtrip(self):
        plain = "mysecretpassword"
        hashed = hash_password(plain)
        assert hashed != plain
        assert verify_password(plain, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_different_hashes_for_same_password(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2  # bcrypt uses random salt


class TestJWT:
    def test_create_and_decode_token(self):
        data = {"sub": "user-123", "role": "user"}
        token = create_access_token(data)
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        assert decoded["sub"] == "user-123"
        assert decoded["role"] == "user"
        assert "exp" in decoded

    def test_custom_expiry(self):
        token = create_access_token({"sub": "u1"}, expires_delta=timedelta(hours=2))
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        assert decoded["sub"] == "u1"

    def test_invalid_token_raises(self):
        with pytest.raises(Exception):
            jwt.decode("not.a.token", settings.jwt_secret, algorithms=[settings.jwt_algorithm])


class TestRefreshToken:
    def test_generates_unique_tokens(self):
        t1 = generate_refresh_token()
        t2 = generate_refresh_token()
        assert t1 != t2
        assert len(t1) > 30


class TestGetCurrentUser:
    def test_valid_token_returns_user(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/auth/biometric/status", headers=headers)
        assert resp.status_code == 200

    def test_no_token_returns_401(self, client):
        resp = client.get("/auth/biometric/status")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get("/auth/biometric/status", headers={"Authorization": "Bearer bad.token.here"})
        assert resp.status_code == 401

    def test_deactivated_user_returns_403(self, client, db):
        user = make_user(db, is_active=False)
        headers = auth_headers(user)
        resp = client.get("/auth/biometric/status", headers=headers)
        assert resp.status_code == 403

    def test_admin_dependency_rejects_non_admin(self, client, db):
        user = make_user(db, role="user")
        headers = auth_headers(user)
        resp = client.get("/admin/dashboard/overview", headers=headers)
        assert resp.status_code == 403

    def test_admin_dependency_accepts_admin(self, client, db):
        from backend.tests.conftest import make_admin
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.get("/admin/dashboard/overview", headers=headers)
        assert resp.status_code == 200
