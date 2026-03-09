import uuid
from sqlalchemy import Column, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from ..database import Base


class RecipeDB(Base):
    __tablename__ = "recipes_db"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug       = Column(String(255), nullable=False, unique=True, index=True)
    name       = Column(String(500), nullable=False)
    image_url  = Column(Text, nullable=True)
    recipe_url = Column(Text, nullable=False)
    processed  = Column(Boolean, nullable=False, default=False, index=True)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
