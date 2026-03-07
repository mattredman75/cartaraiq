"""Tests for backend/routers/auth.py — registration, login, refresh, password reset, biometric."""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from backend.tests.conftest import (
    auth_headers,
    make_admin,
    make_user,
    set_refresh_token,
)


class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "email": "new@example.com",
            "password": "securepass",
            "name": "New User",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["user"]["email"] == "new@example.com"
        assert data["user"]["role"] == "user"

    def test_register_creates_default_list(self, client, db):
        from backend.models.shopping_list import ShoppingList
        resp = client.post("/auth/register", json={
            "email": "newlist@example.com",
            "password": "pass",
            "name": "User",
        })
        user_id = resp.json()["user"]["id"]
        lists = db.query(ShoppingList).filter(ShoppingList.user_id == user_id).all()
        assert len(lists) == 1
        assert lists[0].name == "My List"

    def test_register_duplicate_email_409(self, client, db):
        make_user(db, email="dup@example.com")
        resp = client.post("/auth/register", json={
            "email": "dup@example.com",
            "password": "pass",
            "name": "User",
        })
        assert resp.status_code == 409


class TestLogin:
    def test_login_success(self, client, db):
        make_user(db, email="login@example.com", password="mypass")
        resp = client.post("/auth/login", json={
            "email": "login@example.com",
            "password": "mypass",
        })
        assert resp.status_code == 200
        assert resp.json()["access_token"]
        assert resp.json()["refresh_token"]

    def test_login_wrong_password_401(self, client, db):
        make_user(db, email="login@example.com", password="mypass")
        resp = client.post("/auth/login", json={
            "email": "login@example.com",
            "password": "wrong",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user_401(self, client):
        resp = client.post("/auth/login", json={
            "email": "noone@example.com",
            "password": "pass",
        })
        assert resp.status_code == 401

    def test_login_deactivated_user_403(self, client, db):
        make_user(db, email="inactive@example.com", password="pass", is_active=False)
        resp = client.post("/auth/login", json={
            "email": "inactive@example.com",
            "password": "pass",
        })
        assert resp.status_code == 403

    def test_admin_login_non_admin_403(self, client, db):
        make_user(db, email="user@example.com", password="pass", role="user")
        resp = client.post("/auth/login", json={
            "email": "user@example.com",
            "password": "pass",
            "client": "admin",
        })
        assert resp.status_code == 403
        assert "Admin access" in resp.json()["detail"]

    def test_admin_login_success(self, client, db):
        make_admin(db, email="admin@example.com", password="adminpass")
        resp = client.post("/auth/login", json={
            "email": "admin@example.com",
            "password": "adminpass",
            "client": "admin",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["role"] == "admin"


class TestTokenRefresh:
    def test_refresh_success(self, client, db):
        user = make_user(db)
        rt = set_refresh_token(db, user)
        resp = client.post("/auth/refresh", json={"refresh_token": rt})
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"]
        assert data["refresh_token"] != rt  # Token rotated

    def test_refresh_invalid_token_401(self, client):
        resp = client.post("/auth/refresh", json={"refresh_token": "invalid"})
        assert resp.status_code == 401

    def test_refresh_expired_token_401(self, client, db):
        user = make_user(db)
        user.refresh_token = "expired-token"
        user.refresh_token_expiry = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
        resp = client.post("/auth/refresh", json={"refresh_token": "expired-token"})
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    def test_refresh_deactivated_user_403(self, client, db):
        user = make_user(db, is_active=False)
        rt = set_refresh_token(db, user)
        resp = client.post("/auth/refresh", json={"refresh_token": rt})
        assert resp.status_code == 403


class TestForgotPassword:
    def test_returns_same_message_regardless(self, client, db):
        make_user(db, email="exists@example.com")
        # Existing user
        resp1 = client.post("/auth/forgot-password", json={"email": "exists@example.com"})
        # Non-existing user
        resp2 = client.post("/auth/forgot-password", json={"email": "noone@example.com"})
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["message"] == resp2.json()["message"]

    def test_social_only_user_skipped_silently(self, client, db):
        make_user(db, email="social@example.com", password=None, auth_provider="google")
        resp = client.post("/auth/forgot-password", json={"email": "social@example.com"})
        assert resp.status_code == 200

    def test_sets_reset_token_on_user(self, client, db):
        user = make_user(db, email="reset@example.com")
        client.post("/auth/forgot-password", json={"email": "reset@example.com"})
        db.refresh(user)
        assert user.reset_token is not None
        assert user.reset_token_expiry is not None


class TestResetPassword:
    def _setup_reset(self, db):
        user = make_user(db, email="reset@example.com", password="oldpass")
        code = "ABC123"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        return user, code

    def test_reset_password_success(self, client, db):
        user, code = self._setup_reset(db)
        resp = client.post("/auth/reset-password", json={
            "email": "reset@example.com",
            "code": code,
            "new_password": "newpass123",
        })
        assert resp.status_code == 200
        # Verify token is cleared
        db.refresh(user)
        assert user.reset_token is None

    def test_reset_wrong_code_400(self, client, db):
        self._setup_reset(db)
        resp = client.post("/auth/reset-password", json={
            "email": "reset@example.com",
            "code": "WRONG1",
            "new_password": "newpass",
        })
        assert resp.status_code == 400

    def test_reset_expired_code_400(self, client, db):
        user = make_user(db, email="expired@example.com")
        code = "ABC123"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
        resp = client.post("/auth/reset-password", json={
            "email": "expired@example.com",
            "code": code,
            "new_password": "newpass",
        })
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    def test_reset_social_only_blocked(self, client, db):
        user = make_user(db, email="social@example.com", password=None, auth_provider="apple")
        code = "ABC123"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        resp = client.post("/auth/reset-password", json={
            "email": "social@example.com",
            "code": code,
            "new_password": "newpass",
        })
        assert resp.status_code == 400
        assert "social" in resp.json()["detail"].lower()


class TestUpdateMe:
    def test_update_name_success(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.patch("/auth/me", json={"name": "New Name"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_update_empty_name_400(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.patch("/auth/me", json={"name": "  "}, headers=headers)
        assert resp.status_code == 400


class TestLogout:
    def test_logout_clears_refresh_token(self, client, db):
        user = make_user(db)
        set_refresh_token(db, user)
        headers = auth_headers(user)
        resp = client.post("/auth/logout", headers=headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.refresh_token is None


class TestBiometric:
    def test_setup_biometric(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/auth/biometric/setup", json={
            "pin_hash": "abc123hash",
            "biometric_type": "face_id",
        }, headers=headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.biometric_enabled is True
        assert user.biometric_type == "face_id"

    def test_setup_missing_fields_400(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/auth/biometric/setup", json={
            "pin_hash": "",
            "biometric_type": "face_id",
        }, headers=headers)
        assert resp.status_code == 400

    def test_disable_biometric(self, client, db):
        user = make_user(db, biometric_enabled=True, biometric_pin_hash="hash", biometric_type="face_id")
        headers = auth_headers(user)
        resp = client.post("/auth/biometric/disable", headers=headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.biometric_enabled is False
        assert user.biometric_pin_hash is None

    def test_biometric_status(self, client, db):
        user = make_user(db, biometric_enabled=True, biometric_type="touch_id")
        headers = auth_headers(user)
        resp = client.get("/auth/biometric/status", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["biometric_enabled"] is True
        assert resp.json()["biometric_type"] == "touch_id"
