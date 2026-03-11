from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from ..database import Base


class ItemGroup(Base):
    __tablename__ = "item_groups"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    list_id = Column(String(36), ForeignKey("shopping_lists.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    shopping_list = relationship("ShoppingList", back_populates="item_groups")
    items = relationship("ListItem", back_populates="group", foreign_keys="ListItem.group_id")
