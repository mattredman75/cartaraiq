from sqlalchemy import Column, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from ..database import Base


class AppAdmin(Base):
    __tablename__ = "app_admin"

    id = Column(String(36), primary_key=True)
    key = Column(String(255), unique=True, nullable=False, index=True)
    value = Column(Boolean, default=False, nullable=False)
    message = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
