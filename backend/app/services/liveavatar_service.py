"""
HeyGen LiveAvatar Service
Provides WebRTC-based real-time avatar video streaming for conversational AI
Uses LITE Mode - HeyGen's current API encodes LITE in the JWT regardless of CUSTOM request
"""
import httpx
import os
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class LiveAvatarService:
    def __init__(self):
        self.api_key = os.getenv("LIVEAVATAR_API_KEY")
        if not self.api_key:
            raise ValueError("LIVEAVATAR_API_KEY not set in environment")

        self.base_url = "https://api.liveavatar.com"

        # Avatar ID for Bryan Tech Expert (male avatar for testing)
        # You can change this to any avatar from the available list
        self.default_avatar_id = os.getenv(
            "LIVEAVATAR_DEFAULT_AVATAR",
            "09919247-f4b2-45d8-a75e-86fc2fceaebf"  # lady in pink suit
        ).strip()  # strip any accidental whitespace from .env

        logger.info(f"LiveAvatar service initialized with avatar: {self.default_avatar_id}")

    async def create_session_token(
        self,
        avatar_id: Optional[str] = None,
        mode: str = "LITE"  # LITE mode - HeyGen API encodes LITE in JWT; CUSTOM causes reconnect loop
    ) -> Dict:
        """
        Create a LiveAvatar session token

        Args:
            avatar_id: Avatar ID to use (defaults to configured avatar)
            mode: Session mode - "LITE" (HeyGen current API), "CUSTOM" (legacy/unsupported on free tier)

        Returns:
            Dict with session_id and session_token for WebRTC connection
        """
        if not avatar_id:
            avatar_id = self.default_avatar_id

        url = f"{self.base_url}/v1/sessions/token"

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }

        payload = {
            "mode": mode,
            "avatar_id": avatar_id
        }

        logger.info(f"LiveAvatar: Creating {mode} mode session for avatar {avatar_id}")

        try:
            # Disable SSL verification for corporate proxy environments (Zscaler)
            # The LiveAvatar API uses valid certificates, but corporate proxies intercept HTTPS
            verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"

            if not verify_ssl:
                logger.warning("SSL verification disabled for LiveAvatar API (corporate proxy mode)")

            async with httpx.AsyncClient(timeout=30.0, verify=verify_ssl) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()

                data = response.json()

                # API returns { "code": 1000, "data": { "session_id": "...", "session_token": "..." } }
                if data.get("code") != 1000:
                    raise ValueError(f"LiveAvatar API error: {data.get('message', 'Unknown error')}")

                session_data = data.get("data", {})
                session_id = session_data.get("session_id")
                session_token = session_data.get("session_token")

                if not session_id or not session_token:
                    raise ValueError("No session_id or session_token in LiveAvatar response")

                logger.info(f"LiveAvatar session created: {session_id}")

                return {
                    "session_id": session_id,
                    "session_token": session_token
                }

        except httpx.HTTPStatusError as e:
            logger.error(f"LiveAvatar API error: {e.response.status_code}")
            logger.error(f"Response: {e.response.text[:500]}")

            if e.response.status_code == 401:
                raise Exception("Invalid LiveAvatar API key")
            elif e.response.status_code == 402:
                raise Exception("LiveAvatar credits exhausted - please add credits")
            elif e.response.status_code == 429:
                raise Exception("LiveAvatar rate limit exceeded")
            else:
                raise Exception(f"LiveAvatar API error: {e.response.status_code}")

        except Exception as e:
            logger.error(f"LiveAvatar error: {str(e)}")
            raise

    async def stop_session(self, session_id: str) -> None:
        """
        Stop an active LiveAvatar session.
        Silently ignores 404 (session already gone).
        """
        url = f"{self.base_url}/v1/sessions/stop"
        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }
        try:
            verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"
            async with httpx.AsyncClient(timeout=10.0, verify=verify_ssl) as client:
                response = await client.post(url, json={"session_id": session_id}, headers=headers)
                if response.status_code == 404:
                    logger.info(f"LiveAvatar session {session_id} already gone (404)")
                    return
                response.raise_for_status()
                logger.info(f"LiveAvatar session {session_id} stopped")
        except Exception as e:
            logger.warning(f"Failed to stop LiveAvatar session {session_id}: {e}")

    async def get_available_avatars(self) -> list:
        """
        Get list of available avatars for the API key

        Returns:
            List of avatar info
        """
        url = f"{self.base_url}/v1/avatars"

        headers = {
            "X-API-KEY": self.api_key
        }

        try:
            # Use same SSL verification setting as session creation
            verify_ssl = os.getenv("LIVEAVATAR_VERIFY_SSL", "false").lower() == "true"

            async with httpx.AsyncClient(timeout=10.0, verify=verify_ssl) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()

                data = response.json()

                if data.get("code") != 1000:
                    raise ValueError(f"LiveAvatar API error: {data.get('message', 'Unknown error')}")

                avatars = data.get("data", {}).get("avatars", [])

                logger.info(f"Found {len(avatars)} avatars")
                return avatars

        except Exception as e:
            logger.error(f"Failed to fetch avatars: {str(e)}")
            return []
