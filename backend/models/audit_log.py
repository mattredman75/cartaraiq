from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
import uuid
from ..database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=True, index=True)  # nullable for unauthenticated events
    action = Column(String(100), nullable=False, index=True)  # e.g. "login", "register", "password_reset"
    detail = Column(Text, nullable=True)  # JSON or free-text detail
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="success")  # "success", "failure", "blocked"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
