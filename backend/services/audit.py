"""
Audit logging service — records sensitive actions for monitoring and compliance.

Usage:
    from ..services.audit import log_audit
    log_audit(db, action="login", user_id=user.id, request=request, status="success")
"""

import json
import logging
from typing import Optional, Union
from fastapi import Request
from sqlalchemy.orm import Session
from ..models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    *,
    action: str,
    request: Optional[Request] = None,
    user_id: Optional[str] = None,
    detail: Optional[Union[dict, str]] = None,
    status: str = "success",
) -> None:
    """
    Record an audit event.

    Actions:
        login, login_failed, register, social_login, social_login_failed,
        logout, token_refresh, password_reset_request, password_reset,
        account_deactivated_block, biometric_setup, biometric_disable,
        data_export, data_import, user_update, push_register, push_unregister,
        maintenance_toggle, rate_limited
    """
    try:
        ip_address = None
        user_agent = None
        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")[:500]

        detail_str = None
        if detail:
            detail_str = json.dumps(detail) if isinstance(detail, dict) else str(detail)

        entry = AuditLog(
            user_id=user_id,
            action=action,
            detail=detail_str,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
        )
        db.add(entry)
        db.commit()
    except Exception:
        logger.exception("Failed to write audit log for action=%s user_id=%s", action, user_id)
        # Never let audit logging break the main flow
        try:
            db.rollback()
        except Exception:
            pass
