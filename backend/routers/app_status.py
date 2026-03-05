from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AppAdmin
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/app", tags=["app"])


class AppStatusResponse(BaseModel):
    maintenance: bool
    message: str


@router.get("/status", response_model=AppStatusResponse)
def get_app_status(db: Session = Depends(get_db)):
    """
    Check if the app is in maintenance mode.
    No authentication required — called frequently by mobile clients.
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
