from sqlalchemy import Column, String, DateTime, Text, Integer, Float
from sqlalchemy.sql import func
import uuid
from ..database import Base


class TestRun(Base):
    __tablename__ = "test_runs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    suite = Column(String(20), nullable=False, index=True)         # backend | app | admin
    status = Column(String(20), nullable=False, default="running") # running | pass | fail | error
    passed = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    skipped = Column(Integer, nullable=False, default=0)
    errors = Column(Integer, nullable=False, default=0)
    total = Column(Integer, nullable=False, default=0)
    coverage = Column(Float, nullable=True)  # Deprecated: use individual metrics
    coverage_statements = Column(Float, nullable=True)
    coverage_branches = Column(Float, nullable=True)
    coverage_functions = Column(Float, nullable=True)
    coverage_lines = Column(Float, nullable=True)
    duration = Column(Float, nullable=True)
    output = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    failed_tests_json = Column(Text, nullable=True)   # JSON array of {name, message}
    triggered_by = Column(String(36), nullable=True)   # admin user id
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
