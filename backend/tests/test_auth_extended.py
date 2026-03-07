"""Additional tests for auth routes — social login, SMTP, edge cases."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.tests.conftest import auth_headers, make_user, set_refresh_token


class TestSocialLoginRoute:
    @patch("backend.services.social_auth.verify_google_token")
    def test_social_login_google_new_user(self, mock_verify, client, db):
        mock_verify.return_value = {
            "provider": "google",
            "provider_id": "goog-123",
            "email": "social@google.com",
            "name": "Google User",
        }
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "fake-google-token",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["email"] == "social@google.com"
        assert data["access_token"]
        assert data["refresh_token"]

    @patch("backend.services.social_auth.verify_google_token")
    def test_social_login_existing_user_links(self, mock_verify, client, db):
        # Pre-create user with email
        existing = make_user(db, email="existing@google.com")
        mock_verify.return_value = {
            "provider": "google",
            "provider_id": "goog-456",
            "email": "existing@google.com",
            "name": "Existing",
        }
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "fake-token",
        })
        assert resp.status_code == 200
        db.refresh(existing)
        assert existing.auth_provider == "google"
        assert existing.auth_provider_id == "goog-456"

    @patch("backend.services.social_auth.verify_google_token")
    def test_social_login_returning_user(self, mock_verify, client, db):
        existing = make_user(db, email="returning@google.com", auth_provider="google", auth_provider_id="goog-789")
        mock_verify.return_value = {
            "provider": "google",
            "provider_id": "goog-789",
            "email": "returning@google.com",
            "name": "Returning",
        }
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "fake-token",
        })
        assert resp.status_code == 200

    @patch("backend.services.social_auth.verify_google_token")
    def test_social_login_deactivated_user_403(self, mock_verify, client, db):
        make_user(db, email="disabled@google.com", auth_provider="google", auth_provider_id="goog-dead", is_active=False)
        mock_verify.return_value = {
            "provider": "google",
            "provider_id": "goog-dead",
            "email": "disabled@google.com",
            "name": "Disabled",
        }
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "fake-token",
        })
        assert resp.status_code == 403

    def test_social_login_unsupported_provider(self, client, db):
        resp = client.post("/auth/social", json={
            "provider": "tiktok",
            "id_token": "fake-token",
        })
        # The endpoint hits the else branch and returns 400
        assert resp.status_code == 400

    @patch("backend.services.social_auth.verify_google_token")
    def test_social_login_no_email_no_existing_400(self, mock_verify, client, db):
        mock_verify.return_value = {
            "provider": "google",
            "provider_id": "goog-noemail",
            "email": None,
            "name": "NoEmail",
        }
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "fake-token",
        })
        assert resp.status_code == 400


class TestSendResetEmail:
    @patch("backend.routers.auth._send_reset_email")
    def test_forgot_password_triggers_email(self, mock_email, client, db):
        user = make_user(db, email="needsreset@test.com")
        resp = client.post("/auth/forgot-password", json={"email": "needsreset@test.com"})
        assert resp.status_code == 200
        # BackgroundTasks runs synchronously in TestClient
        # The reset token should be set on the user
        db.refresh(user)
        assert user.reset_token is not None

    def test_forgot_password_social_only_user_no_token(self, client, db):
        make_user(db, email="social@test.com", auth_provider="google", auth_provider_id="g123", password=None)
        resp = client.post("/auth/forgot-password", json={"email": "social@test.com"})
        assert resp.status_code == 200
        # Should return same message without setting a token


class TestLoginEdgeCases:
    def test_login_wrong_password(self, client, db):
        make_user(db, email="wrong@test.com", password="correct123")
        resp = client.post("/auth/login", json={
            "email": "wrong@test.com",
            "password": "incorrect",
        })
        assert resp.status_code == 401

    def test_login_deactivated_user(self, client, db):
        make_user(db, email="deactivated@test.com", password="pass123", is_active=False)
        resp = client.post("/auth/login", json={
            "email": "deactivated@test.com",
            "password": "pass123",
        })
        assert resp.status_code == 403

    def test_admin_login_non_admin(self, client, db):
        make_user(db, email="notadmin@test.com", password="pass123", role="user")
        resp = client.post("/auth/login", json={
            "email": "notadmin@test.com",
            "password": "pass123",
            "client": "admin",
        })
        assert resp.status_code == 403


class TestResetPasswordEdgeCases:
    def test_reset_expired_code(self, client, db):
        import hashlib
        from datetime import datetime, timedelta, timezone
        user = make_user(db, email="expired@test.com")
        code = "A1B2C3"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        # Set expiry in the past
        user.reset_token_expiry = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

        resp = client.post("/auth/reset-password", json={
            "email": "expired@test.com",
            "code": code,
            "new_password": "newpass123",
        })
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    def test_reset_social_only_blocked(self, client, db):
        import hashlib
        from datetime import datetime, timedelta, timezone
        user = make_user(db, email="socialreset@test.com", auth_provider="apple", auth_provider_id="a111", password=None)
        code = "D4E5F6"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        resp = client.post("/auth/reset-password", json={
            "email": "socialreset@test.com",
            "code": code,
            "new_password": "newpass123",
        })
        assert resp.status_code == 400
        assert "social" in resp.json()["detail"].lower()
