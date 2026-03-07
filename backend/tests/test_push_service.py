"""Tests for backend/services/push_notifications.py — Expo push service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.services.push_notifications import send_push_notifications, broadcast_maintenance_update


class TestSendPushNotifications:
    @pytest.mark.asyncio
    async def test_empty_tokens_returns_zero(self):
        result = await send_push_notifications([])
        assert result == {"sent": 0, "ok": 0, "error": 0, "errors": []}

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_sends_single_notification(self, mock_cls):
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.post.return_value = MagicMock(
            status_code=200,
            raise_for_status=MagicMock(),
            json=lambda: {"data": [{"status": "ok", "id": "ticket-1"}]},
        )
        result = await send_push_notifications(
            tokens=["ExponentPushToken[abc]"],
            title="Test",
            body="Hello",
        )
        assert result["sent"] == 1
        assert result["ok"] == 1
        assert result["error"] == 0

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_handles_device_not_registered(self, mock_cls):
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.post.return_value = MagicMock(
            status_code=200,
            raise_for_status=MagicMock(),
            json=lambda: {"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]},
        )
        result = await send_push_notifications(
            tokens=["ExponentPushToken[dead]"],
            title="Test",
            body="Hello",
        )
        assert result["error"] == 1
        assert "DeviceNotRegistered" in result["errors"]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_handles_request_failure(self, mock_cls):
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.post.side_effect = Exception("Connection error")

        result = await send_push_notifications(
            tokens=["ExponentPushToken[abc]"],
            title="Test",
            body="Hello",
        )
        assert result["error"] == 1

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient")
    async def test_silent_push_with_data(self, mock_cls):
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.post.return_value = MagicMock(
            status_code=200,
            raise_for_status=MagicMock(),
            json=lambda: {"data": [{"status": "ok"}]},
        )
        result = await send_push_notifications(
            tokens=["ExponentPushToken[abc]"],
            data={"type": "refresh"},
            content_available=True,
        )
        assert result["ok"] == 1
        # Verify the payload sent included _contentAvailable
        call_args = mock_client.post.call_args
        payload = call_args.kwargs.get("json") or call_args[1].get("json")
        assert payload[0]["_contentAvailable"] is True
        assert payload[0]["priority"] == "high"


class TestBroadcastMaintenanceUpdate:
    @pytest.mark.asyncio
    @patch("backend.services.push_notifications.send_push_notifications")
    async def test_maintenance_on(self, mock_send):
        mock_send.return_value = {"sent": 1, "ok": 1, "error": 0, "errors": []}
        result = await broadcast_maintenance_update(
            tokens=["ExponentPushToken[abc]"],
            maintenance=True,
            message="Scheduled downtime",
        )
        mock_send.assert_called_once()
        call_args = mock_send.call_args
        assert call_args.kwargs.get("data", {}).get("maintenance") is True

    @pytest.mark.asyncio
    @patch("backend.services.push_notifications.send_push_notifications")
    async def test_maintenance_off(self, mock_send):
        mock_send.return_value = {"sent": 1, "ok": 1, "error": 0, "errors": []}
        result = await broadcast_maintenance_update(
            tokens=["ExponentPushToken[abc]"],
            maintenance=False,
        )
        mock_send.assert_called_once()
