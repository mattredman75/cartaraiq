import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from ..database import Base


class ARRecipeHeart(Base):
    __tablename__ = "ar_recipe_hearts"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String(36), nullable=False, index=True)
    recipe_id  = Column(String(36), nullable=False, index=True)
    hearted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
