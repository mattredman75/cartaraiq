import hashlib
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..auth import create_access_token, get_current_user, hash_password, verify_password, generate_refresh_token, REFRESH_TOKEN_EXPIRE_DAYS
from ..config import settings
from ..database import get_db
from ..models.shopping_list import ShoppingList
from ..models.user import User
from ..services.audit import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str
    client: Optional[str] = None  # "admin" for admin dashboard logins


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str = "user"
    auth_provider: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: Optional[str] = None
    user: UserOut


def _issue_refresh_token(user: User, db: Session) -> str:
    """Generate a refresh token, persist it on the user, and return it."""
    rt = generate_refresh_token()
    user.refresh_token = rt
    user.refresh_token_expiry = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.commit()
    return rt


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        log_audit(db, action="register_duplicate", request=request, detail={"email": payload.email}, status="failure")
        raise HTTPException(
            status_code=409,
            detail="Unable to create account. An account may already exist with this email. Try logging in instead.",
        )

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

    token = create_access_token({"sub": user.id, "role": user.role or "user"})
    rt = _issue_refresh_token(user, db)
    log_audit(db, action="register", request=request, user_id=user.id)
    return TokenResponse(access_token=token, refresh_token=rt, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    logger.info("[DEBUG] login endpoint called with email: %s", payload.email)
    try:
        user = db.query(User).filter(User.email == payload.email).first()
        logger.info("[DEBUG] Database query executed, user found: %s", user is not None)
        if not user or not verify_password(payload.password, user.hashed_password):
            logger.warning("[DEBUG] Invalid login attempt for email: %s", payload.email)
            log_audit(db, action="login_failed", request=request, detail={"email": payload.email}, status="failure")
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if not getattr(user, "is_active", True):
            logger.warning("Blocked login for deactivated user: %s", user.id)
            log_audit(db, action="login_blocked", request=request, user_id=user.id, status="blocked")
            raise HTTPException(status_code=403, detail="Account has been deactivated. Contact support.")

        token = create_access_token({"sub": user.id, "role": user.role or "user"})
        rt = _issue_refresh_token(user, db)
        logger.info("[DEBUG] Login successful, token created for user: %s", user.id)
        log_audit(db, action="admin_login" if payload.client == "admin" else "login", request=request, user_id=user.id)
        return TokenResponse(access_token=token, refresh_token=rt, user=UserOut.model_validate(user))
    except Exception as e:
        logger.exception("Error in login for email %s: %s", payload.email, str(e))
        raise


# ── Social Authentication ─────────────────────────────────────────────────────

class SocialAuthRequest(BaseModel):
    provider: str  # 'apple', 'google', 'facebook'
    id_token: str  # ID token or access token from the provider
    name: Optional[str] = None  # Apple only sends name on first auth


@router.post("/social", response_model=TokenResponse)
@limiter.limit("10/minute")
async def social_login(request: Request, payload: SocialAuthRequest, db: Session = Depends(get_db)):
    """
    Authenticate via social provider (Apple, Google, Facebook).
    Verifies the provider token, creates or finds the user, and returns a JWT.
    """
    from ..services.social_auth import (
        verify_apple_token,
        verify_google_token,
        verify_facebook_token,
        SocialAuthError,
    )

    provider = payload.provider.lower()

    try:
        if provider == "apple":
            social_info = await verify_apple_token(payload.id_token)
        elif provider == "google":
            social_info = verify_google_token(payload.id_token)
        elif provider == "facebook":
            social_info = await verify_facebook_token(payload.id_token)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    except SocialAuthError as e:
        logger.warning("Social auth failed for provider %s: %s", provider, str(e))
        log_audit(db, action="social_login_failed", request=request, detail={"provider": provider, "error": str(e)}, status="failure")
        raise HTTPException(status_code=401, detail=str(e))

    provider_id = social_info["provider_id"]
    email = social_info.get("email")
    name = social_info.get("name") or payload.name or "User"

    # 1. Try to find by provider + provider_id (returning user via social)
    user = db.query(User).filter(
        User.auth_provider == provider,
        User.auth_provider_id == provider_id,
    ).first()

    # 2. If not found, try by email (link social to existing email account)
    if not user and email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link social provider to existing account
            user.auth_provider = provider
            user.auth_provider_id = provider_id
            db.commit()
            logger.info("Linked %s to existing user %s", provider, user.id)

    # 3. If still not found, create new user
    if not user:
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Email is required. Please grant email permission and try again.",
            )
        user = User(
            email=email,
            name=name,
            hashed_password=None,
            auth_provider=provider,
            auth_provider_id=provider_id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create default shopping list for new user
        default_list = ShoppingList(user_id=user.id, name="My List")
        db.add(default_list)
        db.commit()
        logger.info("Created new %s user: %s", provider, user.id)

    if not getattr(user, "is_active", True):
        logger.warning("Blocked social login for deactivated user: %s", user.id)
        log_audit(db, action="social_login_blocked", request=request, user_id=user.id, detail={"provider": provider}, status="blocked")
        raise HTTPException(status_code=403, detail="Account has been deactivated. Contact support.")

    token = create_access_token({"sub": user.id, "role": user.role or "user"})
    rt = _issue_refresh_token(user, db)
    log_audit(db, action="social_login", request=request, user_id=user.id, detail={"provider": provider})
    return TokenResponse(access_token=token, refresh_token=rt, user=UserOut.model_validate(user))


# ── Token Refresh ─────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
def refresh_token(request: Request, payload: RefreshRequest, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access token + refresh token.
    The old refresh token is rotated (invalidated) on each use.
    """
    user = db.query(User).filter(User.refresh_token == payload.refresh_token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    expiry = user.refresh_token_expiry
    if not expiry:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expiry:
        # Expired — clear it and force re-login
        user.refresh_token = None
        user.refresh_token_expiry = None
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired. Please sign in again.")

    if not getattr(user, "is_active", True):
        user.refresh_token = None
        user.refresh_token_expiry = None
        db.commit()
        log_audit(db, action="token_refresh_blocked", request=request, user_id=user.id, status="blocked")
        raise HTTPException(status_code=403, detail="Account has been deactivated. Contact support.")

    # Issue new access token + rotate refresh token
    access = create_access_token({"sub": user.id, "role": user.role or "user"})
    new_rt = _issue_refresh_token(user, db)
    logger.info("Token refreshed for user %s", user.id)
    log_audit(db, action="token_refresh", request=request, user_id=user.id)
    return TokenResponse(access_token=access, refresh_token=new_rt, user=UserOut.model_validate(user))


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
        logger.info("[Password Reset] No SMTP_HOST configured; logging code instead. Code for %s: %s", to_email, code)
        return
    if not smtp_from:
        logger.warning("[Password Reset] SMTP_FROM is empty; cannot send reset email to %s", to_email)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your CartaraIQ password reset code"
    msg["From"] = smtp_from
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
        logger.info(
            "[Password Reset] Sending to %s | smtp_host=%r smtp_port=%r smtp_user=%r",
            to_email,
            smtp_host,
            smtp_port,
            (settings.smtp_user or "")[:5] + "..." if settings.smtp_user else "(empty)",
        )
        if smtp_port == 465:
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
        logger.exception("[Password Reset] Failed to send reset email to %s via %s:%s", to_email, smtp_host, smtp_port)


class UpdateMeRequest(BaseModel):
    name: str


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    old_name = current_user.name
    current_user.name = name
    db.commit()
    db.refresh(current_user)
    log_audit(db, action="user_update", request=request, user_id=current_user.id, detail={"old_name": old_name, "new_name": name})
    return current_user


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate the user's refresh token on sign-out."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if user:
        user.refresh_token = None
        user.refresh_token_expiry = None
        db.commit()
    log_audit(db, action="logout", request=request, user_id=current_user.id)
    return {"message": "Signed out successfully."}


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    logger.info("[DEBUG] forgot_password endpoint called with email: %s", payload.email)
    
    try:
        user = db.query(User).filter(User.email == payload.email).first()
        logger.info("[DEBUG] Database query executed, user found: %s", user is not None)
        # Always return the same message to avoid email enumeration
        if user:
            # Social-only users have no password to reset — skip silently
            if user.auth_provider and not user.hashed_password:
                logger.info("[Password Reset] Skipping for social-only user (%s): %s", user.auth_provider, user.email)
                return {"message": "If that email is registered, a reset code has been sent."}

            code = secrets.token_hex(3).upper()  # 6-char hex, e.g. "A3F7B2"
            user.reset_token = hashlib.sha256(code.encode()).hexdigest()
            user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
            db.commit()
            logger.info("[DEBUG] Reset token created for user, scheduling email")
            background_tasks.add_task(_send_reset_email, user.email, code)
        log_audit(db, action="password_reset_request", request=request, detail={"email": payload.email}, status="success")
        return {"message": "If that email is registered, a reset code has been sent."}
    except Exception as e:
        logger.exception("Error in forgot_password for email %s: %s", payload.email, str(e))
        raise


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.reset_token or not user.reset_token_expiry:
        log_audit(db, action="password_reset_failed", request=request, detail={"email": payload.email, "reason": "invalid_code"}, status="failure")
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

    # Block social-only users from creating a password via reset flow
    if user.auth_provider and not user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="This account uses social sign-in. Please log in with your social provider.",
        )

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
    log_audit(db, action="password_reset", request=request, user_id=user.id)
    return {"message": "Password updated successfully."}


# ── Biometric Authentication ──────────────────────────────────────────────────

class BiometricSetupRequest(BaseModel):
    pin_hash: str
    biometric_type: str


class BiometricStatusResponse(BaseModel):
    biometric_enabled: bool
    biometric_type: Optional[str]


@router.post("/biometric/setup", status_code=status.HTTP_200_OK)
def setup_biometric(
    payload: BiometricSetupRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enable biometric login for the current user."""
    try:
        if not payload.pin_hash or not payload.biometric_type:
            raise HTTPException(status_code=400, detail="PIN hash and biometric type are required.")

        user = db.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        user.biometric_enabled = True
        user.biometric_pin_hash = payload.pin_hash
        user.biometric_type = payload.biometric_type
        db.commit()
        log_audit(db, action="biometric_setup", request=request, user_id=current_user.id, detail={"type": payload.biometric_type})
        return {"message": "Biometric authentication enabled successfully."}
    except Exception as e:
        logger.exception("Error setting up biometric for user %s: %s", current_user.id, str(e))
        raise HTTPException(status_code=500, detail="Failed to set up biometric authentication.")


@router.post("/biometric/disable", status_code=status.HTTP_200_OK)
def disable_biometric(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable biometric login for the current user."""
    try:
        user = db.query(User).filter(User.id == current_user.id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        user.biometric_enabled = False
        user.biometric_pin_hash = None
        user.biometric_type = None
        db.commit()
        log_audit(db, action="biometric_disable", request=request, user_id=current_user.id)
        return {"message": "Biometric authentication disabled successfully."}
    except Exception as e:
        logger.exception("Error disabling biometric for user %s: %s", current_user.id, str(e))
        raise HTTPException(status_code=500, detail="Failed to disable biometric authentication.")


@router.get("/biometric/status", response_model=BiometricStatusResponse)
def get_biometric_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get biometric authentication status for the current user."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return BiometricStatusResponse(
        biometric_enabled=user.biometric_enabled,
        biometric_type=user.biometric_type,
    )
