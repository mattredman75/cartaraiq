"""
Admin-only API endpoints for user management, dashboard analytics, and audit log browsing.
Every endpoint is gated behind get_admin_user (role == 'admin').
"""

import hashlib
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func as sa_func, case, distinct
from sqlalchemy.orm import Session

from ..auth import get_admin_user, hash_password
from ..config import settings
from ..database import get_db
from ..models.audit_log import AuditLog
from ..models.list_item import ListItem
from ..models.push_token import PushToken
from ..models.shopping_list import ShoppingList
from ..models.user import User
from ..services.audit import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AdminUserSummary(BaseModel):
    id: str
    email: str
    name: str
    role: str
    auth_provider: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    list_count: int = 0
    item_count: int = 0

    class Config:
        from_attributes = True


class PaginatedUsers(BaseModel):
    users: List[AdminUserSummary]
    total: int
    page: int
    page_size: int


class AdminUserDetail(BaseModel):
    id: str
    email: str
    name: str
    role: str
    auth_provider: Optional[str] = None
    auth_provider_id: Optional[str] = None
    is_active: bool
    biometric_enabled: bool = False
    biometric_type: Optional[str] = None
    created_at: Optional[datetime] = None
    has_password: bool = False
    has_refresh_token: bool = False
    list_count: int = 0
    item_count: int = 0
    push_token_count: int = 0
    recent_audit: List[dict] = []

    class Config:
        from_attributes = True


class SetRoleRequest(BaseModel):
    role: str  # "user" or "admin"


class DashboardOverview(BaseModel):
    total_users: int
    active_users_5m: int
    active_users_15m: int
    active_users_30m: int
    new_today: int
    new_this_week: int
    new_this_month: int
    deactivated_users: int
    auth_provider_breakdown: dict
    total_lists: int
    total_items: int


class GrowthData(BaseModel):
    date: str
    count: int


class SecurityEvent(BaseModel):
    total_failed_logins_24h: int
    total_blocked_logins_24h: int
    total_password_resets_24h: int
    total_deactivated_accounts: int
    recent_failures: List[dict]


