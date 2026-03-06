from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..models import PushToken, User
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/push", tags=["push"])


class RegisterTokenRequest(BaseModel):
    token: str


class RegisterTokenResponse(BaseModel):
    ok: bool


@router.post("/register", response_model=RegisterTokenResponse)
def register_push_token(
    req: RegisterTokenRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register or update an Expo push token for the current user.
    If the token already exists for another user, it is reassigned.
    """
    token_str = req.token.strip()
    if not token_str.startswith("ExponentPushToken["):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Expo push token format",
        )

    existing = db.query(PushToken).filter(PushToken.token == token_str).first()
    if existing:
        if existing.user_id != user.id:
            # Token was registered to a different user (e.g. device changed accounts)
            existing.user_id = user.id
            db.commit()
            logger.info(f"Reassigned push token to user {user.id}")
        return RegisterTokenResponse(ok=True)

    new_token = PushToken(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token=token_str,
    )
    db.add(new_token)
    db.commit()
    logger.info(f"Registered push token for user {user.id}")
    return RegisterTokenResponse(ok=True)


@router.delete("/unregister", response_model=RegisterTokenResponse)
def unregister_push_token(
    req: RegisterTokenRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a push token (e.g. on logout).
    """
    deleted = (
        db.query(PushToken)
        .filter(PushToken.token == req.token.strip(), PushToken.user_id == user.id)
        .delete()
    )
    db.commit()
    if deleted:
        logger.info(f"Unregistered push token for user {user.id}")
    return RegisterTokenResponse(ok=True)
