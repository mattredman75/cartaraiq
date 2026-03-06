from fastapi import APIRouter, Depends, HTTPException, Request, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import AppAdmin, PushToken
from ..auth import get_admin_user, get_current_user
from ..models.user import User
from ..services.push_notifications import broadcast_maintenance_update
from ..services.audit import log_audit
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app", tags=["app"])


class AppStatusResponse(BaseModel):
    maintenance: bool
    message: str


class SetMaintenanceRequest(BaseModel):
    maintenance: bool
    message: str = ""


@router.get("/status", response_model=AppStatusResponse)
def get_app_status(db: Session = Depends(get_db)):
    """
    Check if the app is in maintenance mode.
    No authentication required — called on foreground.
    """
    try:
        # Query the maintenance_mode flag from app_admin table
        maintenance_record = db.query(AppAdmin).filter(
            AppAdmin.key == "maintenance_mode"
        ).first()

        if not maintenance_record:
            # If record doesn't exist, assume app is operational
            logger.warning("maintenance_mode record not found in app_admin table")
            return AppStatusResponse(maintenance=False, message="")

        message = maintenance_record.message or ""
        return AppStatusResponse(
            maintenance=maintenance_record.value,
            message=message
        )
    except Exception as e:
        logger.error(f"Error checking app status: {e}")
        # Fail open — assume app is operational if we can't read the status
        return AppStatusResponse(maintenance=False, message="")


@router.put("/maintenance", response_model=AppStatusResponse)
def set_maintenance_mode(
    req: SetMaintenanceRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _user=Depends(get_admin_user),
):
    """
    Toggle maintenance mode and broadcast a silent push to all devices.
    Requires authentication (admin use).
    """
    record = db.query(AppAdmin).filter(AppAdmin.key == "maintenance_mode").first()
    if not record:
        raise HTTPException(status_code=404, detail="maintenance_mode record not found")

    record.value = req.maintenance
    record.message = req.message
    db.commit()
    db.refresh(record)

    log_audit(db, action="maintenance_toggle", request=request, user_id=_user.id, detail={"maintenance": req.maintenance, "message": req.message})

    # Gather all push tokens and broadcast in the background
    all_tokens = [pt.token for pt in db.query(PushToken.token).all()]
    if all_tokens:
        background_tasks.add_task(
            broadcast_maintenance_update,
            tokens=all_tokens,
            maintenance=req.maintenance,
            message=req.message,
        )
        logger.info(f"Broadcasting maintenance={req.maintenance} to {len(all_tokens)} devices")

    return AppStatusResponse(
        maintenance=record.value,
        message=record.message or "",
    )


# ── App Lifecycle ────────────────────────────────────────────────────────────

class AppLifecycleRequest(BaseModel):
    state: str  # "foreground" or "background"


@router.post("/lifecycle", status_code=204)
def report_lifecycle(
    payload: AppLifecycleRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Report app foreground/background transitions for audit trail."""
    action = f"app_{payload.state}" if payload.state in ("foreground", "background") else None
    if not action:
        return
    log_audit(db, action=action, request=request, user_id=current_user.id)

