"""
Expo Push Notification service.

Uses the Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/)
to send push notifications to registered devices.  No Expo access token is
required for low-volume usage, but one can be added via EXPO_PUSH_ACCESS_TOKEN
env var for higher throughput.
"""

import logging
import httpx
from typing import List, Optional

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notifications(
    tokens: List[str],
    title: Optional[str] = None,
    body: Optional[str] = None,
    data: Optional[dict] = None,
    *,
    content_available: bool = False,
) -> dict:
    """
    Send push notifications to a list of Expo push tokens.

    For silent pushes (maintenance mode toggle), set content_available=True
    and pass the payload in `data`.  No title/body means the notification
    is invisible to the user — the app handles it in the background.

    Returns a summary dict with counts of successes and failures.
    """
    if not tokens:
        return {"sent": 0, "ok": 0, "error": 0, "errors": []}

    # Expo accepts batches of up to 100 notifications per request
    BATCH_SIZE = 100
    messages = []
    for token in tokens:
        msg: dict = {"to": token}
        if title:
            msg["title"] = title
        if body:
            msg["body"] = body
        if data:
            msg["data"] = data
        if content_available:
            # iOS & Android: wake the app silently
            msg["_contentAvailable"] = True
            msg["priority"] = "high"
        messages.append(msg)

    results = {"sent": len(messages), "ok": 0, "error": 0, "errors": []}

    async with httpx.AsyncClient(timeout=15.0) as client:
        for i in range(0, len(messages), BATCH_SIZE):
            batch = messages[i : i + BATCH_SIZE]
            try:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
                resp_data = resp.json().get("data", [])
                for ticket in resp_data:
                    if ticket.get("status") == "ok":
                        results["ok"] += 1
                    else:
                        results["error"] += 1
                        error_detail = ticket.get("details", {}).get("error", "unknown")
                        results["errors"].append(error_detail)
                        if error_detail == "DeviceNotRegistered":
                            logger.info(
                                "Token no longer valid, should be cleaned up"
                            )
            except Exception as e:
                logger.error(f"Failed to send push batch: {e}")
                results["error"] += len(batch)

    logger.info(
        f"Push notification results: {results['ok']} ok, {results['error']} errors out of {results['sent']}"
    )
    return results


async def broadcast_maintenance_update(
    tokens: List[str],
    maintenance: bool,
    message: str = "",
) -> dict:
    """
    Broadcast maintenance mode change to all devices via silent data-only push.

    The notification is delivered to the app in the background without showing
    a visual alert. The app's notification handler suppresses any alerts, and
    the data payload is processed by addNotificationReceivedListener.
    """
    return await send_push_notifications(
        tokens=tokens,
        data={
            "type": "maintenance_update",
            "maintenance": maintenance,
            "message": message,
        },
        content_available=True,
    )
