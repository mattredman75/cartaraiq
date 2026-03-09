from sqlalchemy import Column, Integer, String, PrimaryKeyConstraint
from ..database import Base


class ARRecipeTag(Base):
    __tablename__ = "ar_recipe_tags"
    __table_args__ = (
        PrimaryKeyConstraint("recipe_id", "tag_id"),
    )

    recipe_id = Column(String(36), nullable=False, index=True)
    tag_id    = Column(Integer, nullable=False, index=True)
