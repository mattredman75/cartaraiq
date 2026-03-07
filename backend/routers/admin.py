"""
Admin-only API endpoints for user management, dashboard analytics, and audit log browsing.
Every endpoint is gated behind get_admin_user (role == 'admin').
"""

import hashlib
import json
import logging
import os
import re
import secrets
import smtplib
import ssl
import subprocess
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
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
from ..models.test_run import TestRun
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
    last_activity: Optional[datetime] = None
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
    active_minutes: Optional[int] = Query(None, ge=1, le=1440, description="Filter to users active in the last N minutes"),
    registered_after: Optional[str] = Query(None, description="ISO date (YYYY-MM-DD). Filter to users registered on or after this date"),
    sort_by: Optional[str] = Query(None, description="Column to sort by: name, email, role, created_at, last_activity, list_count, item_count"),
    sort_dir: Optional[str] = Query("desc", description="Sort direction: asc or desc"),
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
    if active_minutes:
        cutoff = datetime.now() - timedelta(minutes=active_minutes)
        _auto = {"token_refresh", "token_refresh_blocked"}
        active_ids = [
            uid for (uid,) in db.query(distinct(AuditLog.user_id))
            .filter(AuditLog.user_id.isnot(None), AuditLog.created_at >= cutoff, AuditLog.action.notin_(_auto))
            .all()
        ]
        query = query.filter(User.id.in_(active_ids)) if active_ids else query.filter(User.id == None)  # noqa: E711
    if registered_after:
        try:
            reg_date = datetime.strptime(registered_after, "%Y-%m-%d")
            query = query.filter(User.created_at >= reg_date)
        except ValueError:
            pass  # Ignore invalid date format

    total = query.count()

    # Determine sort order
    _SORT_COLUMNS = {
        "name": User.name,
        "email": User.email,
        "role": User.role,
        "created_at": User.created_at,
        "is_active": User.is_active,
    }
    direction = "asc" if sort_dir == "asc" else "desc"
    sort_col = _SORT_COLUMNS.get(sort_by or "", User.created_at)
    order_clause = sort_col.asc() if direction == "asc" else sort_col.desc()

    # For last_activity / list_count / item_count sorting we need subqueries
    _last_activity_sq = (
        db.query(AuditLog.user_id, sa_func.max(AuditLog.created_at).label("last_act"))
        .filter(AuditLog.user_id.isnot(None))
        .group_by(AuditLog.user_id)
        .subquery()
    )
    _list_count_sq = (
        db.query(ShoppingList.user_id, sa_func.count(ShoppingList.id).label("cnt"))
        .group_by(ShoppingList.user_id)
        .subquery()
    )
    _item_count_sq = (
        db.query(ListItem.user_id, sa_func.count(ListItem.id).label("cnt"))
        .group_by(ListItem.user_id)
        .subquery()
    )

    if sort_by in ("last_activity", "list_count", "item_count"):
        if sort_by == "last_activity":
            query = query.outerjoin(_last_activity_sq, User.id == _last_activity_sq.c.user_id)
            col = _last_activity_sq.c.last_act
        elif sort_by == "list_count":
            query = query.outerjoin(_list_count_sq, User.id == _list_count_sq.c.user_id)
            col = _list_count_sq.c.cnt
        else:  # item_count
            query = query.outerjoin(_item_count_sq, User.id == _item_count_sq.c.user_id)
            col = _item_count_sq.c.cnt
        order_clause = col.asc().nullslast() if direction == "asc" else col.desc().nullslast()

    users_raw = query.order_by(order_clause).offset((page - 1) * page_size).limit(page_size).all()

    # Batch-fetch counts & last activity for the page of users
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
    last_activities = dict(
        db.query(AuditLog.user_id, sa_func.max(AuditLog.created_at))
        .filter(AuditLog.user_id.in_(user_ids))
        .group_by(AuditLog.user_id)
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
            last_activity=last_activities.get(u.id),
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

    # Prevent deactivating the last admin
    if user.role == "admin":
        admin_count = db.query(sa_func.count(User.id)).filter(User.role == "admin", User.is_active == True).scalar() or 0  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last admin. Promote another user first.")

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

    # Prevent demoting the last admin — system must always have at least one
    if payload.role != "admin" and user.role == "admin":
        admin_count = db.query(sa_func.count(User.id)).filter(User.role == "admin", User.is_active == True).scalar() or 0  # noqa: E712
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin. Promote another user first.")

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
    now = datetime.now()  # MySQL NOW() stores server-local time, not UTC

    total_users = db.query(sa_func.count(User.id)).scalar() or 0
    deactivated = db.query(sa_func.count(User.id)).filter(User.is_active == False).scalar() or 0  # noqa: E712

    # Active users derived from audit_logs (exclude automated events like token_refresh)
    _AUTOMATED_ACTIONS = {"token_refresh", "token_refresh_blocked"}

    def _active_since(minutes: int) -> int:
        cutoff = now - timedelta(minutes=minutes)
        return db.query(sa_func.count(distinct(AuditLog.user_id))).filter(
            AuditLog.user_id.isnot(None),
            AuditLog.created_at >= cutoff,
            AuditLog.action.notin_(_AUTOMATED_ACTIONS),
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
    now = datetime.now()
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
    now = datetime.now()
    cutoff = now - timedelta(hours=24)

    failed_logins = db.query(sa_func.count(AuditLog.id)).filter(
        AuditLog.action.in_(["login_failed", "admin_login_failed", "admin_login_denied", "social_login_failed"]),
        AuditLog.created_at >= cutoff,
    ).scalar() or 0

    blocked_logins = db.query(sa_func.count(AuditLog.id)).filter(
        AuditLog.action.in_(["login_blocked", "admin_login_blocked", "admin_login_denied", "social_login_blocked", "token_refresh_blocked"]),
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
    since_hours: Optional[int] = Query(None, ge=1, le=720),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Browse audit logs with filtering and pagination."""
    query = db.query(AuditLog)

    if action:
        # Support comma-separated actions for multi-action filtering
        actions = [a.strip() for a in action.split(",") if a.strip()]
        if len(actions) == 1:
            query = query.filter(AuditLog.action == actions[0])
        else:
            query = query.filter(AuditLog.action.in_(actions))
    if since_hours:
        cutoff = datetime.now() - timedelta(hours=since_hours)
        query = query.filter(AuditLog.created_at >= cutoff)
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


# ── Test Results ─────────────────────────────────────────────────────────────

# Project root is two levels up from this file (backend/routers/admin.py → project root)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

_SUITE_TIMEOUT = 120  # seconds per test suite


def _parse_pytest_output(stdout: str, stderr: str) -> dict:
    """Parse pytest text output for pass/fail/skip counts and coverage."""
    combined = stdout + "\n" + stderr
    result: dict = {"passed": 0, "failed": 0, "skipped": 0, "errors": 0, "total": 0, "coverage": None, "duration": None}

    # Match summary line like "45 passed, 1 failed, 2 skipped in 12.34s"
    summary = re.search(r"=+\s*(.*?)\s*in\s+([\d.]+)s\s*=+", combined)
    if summary:
        parts_str = summary.group(1)
        result["duration"] = float(summary.group(2))
        for part in parts_str.split(","):
            part = part.strip()
            m = re.match(r"(\d+)\s+(\w+)", part)
            if m:
                count, label = int(m.group(1)), m.group(2).lower()
                if label in result:
                    result[label] = count
    else:
        # Fallback: short format "45 passed"
        for label in ("passed", "failed", "skipped", "error"):
            m = re.search(rf"(\d+)\s+{label}", combined)
            if m:
                key = "errors" if label == "error" else label
                result[key] = int(m.group(1))

    result["total"] = result["passed"] + result["failed"] + result["skipped"] + result["errors"]

    # Parse TOTAL coverage line like "TOTAL    1234   56   95%"
    cov = re.search(r"TOTAL\s+\d+\s+\d+\s+(\d+)%", combined)
    if cov:
        result["coverage"] = int(cov.group(1))

    return result


def _parse_jest_json(stdout: str) -> dict:
    """Parse Jest --json output."""
    result: dict = {"passed": 0, "failed": 0, "skipped": 0, "errors": 0, "total": 0, "coverage": None, "duration": None}
    try:
        # Jest may print warnings before JSON — find the first '{'
        idx = stdout.index("{")
        data = json.loads(stdout[idx:])
        result["passed"] = data.get("numPassedTests", 0)
        result["failed"] = data.get("numFailedTests", 0)
        result["skipped"] = data.get("numPendingTests", 0)
        result["total"] = data.get("numTotalTests", 0)

        # Duration: Jest reports startTime in ms
        if data.get("testResults"):
            start = data.get("startTime", 0)
            end = max(tr.get("endTime", 0) for tr in data["testResults"])
            if start and end:
                result["duration"] = round((end - start) / 1000, 2)

        # Test suites info
        result["suites_passed"] = data.get("numPassedTestSuites", 0)
        result["suites_failed"] = data.get("numFailedTestSuites", 0)
        result["suites_total"] = data.get("numTotalTestSuites", 0)

        # Failed test details
        failed_tests = []
        for suite in data.get("testResults", []):
            for assertion in suite.get("assertionResults", []) + suite.get("testResults", []):
                if assertion.get("status") == "failed":
                    failed_tests.append({
                        "name": assertion.get("fullName") or assertion.get("title", ""),
                        "message": "\n".join(assertion.get("failureMessages", []))[:500],
                    })
        if failed_tests:
            result["failed_tests"] = failed_tests[:20]

    except (ValueError, json.JSONDecodeError, KeyError):
        pass
    return result


def _parse_vitest_json(stdout: str) -> dict:
    """Parse Vitest --reporter=json output."""
    result: dict = {"passed": 0, "failed": 0, "skipped": 0, "errors": 0, "total": 0, "coverage": None, "duration": None}
    try:
        idx = stdout.index("{")
        data = json.loads(stdout[idx:])

        result["passed"] = data.get("numPassedTests", 0)
        result["failed"] = data.get("numFailedTests", 0)
        result["skipped"] = data.get("numPendingTests", 0) + data.get("numTodoTests", 0)
        result["total"] = data.get("numTotalTests", 0)

        # Duration
        if data.get("startTime"):
            start = data["startTime"]
            # endTime may not exist — estimate from test results
            ends = [tr.get("endTime", 0) for tr in data.get("testResults", [])]
            end = max(ends) if ends else 0
            if start and end:
                result["duration"] = round((end - start) / 1000, 2)

        result["suites_passed"] = data.get("numPassedTestSuites", 0)
        result["suites_failed"] = data.get("numFailedTestSuites", 0)
        result["suites_total"] = data.get("numTotalTestSuites", 0)

        # Failed test details
        failed_tests = []
        for suite in data.get("testResults", []):
            for assertion in suite.get("assertionResults", []):
                if assertion.get("status") == "failed":
                    failed_tests.append({
                        "name": assertion.get("fullName") or assertion.get("title", ""),
                        "message": "\n".join(assertion.get("failureMessages", []))[:500],
                    })
        if failed_tests:
            result["failed_tests"] = failed_tests[:20]

    except (ValueError, json.JSONDecodeError, KeyError):
        pass
    return result


def _run_suite(suite: str) -> dict:
    """Run a single test suite and return structured results."""
    if suite == "backend":
        cmd = ["python", "-m", "pytest", "backend/tests", "--tb=short", "-q", "--no-header",
               "--cov=backend", "--cov-report=term-missing"]
        cwd = _PROJECT_ROOT
        parser = _parse_pytest_output
    elif suite == "app":
        cmd = ["npx", "jest", "--json", "--no-coverage", "--forceExit"]
        cwd = os.path.join(_PROJECT_ROOT, "app")
        parser = _parse_jest_json
    elif suite == "admin":
        cmd = ["npx", "vitest", "run", "--reporter=json"]
        cwd = os.path.join(_PROJECT_ROOT, "admin")
        parser = _parse_vitest_json
    else:
        return {"status": "error", "error": f"Unknown suite: {suite}"}

    try:
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True,
            timeout=_SUITE_TIMEOUT,
            env={**os.environ, "CI": "true", "FORCE_COLOR": "0"},
        )
        stats = parser(proc.stdout, proc.stderr) if suite == "backend" else parser(proc.stdout)
        run_status = "pass" if proc.returncode == 0 else "fail"
        return {
            "status": run_status,
            "exit_code": proc.returncode,
            **stats,
            "output": (proc.stdout[-3000:] if len(proc.stdout) > 3000 else proc.stdout),
            "stderr": (proc.stderr[-1000:] if len(proc.stderr) > 1000 else proc.stderr),
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"Test suite timed out after {_SUITE_TIMEOUT}s"}
    except FileNotFoundError as e:
        return {"status": "error", "error": f"Command not found: {e}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def _run_tests_background(run_ids: dict[str, str]):
    """Background task: run test suites and persist results to DB."""
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        for suite_name, run_id in run_ids.items():
            result = _run_suite(suite_name)
            run = db.query(TestRun).filter(TestRun.id == run_id).first()
            if not run:
                continue
            run.status = result.get("status", "error")
            run.passed = result.get("passed", 0)
            run.failed = result.get("failed", 0)
            run.skipped = result.get("skipped", 0)
            run.errors = result.get("errors", 0)
            run.total = result.get("total", 0)
            run.coverage = result.get("coverage")
            run.duration = result.get("duration")
            run.output = result.get("output")
            run.stderr = result.get("stderr")
            run.error_message = result.get("error")
            failed_tests = result.get("failed_tests")
            run.failed_tests_json = json.dumps(failed_tests) if failed_tests else None
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Background test run failed")
    finally:
        db.close()


def _test_run_to_dict(run: TestRun) -> dict:
    """Serialize a TestRun row to API response dict."""
    return {
        "id": run.id,
        "suite": run.suite,
        "status": run.status,
        "passed": run.passed,
        "failed": run.failed,
        "skipped": run.skipped,
        "errors": run.errors,
        "total": run.total,
        "coverage": run.coverage,
        "duration": run.duration,
        "output": run.output,
        "stderr": run.stderr,
        "error": run.error_message,
        "failed_tests": json.loads(run.failed_tests_json) if run.failed_tests_json else None,
        "triggered_by": run.triggered_by,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


@router.post("/tests/run")
async def run_tests(
    background_tasks: BackgroundTasks,
    suite: str = Query(..., description="Test suite to run: backend, app, admin, or all"),
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Kick off test suite(s) in the background. Returns immediately with run IDs."""
    valid = {"backend", "app", "admin", "all"}
    if suite not in valid:
        raise HTTPException(status_code=400, detail=f"suite must be one of: {', '.join(sorted(valid))}")

    suites_to_run = ["backend", "app", "admin"] if suite == "all" else [suite]

    # Create a TestRun row per suite with status="running"
    run_ids: dict[str, str] = {}
    runs_out: dict[str, dict] = {}
    for s in suites_to_run:
        run = TestRun(suite=s, status="running", triggered_by=_admin.id)
        db.add(run)
        db.flush()  # populate id
        run_ids[s] = run.id
        runs_out[s] = _test_run_to_dict(run)
    db.commit()

    # Fire-and-forget background execution
    background_tasks.add_task(_run_tests_background, run_ids)

    return {"suites": runs_out}


@router.get("/tests/results")
async def get_test_results(
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return the most recent test run for each suite."""
    from sqlalchemy import desc

    suites_out: dict[str, dict | None] = {}
    for suite_name in ("backend", "app", "admin"):
        run = (
            db.query(TestRun)
            .filter(TestRun.suite == suite_name)
            .order_by(desc(TestRun.created_at))
            .first()
        )
        suites_out[suite_name] = _test_run_to_dict(run) if run else None

    return {"suites": suites_out}


@router.get("/tests/history")
async def get_test_history(
    limit: int = Query(20, ge=1, le=100, description="Max runs per suite"),
    _admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Return recent test runs per suite for trend charts."""
    from sqlalchemy import desc

    history: dict[str, list[dict]] = {}
    for suite_name in ("backend", "app", "admin"):
        runs = (
            db.query(TestRun)
            .filter(TestRun.suite == suite_name, TestRun.status != "running")
            .order_by(desc(TestRun.created_at))
            .limit(limit)
            .all()
        )
        # Return oldest-first for charting
        history[suite_name] = [
            {
                "id": r.id,
                "status": r.status,
                "passed": r.passed,
                "failed": r.failed,
                "skipped": r.skipped,
                "total": r.total,
                "coverage": r.coverage,
                "duration": r.duration,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reversed(runs)
        ]

    return {"history": history}
