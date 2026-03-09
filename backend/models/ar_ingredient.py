from sqlalchemy import Column, Integer, String, SmallInteger
from ..database import Base


class ARIngredient(Base):
    __tablename__ = "ar_ingredients"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id  = Column(String(36), nullable=False, index=True)
    sort_order = Column(SmallInteger, nullable=False, default=0)
    raw_text   = Column(String(500), nullable=False)
