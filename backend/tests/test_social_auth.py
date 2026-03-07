"""Tests for backend/services/social_auth.py — social provider verification."""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from backend.services.social_auth import (
    SocialAuthError,
    verify_google_token,
    verify_apple_token,
    verify_facebook_token,
)


class TestVerifyGoogle:
    @patch("backend.services.social_auth.google_requests.Request")
    @patch("backend.services.social_auth.google_id_token.verify_oauth2_token")
    @patch("backend.services.social_auth.settings")
    def test_success(self, mock_settings, mock_verify, mock_request):
        mock_settings.google_ios_client_id = "ios-client"
        mock_settings.google_web_client_id = "web-client"
        mock_verify.return_value = {
            "aud": "ios-client",
            "sub": "google-user-123",
            "email": "user@gmail.com",
            "name": "Google User",
            "email_verified": True,
        }
        result = verify_google_token("fake-id-token")
        assert result["provider"] == "google"
        assert result["provider_id"] == "google-user-123"
        assert result["email"] == "user@gmail.com"
        assert result["name"] == "Google User"

    @patch("backend.services.social_auth.google_requests.Request")
    @patch("backend.services.social_auth.google_id_token.verify_oauth2_token")
    @patch("backend.services.social_auth.settings")
    def test_audience_mismatch(self, mock_settings, mock_verify, mock_request):
        mock_settings.google_ios_client_id = "ios-client"
        mock_settings.google_web_client_id = "web-client"
        mock_verify.return_value = {
            "aud": "wrong-client",
            "sub": "123",
            "email_verified": True,
        }
        with pytest.raises(SocialAuthError, match="audience mismatch"):
            verify_google_token("fake-token")

    @patch("backend.services.social_auth.settings")
    def test_no_client_ids(self, mock_settings):
        mock_settings.google_ios_client_id = ""
        mock_settings.google_web_client_id = ""
        with pytest.raises(SocialAuthError, match="not configured"):
            verify_google_token("fake-token")

    @patch("backend.services.social_auth.google_requests.Request")
    @patch("backend.services.social_auth.google_id_token.verify_oauth2_token")
    @patch("backend.services.social_auth.settings")
    def test_missing_subject(self, mock_settings, mock_verify, mock_request):
        mock_settings.google_ios_client_id = "ios-client"
        mock_settings.google_web_client_id = ""
        mock_verify.return_value = {
            "aud": "ios-client",
            "sub": None,
            "email_verified": True,
        }
        with pytest.raises(SocialAuthError, match="missing subject"):
            verify_google_token("fake-token")

    @patch("backend.services.social_auth.google_requests.Request")
    @patch("backend.services.social_auth.google_id_token.verify_oauth2_token")
    @patch("backend.services.social_auth.settings")
    def test_email_not_verified(self, mock_settings, mock_verify, mock_request):
        mock_settings.google_ios_client_id = "ios-client"
        mock_settings.google_web_client_id = ""
        mock_verify.return_value = {
            "aud": "ios-client",
            "sub": "123",
            "email_verified": False,
        }
        with pytest.raises(SocialAuthError, match="not verified"):
            verify_google_token("fake-token")

    @patch("backend.services.social_auth.google_requests.Request")
    @patch("backend.services.social_auth.google_id_token.verify_oauth2_token")
    @patch("backend.services.social_auth.settings")
    def test_invalid_token(self, mock_settings, mock_verify, mock_request):
        mock_settings.google_ios_client_id = "ios-client"
        mock_settings.google_web_client_id = ""
        mock_verify.side_effect = ValueError("Invalid token")
        with pytest.raises(SocialAuthError, match="Invalid Google token"):
            verify_google_token("bad-token")


class TestVerifyApple:
    @pytest.mark.asyncio
    async def test_invalid_token_raises(self):
        """Apple verification should raise SocialAuthError on invalid token."""
        with pytest.raises(SocialAuthError):
            await verify_apple_token("clearly-not-a-jwt")


class TestVerifyFacebook:
    @pytest.mark.asyncio
    @patch("backend.services.social_auth.settings")
    async def test_no_credentials(self, mock_settings):
        mock_settings.facebook_app_id = ""
        mock_settings.facebook_app_secret = ""
        with pytest.raises(SocialAuthError, match="not configured"):
            await verify_facebook_token("fake-fb-token")

    @pytest.mark.asyncio
    @patch("backend.services.social_auth.settings")
    async def test_invalid_token(self, mock_settings):
        mock_settings.facebook_app_id = "app123"
        mock_settings.facebook_app_secret = "secret456"

        mock_response = MagicMock()
        mock_response.json.return_value = {"data": {"is_valid": False}}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.get.return_value = mock_response

            with pytest.raises(SocialAuthError, match="not valid"):
                await verify_facebook_token("bad-token")

    @pytest.mark.asyncio
    @patch("backend.services.social_auth.settings")
    async def test_success(self, mock_settings):
        mock_settings.facebook_app_id = "app123"
        mock_settings.facebook_app_secret = "secret456"

        debug_resp = MagicMock()
        debug_resp.json.return_value = {"data": {"is_valid": True, "app_id": "app123", "user_id": "fb-123"}}
        debug_resp.raise_for_status = MagicMock()

        profile_resp = MagicMock()
        profile_resp.json.return_value = {"id": "fb-123", "email": "fb@example.com", "name": "FB User"}
        profile_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.get.side_effect = [debug_resp, profile_resp]

            result = await verify_facebook_token("valid-token")
            assert result["provider"] == "facebook"
            assert result["provider_id"] == "fb-123"
            assert result["email"] == "fb@example.com"
