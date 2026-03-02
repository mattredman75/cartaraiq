from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from ..database import Base


class IngredientPairing(Base):
    """
    DB-level cache for TheMealDB ingredient co-occurrence data.

    Each row records how many TheMealDB recipes that contain
    `base_ingredient` also contain `paired_ingredient`.

    The composite PK acts as a natural upsert key.
    TTL is enforced by comparing `fetched_at` against a cutoff at query time.
    """

    __tablename__ = "ingredient_pairings"

    base_ingredient = Column(String(100), primary_key=True)
    paired_ingredient = Column(String(100), primary_key=True)
    co_occurrence_count = Column(Integer, default=1, nullable=False)
    fetched_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
