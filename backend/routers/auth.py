import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import create_access_token, hash_password, verify_password
from ..config import settings
from ..database import get_db
from ..models.shopping_list import ShoppingList
from ..models.user import User

logger = logging.getLogger("cartaraiq")

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    default_list = ShoppingList(user_id=user.id, name="My List")
    db.add(default_list)
    db.commit()

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


# ── Password Reset ────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


def _send_reset_email(to_email: str, code: str) -> None:
    if not settings.smtp_host:
        logger.info("[Password Reset] Code for %s: %s", to_email, code)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your CartaraIQ password reset code"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    body = (
        f"Hi,\n\n"
        f"You requested a password reset for your CartaraIQ account.\n\n"
        f"Your reset code is: {code}\n\n"
        f"This code expires in 15 minutes. If you didn't request this, "
        f"you can safely ignore this email.\n\n"
        f"– CartaraIQ"
    )
    msg.attach(MIMEText(body, "plain"))
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(settings.smtp_from, to_email, msg.as_string())
    except Exception:
        logger.exception("Failed to send reset email to %s", to_email)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return the same message to avoid email enumeration
    if user:
        code = secrets.token_hex(3).upper()  # 6-char hex, e.g. "A3F7B2"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        _send_reset_email(user.email, code)
    return {"message": "If that email is registered, a reset code has been sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.reset_token or not user.reset_token_expiry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

    expiry = user.reset_token_expiry
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    hashed_input = hashlib.sha256(payload.code.strip().upper().encode()).hexdigest()
    if not secrets.compare_digest(hashed_input, user.reset_token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

    user.hashed_password = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    db.commit()
    return {"message": "Password updated successfully."}
