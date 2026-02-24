from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Optional

import jwt
from fastapi import Header, HTTPException, status


CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")


@lru_cache(maxsize=1)
def _jwks_client() -> Optional[jwt.PyJWKClient]:
    if not CLERK_JWKS_URL:
        return None
    return jwt.PyJWKClient(CLERK_JWKS_URL)


def _decode_with_verification(token: str) -> dict[str, Any]:
    client = _jwks_client()
    if client is None or not CLERK_ISSUER:
        raise ValueError("Clerk verification config missing.")
    signing_key = client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=CLERK_ISSUER,
        options={"verify_aud": False},
    )


def _decode_without_verification(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        options={"verify_signature": False, "verify_exp": False, "verify_aud": False},
        algorithms=["RS256", "HS256"],
    )


def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
    x_clerk_user_id: Optional[str] = Header(default=None),
) -> str:
    if x_clerk_user_id:
        return x_clerk_user_id

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth token."
        )

    try:
        try:
            payload = _decode_with_verification(token)
        except Exception:
            payload = _decode_without_verification(token)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token has no subject.")
        return str(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to validate user token.",
        )