class AuditLogEntry(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    action: str
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaginatedAuditLogs(BaseModel):
    logs: List[AuditLogEntry]
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    message: str


# ── User Management ─────────────────────────────────────────────────────────

@router.get("/users", response_model=PaginatedUsers)
def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    auth_provider: Optional[str] = None,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Paginated user list with search and filters."""
    query = db.query(User)

    if search:
        like = f"%{search}%"
        query = query.filter((User.email.ilike(like)) | (User.name.ilike(like)))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if auth_provider:
        if auth_provider == "email":
            query = query.filter(User.auth_provider.is_(None))
        else:
            query = query.filter(User.auth_provider == auth_provider)
    if role:
        query = query.filter(User.role == role)

    total = query.count()
    users_raw = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Batch-fetch counts for the page of users
    user_ids = [u.id for u in users_raw]
    list_counts = dict(
        db.query(ShoppingList.user_id, sa_func.count(ShoppingList.id))
        .filter(ShoppingList.user_id.in_(user_ids))
        .group_by(ShoppingList.user_id)
        .all()
    ) if user_ids else {}
    item_counts = dict(
        db.query(ListItem.user_id, sa_func.count(ListItem.id))
        .filter(ListItem.user_id.in_(user_ids))
        .group_by(ListItem.user_id)
        .all()
    ) if user_ids else {}

    users = []
    for u in users_raw:
        users.append(AdminUserSummary(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role or "user",
            auth_provider=u.auth_provider,
            is_active=u.is_active,
            created_at=u.created_at,
            list_count=list_counts.get(u.id, 0),
            item_count=item_counts.get(u.id, 0),
        ))

    return PaginatedUsers(users=users, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user_detail(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Full detail for a single user, including recent audit history."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    list_count = db.query(sa_func.count(ShoppingList.id)).filter(ShoppingList.user_id == user_id).scalar() or 0
    item_count = db.query(sa_func.count(ListItem.id)).filter(ListItem.user_id == user_id).scalar() or 0
    push_count = db.query(sa_func.count(PushToken.id)).filter(PushToken.user_id == user_id).scalar() or 0

    recent = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )
    audit_entries = [
        {
            "id": a.id,
            "action": a.action,
            "status": a.status,
            "ip_address": a.ip_address,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "detail": a.detail,
        }
        for a in recent
    ]

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role or "user",
        auth_provider=user.auth_provider,
        auth_provider_id=user.auth_provider_id,
        is_active=user.is_active,
        biometric_enabled=user.biometric_enabled,
        biometric_type=user.biometric_type,
        created_at=user.created_at,
        has_password=user.hashed_password is not None,
        has_refresh_token=user.refresh_token is not None,
        list_count=list_count,
        item_count=item_count,
        push_token_count=push_count,
        recent_audit=audit_entries,
    )


@router.post("/users/{user_id}/deactivate", response_model=MessageResponse)
def deactivate_user(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Deactivate a user and revoke their refresh token."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    user.is_active = False
    user.refresh_token = None
    user.refresh_token_expiry = None
    db.commit()

    log_audit(db, action="admin_deactivate_user", request=request, user_id=admin.id,
              detail={"target_user_id": user_id, "target_email": user.email})
    return MessageResponse(message=f"User {user.email} deactivated")


@router.post("/users/{user_id}/activate", response_model=MessageResponse)
def activate_user(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Re-activate a deactivated user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()

    log_audit(db, action="admin_activate_user", request=request, user_id=admin.id,
              detail={"target_user_id": user_id, "target_email": user.email})
    return MessageResponse(message=f"User {user.email} activated")


@router.post("/users/{user_id}/force-password-reset", response_model=MessageResponse)
def force_password_reset(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Force a password reset: generate a reset token, email the user, and clear
    their hashed password so they must reset before logging in again.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate a reset token (same pattern as existing password-reset flow)
    raw_token = secrets.token_urlsafe(32)
    user.reset_token = hashlib.sha256(raw_token.encode()).hexdigest()
    user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    # Clear password to force reset
    user.hashed_password = None
    # Revoke sessions
    user.refresh_token = None
    user.refresh_token_expiry = None
    db.commit()

    # Send reset email in foreground (admin action, acceptable latency)
    reset_link = f"https://cartaraiq.app/reset-password?token={raw_token}"
    try:
        _send_forced_reset_email(user.email, user.name, reset_link)
    except Exception as e:
        logger.error("Failed to send forced reset email to %s: %s", user.email, str(e))
        # Don't fail the endpoint — the reset token is already set
        log_audit(db, action="admin_force_reset_email_failed", request=request, user_id=admin.id,
                  detail={"target_user_id": user_id, "error": str(e)}, status="failure")
        return MessageResponse(message=f"Password reset for {user.email} — email delivery failed, token is set")

    log_audit(db, action="admin_force_password_reset", request=request, user_id=admin.id,
              detail={"target_user_id": user_id, "target_email": user.email})
    return MessageResponse(message=f"Password reset email sent to {user.email}")


@router.post("/users/{user_id}/revoke-sessions", response_model=MessageResponse)
def revoke_sessions(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Revoke all sessions by clearing the refresh token."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.refresh_token = None
    user.refresh_token_expiry = None
    db.commit()

    log_audit(db, action="admin_revoke_sessions", request=request, user_id=admin.id,
              detail={"target_user_id": user_id, "target_email": user.email})
    return MessageResponse(message=f"Sessions revoked for {user.email}")


@router.put("/users/{user_id}/role", response_model=MessageResponse)
def change_role(
    user_id: str,
    payload: SetRoleRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Change a user's role (user/admin)."""
    if payload.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role
    user.role = payload.role
    db.commit()

    log_audit(db, action="admin_change_role", request=request, user_id=admin.id,
              detail={"target_user_id": user_id, "old_role": old_role, "new_role": payload.role})
    return MessageResponse(message=f"Role changed from {old_role} to {payload.role} for {user.email}")


# ── Dashboard & Analytics ────────────────────────────────────────────────────

@router.get("/dashboard/overview", response_model=DashboardOverview)
def dashboard_overview(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Aggregated stats for the admin dashboard."""
    now = datetime.now(timezone.utc)

    total_users = db.query(sa_func.count(User.id)).scalar() or 0
    deactivated = db.query(sa_func.count(User.id)).filter(User.is_active == False).scalar() or 0  # noqa: E712

    # Active users derived from audit_logs
    def _active_since(minutes: int) -> int:
        cutoff = now - timedelta(minutes=minutes)
        return db.query(sa_func.count(distinct(AuditLog.user_id))).filter(
            AuditLog.user_id.isnot(None),
            AuditLog.created_at >= cutoff,
        ).scalar() or 0

    active_5 = _active_since(5)
    active_15 = _active_since(15)
    active_30 = _active_since(30)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    new_today = db.query(sa_func.count(User.id)).filter(User.created_at >= today_start).scalar() or 0
    new_week = db.query(sa_func.count(User.id)).filter(User.created_at >= week_start).scalar() or 0
    new_month = db.query(sa_func.count(User.id)).filter(User.created_at >= month_start).scalar() or 0

    # Auth provider breakdown
    provider_rows = db.query(
        case((User.auth_provider.is_(None), "email"), else_=User.auth_provider).label("provider"),
        sa_func.count(User.id),
    ).group_by("provider").all()
    provider_map = {row[0]: row[1] for row in provider_rows}

    total_lists = db.query(sa_func.count(ShoppingList.id)).scalar() or 0
    total_items = db.query(sa_func.count(ListItem.id)).scalar() or 0

    return DashboardOverview(
        total_users=total_users,
        active_users_5m=active_5,
        active_users_15m=active_15,
        active_users_30m=active_30,
        new_today=new_today,
        new_this_week=new_week,
        new_this_month=new_month,
        deactivated_users=deactivated,
        auth_provider_breakdown=provider_map,
        total_lists=total_lists,
        total_items=total_items,
    )


@router.get("/dashboard/growth", response_model=List[GrowthData])
def dashboard_growth(
    request: Request,
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Daily registration counts for the last N days."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)

    rows = (
        db.query(
            sa_func.date(User.created_at).label("day"),
            sa_func.count(User.id).label("cnt"),
        )
        .filter(User.created_at >= cutoff)
        .group_by("day")
        .order_by("day")
        .all()
    )
    return [GrowthData(date=str(r.day), count=r.cnt) for r in rows]


@router.get("/dashboard/security", response_model=SecurityEvent)
def dashboard_security(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Security-focused metrics for the last 24 hours."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)

    failed_logins = db.query(sa_func.count(AuditLog.id)).filter(
        AuditLog.action.in_(["login_failed", "social_login_failed"]),
        AuditLog.created_at >= cutoff,
    ).scalar() or 0

    blocked_logins = db.query(sa_func.count(AuditLog.id)).filter(
        AuditLog.action.in_(["login_blocked", "social_login_blocked", "token_refresh_blocked"]),
        AuditLog.created_at >= cutoff,
    ).scalar() or 0

    pw_resets = db.query(sa_func.count(AuditLog.id)).filter(
        AuditLog.action.in_(["password_reset_request", "admin_force_password_reset"]),
        AuditLog.created_at >= cutoff,
    ).scalar() or 0

    deactivated = db.query(sa_func.count(User.id)).filter(User.is_active == False).scalar() or 0  # noqa: E712

    recent_failures = (
        db.query(AuditLog)
        .filter(AuditLog.status != "success", AuditLog.created_at >= cutoff)
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )

    return SecurityEvent(
        total_failed_logins_24h=failed_logins,
        total_blocked_logins_24h=blocked_logins,
        total_password_resets_24h=pw_resets,
        total_deactivated_accounts=deactivated,
        recent_failures=[
            {
                "id": a.id,
                "action": a.action,
                "status": a.status,
                "ip_address": a.ip_address,
                "user_id": a.user_id,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "detail": a.detail,
            }
            for a in recent_failures
        ],
    )


# ── Audit Log Browser ───────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=PaginatedAuditLogs)
def browse_audit_logs(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    ip: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Browse audit logs with filtering and pagination."""
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if status_filter:
        query = query.filter(AuditLog.status == status_filter)
    if ip:
        query = query.filter(AuditLog.ip_address == ip)
    if search:
        # Search by user email — find matching user IDs first
        like = f"%{search}%"
        matching_ids = [uid for (uid,) in db.query(User.id).filter(User.email.ilike(like)).all()]
        if matching_ids:
            query = query.filter(AuditLog.user_id.in_(matching_ids))
        else:
            # No matching users — return empty result
            return PaginatedAuditLogs(logs=[], total=0, page=page, page_size=page_size)

    total = query.count()
    logs_raw = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Batch-resolve user emails
    log_user_ids = list({log.user_id for log in logs_raw if log.user_id})
    email_map = {}
    if log_user_ids:
        email_rows = db.query(User.id, User.email).filter(User.id.in_(log_user_ids)).all()
        email_map = {uid: email for uid, email in email_rows}

    entries = [
        AuditLogEntry(
            id=log.id,
            user_id=log.user_id,
            user_email=email_map.get(log.user_id) if log.user_id else None,
            action=log.action,
            detail=log.detail,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            status=log.status,
            created_at=log.created_at,
        )
        for log in logs_raw
    ]

    return PaginatedAuditLogs(
        logs=entries,
        total=total,
        page=page,
        page_size=page_size,
    )


# ── Email Helper ─────────────────────────────────────────────────────────────

def _send_forced_reset_email(to_email: str, name: str, reset_link: str) -> None:
    """Send a password-reset email triggered by an admin."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "CartaraIQ — Password Reset Required"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    text = f"""Hi {name},

An administrator has required a password reset for your CartaraIQ account.

Please reset your password using the link below (valid for 1 hour):

{reset_link}

If you did not expect this, please contact support@cartaraiq.app.

— CartaraIQ Team
"""
    html = f"""<html><body>
<p>Hi {name},</p>
<p>An administrator has required a password reset for your CartaraIQ account.</p>
<p><a href="{reset_link}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Your Password</a></p>
<p style="color:#666;font-size:13px;">This link is valid for 1 hour. If you did not expect this, contact support@cartaraiq.app.</p>
<p>— CartaraIQ Team</p>
</body></html>"""

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    ctx = ssl.create_default_context()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls(context=ctx)
        server.login(settings.smtp_user, settings.smtp_pass)
        server.sendmail(settings.smtp_from, to_email, msg.as_string())
