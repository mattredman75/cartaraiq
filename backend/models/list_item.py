from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from ..database import Base


class ListItem(Base):
    __tablename__ = "list_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    list_id = Column(String(36), ForeignKey("shopping_lists.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    quantity = Column(Integer, default=1)
    unit = Column(String(50), nullable=True)
    checked = Column(Integer, default=0)  # 0=active, 1=done, 2=soft-deleted
    sort_order = Column(Integer, nullable=True)
    times_added = Column(Integer, default=1)
    last_added_at = Column(DateTime(timezone=True), server_default=func.now())
    avg_days_between_adds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="list_items")
    shopping_list = relationship("ShoppingList", back_populates="items")
