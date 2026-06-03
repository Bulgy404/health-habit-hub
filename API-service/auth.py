"""Service-to-service authentication — verifies shared-secret tokens on every incoming request."""
import hmac
import os

from fastapi import Header, HTTPException, status


async def verify_service_token(x_service_auth_token: str = Header(...)) -> None:
    """Verify the shared-secret service-to-service token."""
    secret = os.environ.get("API_SERVICE_SECRET", "")
    if not secret:
        # Secret not configured — fail closed
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not hmac.compare_digest(x_service_auth_token, secret):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
