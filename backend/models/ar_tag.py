from sqlalchemy import Column, Integer, String
from ..database import Base


class ARTag(Base):
    __tablename__ = "ar_tags"

    id       = Column(Integer, primary_key=True, autoincrement=True)
    slug     = Column(String(100), nullable=False, unique=True, index=True)
    name     = Column(String(100), nullable=False)
    tag_type = Column(String(20), nullable=False, default="other", index=True)
