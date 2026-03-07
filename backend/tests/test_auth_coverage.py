"""Additional coverage tests for auth routes and social_auth service — SMTP paths, edge cases."""

import hashlib
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock, AsyncMock

from backend.tests.conftest import auth_headers, make_user, set_refresh_token


# ── Social login: Apple and Facebook provider branches ───────────────────────


class TestSocialLoginAppleRoute:
    @patch("backend.services.social_auth.verify_apple_token", new_callable=AsyncMock)
    def test_social_login_apple(self, mock_verify, client, db):
        mock_verify.return_value = {
            "provider": "apple",
            "provider_id": "apple-123",
            "email": "apple@example.com",
            "name": None,
        }
        resp = client.post("/auth/social", json={
            "provider": "apple",
            "id_token": "fake-apple-token",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["email"] == "apple@example.com"


class TestSocialLoginFacebookRoute:
    @patch("backend.services.social_auth.verify_facebook_token", new_callable=AsyncMock)
    def test_social_login_facebook(self, mock_verify, client, db):
        mock_verify.return_value = {
            "provider": "facebook",
            "provider_id": "fb-123",
            "email": "fb@example.com",
            "name": "FB User",
        }
        resp = client.post("/auth/social", json={
            "provider": "facebook",
            "id_token": "fake-fb-token",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["email"] == "fb@example.com"


class TestSocialLoginVerificationFailure:
    @patch("backend.services.social_auth.verify_google_token")
    def test_social_auth_error_returns_401(self, mock_verify, client, db):
        from backend.services.social_auth import SocialAuthError
        mock_verify.side_effect = SocialAuthError("Token expired")
        resp = client.post("/auth/social", json={
            "provider": "google",
            "id_token": "expired-token",
        })
        assert resp.status_code == 401
        assert "Token expired" in resp.json()["detail"]


# ── _send_reset_email paths ─────────────────────────────────────────────────


class TestSendResetEmailPaths:
    @patch("backend.routers.auth.settings")
    def test_no_smtp_host_logs_instead(self, mock_settings, client, db):
        mock_settings.smtp_host = ""
        mock_settings.smtp_from = "test@test.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = ""
        mock_settings.smtp_pass = ""
        mock_settings.groq_api_key = ""
        mock_settings.jwt_secret = "test-secret"
        mock_settings.jwt_algorithm = "HS256"
        mock_settings.jwt_expire_minutes = 30

        user = make_user(db, email="noemail@test.com")
        resp = client.post("/auth/forgot-password", json={"email": "noemail@test.com"})
        assert resp.status_code == 200

    @patch("backend.routers.auth.settings")
    def test_no_smtp_from_skips(self, mock_settings, client, db):
        mock_settings.smtp_host = "smtp.test.com"
        mock_settings.smtp_from = ""
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = ""
        mock_settings.smtp_pass = ""
        mock_settings.groq_api_key = ""
        mock_settings.jwt_secret = "test-secret"
        mock_settings.jwt_algorithm = "HS256"
        mock_settings.jwt_expire_minutes = 30

        user = make_user(db, email="nofrom@test.com")
        resp = client.post("/auth/forgot-password", json={"email": "nofrom@test.com"})
        assert resp.status_code == 200

    @patch("backend.routers.auth.smtplib.SMTP_SSL")
    @patch("backend.routers.auth.settings")
    def test_smtp_ssl_port_465(self, mock_settings, mock_smtp_ssl, client, db):
        mock_settings.smtp_host = "smtp.test.com"
        mock_settings.smtp_from = "test@test.com"
        mock_settings.smtp_port = 465
        mock_settings.smtp_user = "user"
        mock_settings.smtp_pass = "pass"
        mock_settings.groq_api_key = ""
        mock_settings.jwt_secret = "test-secret"
        mock_settings.jwt_algorithm = "HS256"
        mock_settings.jwt_expire_minutes = 30

        mock_server = MagicMock()
        mock_smtp_ssl.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp_ssl.return_value.__exit__ = MagicMock(return_value=False)
        mock_server.sendmail.return_value = {}

        user = make_user(db, email="ssltest@test.com")
        resp = client.post("/auth/forgot-password", json={"email": "ssltest@test.com"})
        assert resp.status_code == 200

    @patch("backend.routers.auth.smtplib.SMTP")
    @patch("backend.routers.auth.settings")
    def test_smtp_starttls_port_587(self, mock_settings, mock_smtp, client, db):
        mock_settings.smtp_host = "smtp.test.com"
        mock_settings.smtp_from = "test@test.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "user"
        mock_settings.smtp_pass = "pass"
        mock_settings.groq_api_key = ""
        mock_settings.jwt_secret = "test-secret"
        mock_settings.jwt_algorithm = "HS256"
        mock_settings.jwt_expire_minutes = 30

        mock_server = MagicMock()
        mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp.return_value.__exit__ = MagicMock(return_value=False)
        mock_server.sendmail.return_value = {}

        user = make_user(db, email="tlstest@test.com")
        resp = client.post("/auth/forgot-password", json={"email": "tlstest@test.com"})
        assert resp.status_code == 200


# ── Refresh token: no expiry set ─────────────────────────────────────────────


class TestRefreshEdgeCases:
    def test_refresh_no_expiry_field(self, client, db):
        """User has refresh token but no expiry — should reject."""
        user = make_user(db)
        user.refresh_token = "valid-token"
        user.refresh_token_expiry = None
        db.commit()
        resp = client.post("/auth/refresh", json={"refresh_token": "valid-token"})
        assert resp.status_code == 401


# ── Social auth service: Apple success, Facebook edge cases ──────────────────


class TestAppleTokenVerification:
    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_apple_token_success(self, mock_client_cls):
        from backend.services.social_auth import verify_apple_token

        # Build mocks for JWKS fetch
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_jwks_resp = MagicMock()
        mock_jwks_resp.json.return_value = {"keys": [{"kid": "test-kid", "kty": "RSA", "n": "abc", "e": "AQAB"}]}
        mock_jwks_resp.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_jwks_resp

        # Mock jose.jwt
        with patch("jose.jwt.get_unverified_header", return_value={"kid": "test-kid"}), \
             patch("jose.jwk.construct") as mock_construct, \
             patch("jose.jwt.decode") as mock_decode:
            mock_decode.return_value = {
                "sub": "apple-user-123",
                "email": "apple@example.com",
            }
            result = await verify_apple_token("fake-apple-jwt")
            assert result["provider"] == "apple"
            assert result["provider_id"] == "apple-user-123"
            assert result["email"] == "apple@example.com"

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_apple_no_matching_key(self, mock_client_cls):
        from backend.services.social_auth import verify_apple_token, SocialAuthError

        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"keys": [{"kid": "other-kid", "kty": "RSA"}]}
        mock_resp.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_resp

        with patch("jose.jwt.get_unverified_header", return_value={"kid": "missing-kid"}):
            with pytest.raises(SocialAuthError, match="public key not found"):
                await verify_apple_token("fake-jwt")

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_apple_missing_subject(self, mock_client_cls):
        from backend.services.social_auth import verify_apple_token, SocialAuthError

        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"keys": [{"kid": "k1", "kty": "RSA", "n": "abc", "e": "AQAB"}]}
        mock_resp.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_resp

        with patch("jose.jwt.get_unverified_header", return_value={"kid": "k1"}), \
             patch("jose.jwk.construct"), \
             patch("jose.jwt.decode", return_value={"sub": None, "email": "x@y.com"}):
            with pytest.raises(SocialAuthError, match="missing subject"):
                await verify_apple_token("jwt")


class TestFacebookEdgeCases:
    @pytest.mark.asyncio
    @patch("backend.services.social_auth.settings")
    async def test_facebook_app_id_mismatch(self, mock_settings):
        from backend.services.social_auth import verify_facebook_token, SocialAuthError

        mock_settings.facebook_app_id = "app123"
        mock_settings.facebook_app_secret = "secret456"

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "data": {"is_valid": True, "app_id": "WRONG_APP", "user_id": "fb-123"}
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.get.return_value = mock_response

            with pytest.raises(SocialAuthError, match="app ID mismatch"):
                await verify_facebook_token("token")

    @pytest.mark.asyncio
    @patch("backend.services.social_auth.settings")
    async def test_facebook_http_error(self, mock_settings):
        import httpx
        from backend.services.social_auth import verify_facebook_token, SocialAuthError

        mock_settings.facebook_app_id = "app123"
        mock_settings.facebook_app_secret = "secret456"

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.get.side_effect = httpx.HTTPError("Connection failed")

            with pytest.raises(SocialAuthError, match="API error"):
                await verify_facebook_token("token")
