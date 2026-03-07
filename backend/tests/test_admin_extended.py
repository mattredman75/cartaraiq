"""Additional tests for admin routes — sorting, filtering, force-reset, audit search."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.models.audit_log import AuditLog
from backend.tests.conftest import (
    auth_headers,
    make_admin,
    make_audit_log,
    make_item,
    make_list,
    make_user,
    set_refresh_token,
)


class TestAdminUserListSorting:
    def test_sort_by_name_asc(self, client, db):
        admin = make_admin(db)
        make_user(db, email="zara@test.com", name="Zara")
        make_user(db, email="alice@test.com", name="Alice")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?sort_by=name&sort_dir=asc", headers=headers)
        assert resp.status_code == 200
        names = [u["name"] for u in resp.json()["users"]]
        assert names == sorted(names, key=str.lower)

    def test_sort_by_email_desc(self, client, db):
        admin = make_admin(db)
        make_user(db, email="alpha@test.com")
        make_user(db, email="omega@test.com")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?sort_by=email&sort_dir=desc", headers=headers)
        assert resp.status_code == 200

    def test_sort_by_list_count(self, client, db):
        admin = make_admin(db)
        user1 = make_user(db, email="many@test.com")
        for i in range(3):
            make_list(db, user1.id, f"List {i}")
        user2 = make_user(db, email="few@test.com")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?sort_by=list_count&sort_dir=desc", headers=headers)
        assert resp.status_code == 200

    def test_sort_by_item_count(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="items@test.com")
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="A")
        make_item(db, user.id, lst.id, name="B")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?sort_by=item_count&sort_dir=desc", headers=headers)
        assert resp.status_code == 200

    def test_sort_by_last_activity(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="active@test.com")
        db.add(AuditLog(action="login", user_id=user.id, status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/users?sort_by=last_activity&sort_dir=desc", headers=headers)
        assert resp.status_code == 200


class TestAdminUserListFilters:
    def test_filter_by_auth_provider_email(self, client, db):
        admin = make_admin(db)
        make_user(db, email="email@test.com", auth_provider=None)
        make_user(db, email="google@test.com", auth_provider="google", auth_provider_id="g123")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?auth_provider=email", headers=headers)
        users = resp.json()["users"]
        for u in users:
            assert u.get("auth_provider") is None or u.get("auth_provider") == ""

    def test_filter_by_auth_provider_google(self, client, db):
        admin = make_admin(db)
        make_user(db, email="google@test.com", auth_provider="google", auth_provider_id="g123")
        make_user(db, email="email@test.com", auth_provider=None)
        headers = auth_headers(admin)
        resp = client.get("/admin/users?auth_provider=google", headers=headers)
        users = resp.json()["users"]
        assert all(u["auth_provider"] == "google" for u in users)

    def test_filter_by_registered_after(self, client, db):
        admin = make_admin(db)
        make_user(db, email="new@test.com")
        headers = auth_headers(admin)
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        resp = client.get(f"/admin/users?registered_after={yesterday}", headers=headers)
        assert resp.status_code == 200

    def test_filter_by_active_minutes(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="recently@test.com")
        db.add(AuditLog(action="login", user_id=user.id, status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/users?active_minutes=60", headers=headers)
        assert resp.status_code == 200

    def test_active_minutes_no_activity(self, client, db):
        admin = make_admin(db)
        make_user(db, email="idle@test.com")
        headers = auth_headers(admin)
        # No audit logs for the user, so should find nobody (except possibly admin)
        resp = client.get("/admin/users?active_minutes=1", headers=headers)
        assert resp.status_code == 200


class TestAdminForcePasswordReset:
    @patch("backend.routers.admin._send_forced_reset_email")
    def test_force_reset_success(self, mock_email, client, db):
        mock_email.return_value = None
        admin = make_admin(db)
        user = make_user(db, email="reset@test.com")
        headers = auth_headers(admin)
        resp = client.post(f"/admin/users/{user.id}/force-password-reset", headers=headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.hashed_password is None
        assert user.reset_token is not None
        assert user.refresh_token is None

    @patch("backend.routers.admin._send_forced_reset_email")
    def test_force_reset_email_failure(self, mock_email, client, db):
        mock_email.side_effect = Exception("SMTP error")
        admin = make_admin(db)
        user = make_user(db, email="fail@test.com")
        headers = auth_headers(admin)
        resp = client.post(f"/admin/users/{user.id}/force-password-reset", headers=headers)
        assert resp.status_code == 200
        assert "email delivery failed" in resp.json()["message"]

    def test_force_reset_nonexistent_user(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/users/nonexistent-id/force-password-reset", headers=headers)
        assert resp.status_code == 404


class TestAdminAuditLogsExtended:
    def test_filter_by_user_id(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="audituser@test.com")
        db.add(AuditLog(action="login", user_id=user.id, status="success"))
        db.add(AuditLog(action="login", user_id=admin.id, status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get(f"/admin/audit-logs?user_id={user.id}", headers=headers)
        logs = resp.json()["logs"]
        assert all(l["user_id"] == user.id for l in logs)

    def test_filter_by_ip(self, client, db):
        admin = make_admin(db)
        db.add(AuditLog(action="login", ip_address="1.2.3.4", status="success"))
        db.add(AuditLog(action="login", ip_address="5.6.7.8", status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/audit-logs?ip=1.2.3.4", headers=headers)
        logs = resp.json()["logs"]
        assert all(l["ip_address"] == "1.2.3.4" for l in logs)

    def test_search_by_email(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="searchable@test.com")
        db.add(AuditLog(action="login", user_id=user.id, status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/audit-logs?search=searchable", headers=headers)
        assert resp.status_code == 200

    def test_search_no_match_returns_empty(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.get("/admin/audit-logs?search=nonexistent_email", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_filter_by_since_hours(self, client, db):
        admin = make_admin(db)
        db.add(AuditLog(action="login", status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/audit-logs?since_hours=1", headers=headers)
        assert resp.status_code == 200

    def test_comma_separated_actions(self, client, db):
        admin = make_admin(db)
        db.add(AuditLog(action="login", status="success"))
        db.add(AuditLog(action="register", status="success"))
        db.add(AuditLog(action="logout", status="success"))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/audit-logs?action=login,register", headers=headers)
        actions = {l["action"] for l in resp.json()["logs"]}
        assert actions <= {"login", "register"}
        assert "logout" not in actions


class TestAdminActiveMinutesFilter:
    """Tests for the active_minutes correlated EXISTS subquery in /admin/users."""

    def test_active_minutes_includes_recently_active_user(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="active@test.com")
        # Recent audit log entry — should be included with active_minutes=60
        make_audit_log(db, user.id, action="login")
        headers = auth_headers(admin)
        resp = client.get("/admin/users?active_minutes=60", headers=headers)
        assert resp.status_code == 200
        user_ids = [u["id"] for u in resp.json()["users"]]
        assert user.id in user_ids

    def test_active_minutes_excludes_inactive_user(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="stale@test.com")
        # Audit log entry from well outside the window
        old_time = datetime.now(timezone.utc) - timedelta(hours=5)
        make_audit_log(db, user.id, action="login", created_at=old_time)
        headers = auth_headers(admin)
        resp = client.get("/admin/users?active_minutes=60", headers=headers)
        assert resp.status_code == 200
        user_ids = [u["id"] for u in resp.json()["users"]]
        assert user.id not in user_ids

    def test_active_minutes_zero_returns_all_users(self, client, db):
        admin = make_admin(db)
        user = make_user(db, email="any@test.com")
        headers = auth_headers(admin)
        # Omitting active_minutes entirely should return all users
        resp = client.get("/admin/users", headers=headers)
        assert resp.status_code == 200
        user_ids = [u["id"] for u in resp.json()["users"]]
        assert user.id in user_ids
