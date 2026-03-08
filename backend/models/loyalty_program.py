from sqlalchemy import Column, String, Text, Integer, DateTime, Boolean
from sqlalchemy.sql import func
import uuid
from ..database import Base


class LoyaltyProgram(Base):
    __tablename__ = "loyalty_programs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(1000), nullable=True)
    logo_background = Column(String(20), nullable=True)
    # JSON: {"prefixes": [...], "lengths": [...], "symbology": [...]}
    detection_rules = Column(Text, nullable=False, default='{"prefixes":[],"lengths":[],"symbology":[]}', server_default=None)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
