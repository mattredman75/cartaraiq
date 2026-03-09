from sqlalchemy import Column, Integer, String, SmallInteger, Text
from ..database import Base


class ARStep(Base):
    __tablename__ = "ar_steps"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id   = Column(String(36), nullable=False, index=True)
    step_number = Column(SmallInteger, nullable=False)
    instruction = Column(Text, nullable=False)
