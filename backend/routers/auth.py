import hashlib
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..config import settings
from ..database import get_db
from ..models.shopping_list import ShoppingList
from ..models.user import User

logger = logging.getLogger("cartaraiq")
# ensure messages go to the hosting log file since we can't see stdout/stderr
if not logger.handlers:
    try:
        handler = logging.FileHandler("/home/tradecom/cartaraiq_api/logs/app.log")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    except Exception:
        # if the log path isn't writable, fall back to default
        logging.basicConfig()
        logger.warning("Failed to attach file handler to cartaraiq logger")

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
    smtp_host = (settings.smtp_host or "").strip()
    smtp_from = (settings.smtp_from or "").strip()
    smtp_port = int(settings.smtp_port or 0)

    if not smtp_host:
        logger.info("[Password Reset] Code for %s: %s", to_email, code)
        return
    if not smtp_from:
        logger.error("[Password Reset] SMTP_FROM is empty; cannot send reset email to %s", to_email)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your CartaraIQ password reset code"
    msg["From"] = smtp_from
    logger.info("[Password Reset] msg.From header set to %r", msg["From"])
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
    # debug: log configured smtp_from and the raw message for troubleshooting
    try:
        logger.info(
            "[Password Reset] smtp_host=%r smtp_port=%r smtp_user=%r smtp_from=%r to_email=%r",
            smtp_host,
            smtp_port,
            settings.smtp_user,
            smtp_from,
            to_email,
        )
    except Exception:
        logger.exception("failed to log reset-email debug info")
    try:
        if smtp_port == 465:
            logger.info("[Password Reset] PORT is 465")
            # Port 465 = SMTPS (SSL from the start)
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx, timeout=15) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_pass)
                refused = server.sendmail(smtp_from, to_email, msg.as_string())
                if refused:
                    logger.error("[Password Reset] Recipient refused by SMTP server: %s", refused)
                else:
                    logger.info("[Password Reset] SMTP send success to %s", to_email)
        else:
            # Port 587 = STARTTLS
            logger.info("[Password Reset] PORT is 587")
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_pass)
                refused = server.sendmail(smtp_from, to_email, msg.as_string())
                if refused:
                    logger.error("[Password Reset] Recipient refused by SMTP server: %s", refused)
                else:
                    logger.info("[Password Reset] SMTP send success to %s", to_email)
    except Exception:
        logger.exception("Failed to send reset email to %s", to_email)


class UpdateMeRequest(BaseModel):
    name: str


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    current_user.name = name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return the same message to avoid email enumeration
    if user:
        code = secrets.token_hex(3).upper()  # 6-char hex, e.g. "A3F7B2"
        user.reset_token = hashlib.sha256(code.encode()).hexdigest()
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        db.commit()
        background_tasks.add_task(_send_reset_email, user.email, code)
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
