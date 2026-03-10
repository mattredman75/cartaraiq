import uuid
from sqlalchemy import Column, String, Text, DateTime, SmallInteger, DECIMAL
from sqlalchemy.sql import func
from ..database import Base


class ARRecipe(Base):
    __tablename__ = "ar_recipes"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recipe_db_id = Column(String(36), nullable=False, unique=True, index=True)
    name         = Column(String(500), nullable=False, index=True)
    description  = Column(Text, nullable=True)
    image_url    = Column(Text, nullable=True)
    prep_mins    = Column(SmallInteger, nullable=True, index=True)
    cook_mins    = Column(SmallInteger, nullable=True)
    total_mins   = Column(SmallInteger, nullable=True, index=True)
    servings     = Column(SmallInteger, nullable=True)
    calories     = Column(SmallInteger, nullable=True, index=True)
    fat_g        = Column(DECIMAL(6, 1), nullable=True)
    carbs_g      = Column(DECIMAL(6, 1), nullable=True)
    protein_g    = Column(DECIMAL(6, 1), nullable=True)
    fetched_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
