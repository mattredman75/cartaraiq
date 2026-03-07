"""
Shared test fixtures for all backend tests.

Uses an in-memory SQLite database so tests run fast and don't touch
the real MySQL database. Each test function gets a fresh DB session
that is rolled back after the test.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Generator, Optional

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.auth import create_access_token, hash_password, generate_refresh_token
from backend.database import Base, get_db
from backend.main import app
from backend.models.app_admin import AppAdmin
from backend.models.audit_log import AuditLog
from backend.models.list_item import ListItem
from backend.models.push_token import PushToken
from backend.models.shopping_list import ShoppingList
from backend.models.user import User

# Disable rate limiting for tests
from backend.routers.auth import limiter as auth_limiter
auth_limiter.enabled = False


# ── In-memory SQLite engine ──────────────────────────────────────────────────

SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Enable foreign keys in SQLite
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Provide a DB session for direct model manipulation in tests."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> TestClient:
    """FastAPI TestClient with the DB session overridden."""
    def _override_get_db():
        try:
            yield db
        finally:
            pass  # We manage the session in the db fixture

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Helper factories ─────────────────────────────────────────────────────────

def make_user(
    db: Session,
    *,
    email: str = "test@example.com",
    name: str = "Test User",
    password: str = "password123",
    role: str = "user",
    auth_provider: Optional[str] = None,
    auth_provider_id: Optional[str] = None,
    is_active: bool = True,
    biometric_enabled: bool = False,
    biometric_pin_hash: Optional[str] = None,
    biometric_type: Optional[str] = None,
) -> User:
    """Create and persist a user in the test DB."""
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        name=name,
        hashed_password=hash_password(password) if password else None,
        role=role,
        auth_provider=auth_provider,
        auth_provider_id=auth_provider_id,
        is_active=is_active,
        biometric_enabled=biometric_enabled,
        biometric_pin_hash=biometric_pin_hash,
        biometric_type=biometric_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_admin(db: Session, **kwargs) -> User:
    """Create and persist an admin user."""
    kwargs.setdefault("email", "admin@example.com")
    kwargs.setdefault("name", "Admin User")
    kwargs.setdefault("role", "admin")
    return make_user(db, **kwargs)


def make_list(
    db: Session,
    user_id: str,
    name: str = "My List",
) -> ShoppingList:
    """Create and persist a shopping list."""
    lst = ShoppingList(id=str(uuid.uuid4()), user_id=user_id, name=name)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return lst


def make_item(
    db: Session,
    user_id: str,
    list_id: str,
    *,
    name: str = "Test Item",
    quantity: int = 1,
    unit: Optional[str] = None,
    checked: int = 0,
    sort_order: Optional[int] = None,
    times_added: int = 1,
    last_added_at: Optional[datetime] = None,
    avg_days_between_adds: Optional[float] = None,
) -> ListItem:
    """Create and persist a list item."""
    item = ListItem(
        id=str(uuid.uuid4()),
        user_id=user_id,
        list_id=list_id,
        name=name,
        quantity=quantity,
        unit=unit,
        checked=checked,
        sort_order=sort_order,
        times_added=times_added,
        last_added_at=last_added_at or datetime.now(timezone.utc),
        avg_days_between_adds=avg_days_between_adds,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def make_push_token(
    db: Session,
    user_id: str,
    *,
    token: Optional[str] = None,
) -> PushToken:
    """Create and persist a push token in the test DB."""
    if token is None:
        token = f"ExponentPushToken[test{uuid.uuid4().hex[:8]}]"
    pt = PushToken(id=str(uuid.uuid4()), user_id=user_id, token=token)
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


def make_audit_log(
    db: Session,
    user_id: str,
    *,
    action: str = "login",
    status: str = "success",
    created_at: Optional[datetime] = None,
) -> AuditLog:
    """Create and persist an audit log entry in the test DB."""
    entry = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        status=status,
        created_at=created_at or datetime.now(),  # naive, matching admin.py cutoff
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def make_maintenance_record(db: Session, *, value: bool = False, message: str = "") -> AppAdmin:
    """Create the maintenance_mode app_admin record."""
    record = AppAdmin(id=str(uuid.uuid4()), key="maintenance_mode", value=value, message=message)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def auth_headers(user: User) -> dict:
    """Generate Authorization header dict for a user."""
    token = create_access_token({"sub": user.id, "role": user.role or "user"})
    return {"Authorization": f"Bearer {token}"}


def set_refresh_token(db: Session, user: User) -> str:
    """Set a valid refresh token on a user and return it."""
    rt = generate_refresh_token()
    user.refresh_token = rt
    user.refresh_token_expiry = datetime.now(timezone.utc) + timedelta(days=365)
    db.commit()
    return rt
