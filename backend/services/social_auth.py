"""
Social authentication token verification.

Verifies ID tokens from Apple, Google, and Facebook, and returns
the user's email, name, and provider-specific user ID.
"""

import logging
from typing import Optional, Tuple

import httpx
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from ..config import settings

logger = logging.getLogger(__name__)


class SocialAuthError(Exception):
    """Raised when social auth verification fails."""
    pass


async def verify_apple_token(id_token: str) -> dict:
    """
    Verify an Apple ID token.
    Apple tokens are JWTs signed with Apple's public keys.
    We verify by fetching Apple's JWKS and decoding the token.
    """
    from jose import jwt as jose_jwt, JWTError

    try:
        # Fetch Apple's public keys
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://appleid.apple.com/auth/keys")
            resp.raise_for_status()
            apple_keys = resp.json()

        # Decode the token header to find the key ID
        header = jose_jwt.get_unverified_header(id_token)
        kid = header.get("kid")

        # Find the matching key
        matching_key = None
        for key in apple_keys.get("keys", []):
            if key["kid"] == kid:
                matching_key = key
                break

        if not matching_key:
            raise SocialAuthError("Apple public key not found for token")

        # Construct the RSA public key and verify
        from jose import jwk
        public_key = jwk.construct(matching_key)

        # Decode and verify the token
        payload = jose_jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience="com.cartaraiq.app",
            issuer="https://appleid.apple.com",
        )

        email = payload.get("email")
        sub = payload.get("sub")  # Apple's user ID

        if not sub:
            raise SocialAuthError("Apple token missing subject")

        return {
            "provider": "apple",
            "provider_id": sub,
            "email": email,
            "name": None,  # Apple may not provide the name in the token
        }

    except JWTError as e:
        logger.error(f"Apple token verification failed: {e}")
        raise SocialAuthError(f"Invalid Apple token: {e}")
    except Exception as e:
        logger.error(f"Apple auth error: {e}")
        raise SocialAuthError(f"Apple authentication failed: {e}")


def verify_google_token(id_token_str: str) -> dict:
    """
    Verify a Google ID token using google-auth library.
    Accepts tokens issued to either the iOS or web client ID.
    """
    try:
        valid_audiences = [
            settings.google_ios_client_id,
            settings.google_web_client_id,
        ]
        # Remove empty strings
        valid_audiences = [a for a in valid_audiences if a]

        if not valid_audiences:
            raise SocialAuthError("Google client IDs not configured on server")

        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            clock_skew_in_seconds=10,
        )

        # Verify the audience matches one of our client IDs
        if idinfo.get("aud") not in valid_audiences:
            raise SocialAuthError("Google token audience mismatch")

        email = idinfo.get("email")
        name = idinfo.get("name")
        sub = idinfo.get("sub")

        if not sub:
            raise SocialAuthError("Google token missing subject")

        if not idinfo.get("email_verified", False):
            raise SocialAuthError("Google email not verified")

        return {
            "provider": "google",
            "provider_id": sub,
            "email": email,
            "name": name,
        }

    except ValueError as e:
        logger.error(f"Google token verification failed: {e}")
        raise SocialAuthError(f"Invalid Google token: {e}")
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise SocialAuthError(f"Google authentication failed: {e}")


async def verify_facebook_token(access_token: str) -> dict:
    """
    Verify a Facebook access token by calling the Graph API.
    1. Verify the token is valid for our app
    2. Fetch the user's profile info
    """
    try:
        app_id = settings.facebook_app_id
        app_secret = settings.facebook_app_secret

        if not app_id or not app_secret:
            raise SocialAuthError("Facebook credentials not configured on server")

        async with httpx.AsyncClient(timeout=10.0) as client:
            # Step 1: Debug/verify the token
            debug_resp = await client.get(
                "https://graph.facebook.com/debug_token",
                params={
                    "input_token": access_token,
                    "access_token": f"{app_id}|{app_secret}",
                },
            )
            debug_resp.raise_for_status()
            debug_data = debug_resp.json().get("data", {})

            if not debug_data.get("is_valid"):
                raise SocialAuthError("Facebook token is not valid")

            if str(debug_data.get("app_id")) != str(app_id):
                raise SocialAuthError("Facebook token app ID mismatch")

            fb_user_id = debug_data.get("user_id")

            # Step 2: Fetch user profile
            profile_resp = await client.get(
                f"https://graph.facebook.com/v19.0/{fb_user_id}",
                params={
                    "fields": "id,name,email",
                    "access_token": access_token,
                },
            )
            profile_resp.raise_for_status()
            profile = profile_resp.json()

        return {
            "provider": "facebook",
            "provider_id": profile.get("id"),
            "email": profile.get("email"),
            "name": profile.get("name"),
        }

    except httpx.HTTPError as e:
        logger.error(f"Facebook API error: {e}")
        raise SocialAuthError(f"Facebook API error: {e}")
    except Exception as e:
        logger.error(f"Facebook auth error: {e}")
        raise SocialAuthError(f"Facebook authentication failed: {e}")
