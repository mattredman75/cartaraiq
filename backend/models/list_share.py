from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from ..database import Base


class ListShare(Base):
    __tablename__ = "list_shares"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    list_id = Column(String(36), ForeignKey("shopping_lists.id"), nullable=False, index=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    shared_with_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    invite_token = Column(String(36), nullable=False, unique=True, default=lambda: str(uuid.uuid4()))
    # status: "pending" | "accepted" | "declined"
    status = Column(String(16), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    shopping_list = relationship("ShoppingList", back_populates="shares")
    owner = relationship("User", foreign_keys=[owner_id])
    shared_with = relationship("User", foreign_keys=[shared_with_id])
