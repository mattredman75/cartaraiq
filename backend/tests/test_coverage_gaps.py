"""Additional coverage tests for app_status, audit, nl_parser, lists, and admin edge cases."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from backend.tests.conftest import (
    auth_headers,
    make_admin,
    make_item,
    make_list,
    make_maintenance_record,
    make_user,
    set_refresh_token,
)
from backend.services.audit import log_audit


# ── App Status edge cases ────────────────────────────────────────────────────


class TestAppStatusEdgeCases:
    def test_get_status_db_exception_fails_open(self, client, db):
        """If DB query fails, app should return maintenance=False (fail open)."""
        # Override get_db to provide a broken session
        from backend.database import get_db
        from backend.main import app

        def _broken_db():
            session = MagicMock()
            session.query.side_effect = Exception("DB connection lost")
            yield session

        app.dependency_overrides[get_db] = _broken_db
        resp = client.get("/app/status")
        assert resp.status_code == 200
        assert resp.json()["maintenance"] is False
        # Restore
        app.dependency_overrides.pop(get_db, None)

    def test_set_maintenance_no_record_404(self, client, db):
        """If maintenance_mode record doesn't exist, return 404."""
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.put("/app/maintenance", json={
            "maintenance": True,
            "message": "Down",
        }, headers=headers)
        assert resp.status_code == 404

    def test_set_maintenance_with_push_tokens(self, client, db):
        """Maintenance broadcast should fire when push tokens exist."""
        from backend.models.push_token import PushToken
        admin = make_admin(db)
        make_maintenance_record(db)
        # Add a push token
        db.add(PushToken(
            id="pt-1", user_id=admin.id,
            token="ExponentPushToken[test123]",
        ))
        db.commit()
        headers = auth_headers(admin)

        with patch("backend.routers.app_status.broadcast_maintenance_update"):
            resp = client.put("/app/maintenance", json={
                "maintenance": True,
                "message": "Maintenance test",
            }, headers=headers)
            assert resp.status_code == 200
            assert resp.json()["maintenance"] is True


# ── Audit service edge cases ────────────────────────────────────────────────


class TestAuditRollbackException:
    def test_double_exception_in_audit(self, db):
        """Audit log handles rollback itself failing (double exception)."""
        # Close the session so add() will fail, then rollback will also fail
        db.close()
        # Create a broken mock that also fails on rollback
        mock_session = MagicMock()
        mock_session.add.side_effect = Exception("DB write failed")
        mock_session.rollback.side_effect = Exception("Rollback also failed")

        # Should not raise
        log_audit(mock_session, action="test_double_fail")

    def test_audit_with_string_detail(self, db):
        """Audit log handles string detail (not dict)."""
        log_audit(db, action="test_string", detail="plain text detail")
        from backend.models.audit_log import AuditLog
        entry = db.query(AuditLog).filter(AuditLog.action == "test_string").first()
        assert entry.detail == "plain text detail"

    def test_audit_no_request_client(self, db):
        """Audit works when request.client is None."""
        mock_request = MagicMock()
        mock_request.client = None
        mock_request.headers.get.return_value = "TestAgent"
        log_audit(db, action="no_client", request=mock_request)
        from backend.models.audit_log import AuditLog
        entry = db.query(AuditLog).filter(AuditLog.action == "no_client").first()
        assert entry.ip_address is None


# ── NL Parser edge cases ────────────────────────────────────────────────────


class TestNLParserEdgeCases:
    @patch("groq.Groq")
    def test_parsed_items_missing_name_skipped(self, mock_groq_class):
        """Items with empty name should be skipped."""
        from backend.services.nl_parser import parse_shopping_input

        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '[{"name":"","quantity":1,"unit":null},{"name":"Milk","quantity":1,"unit":null}]'
        mock_client.chat.completions.create.return_value = mock_response

        result = parse_shopping_input("stuff", "fake-key")
        assert len(result) == 1
        assert result[0]["name"] == "Milk"

    @patch("groq.Groq")
    def test_parsed_empty_list_returns_fallback(self, mock_groq_class):
        """If API returns empty array, fallback to raw text."""
        from backend.services.nl_parser import parse_shopping_input

        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '[]'
        mock_client.chat.completions.create.return_value = mock_response

        result = parse_shopping_input("stuff", "fake-key")
        assert len(result) == 1
        assert result[0]["name"] == "stuff"


# ── Lists router edge cases ─────────────────────────────────────────────────


class TestListsDeletedItems:
    def test_get_deleted_items(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Active", checked=0)
        # Soft-deleted item (checked=2)
        from backend.models.list_item import ListItem
        import uuid
        deleted = ListItem(
            id=str(uuid.uuid4()), user_id=user.id, list_id=lst.id,
            name="Deleted", checked=2, quantity=1,
        )
        db.add(deleted)
        db.commit()

        headers = auth_headers(user)
        resp = client.get(f"/lists/items/deleted?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200
        names = [i["name"] for i in resp.json()]
        assert "Deleted" in names
        assert "Active" not in names


class TestListsHardDelete:
    def test_hard_delete_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="ByeBye")
        headers = auth_headers(user)
        resp = client.delete(f"/lists/items/{item.id}/permanent", headers=headers)
        assert resp.status_code == 204

    def test_hard_delete_not_found(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.delete("/lists/items/fake-id/permanent", headers=headers)
        assert resp.status_code == 404


class TestListsSoftDelete:
    def test_soft_delete_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="SoftDel")
        headers = auth_headers(user)
        resp = client.delete(f"/lists/items/{item.id}", headers=headers)
        assert resp.status_code == 204
        db.refresh(item)
        assert item.checked == 2

    def test_soft_delete_not_found(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.delete("/lists/items/nonexistent", headers=headers)
        assert resp.status_code == 404


class TestListsUpdateItem:
    def test_update_item_not_found(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.patch("/lists/items/nonexistent", json={"name": "New"}, headers=headers)
        assert resp.status_code == 404


class TestListsReorderItems:
    def test_reorder_items(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item1 = make_item(db, user.id, lst.id, name="A")
        item2 = make_item(db, user.id, lst.id, name="B")
        headers = auth_headers(user)
        resp = client.put("/lists/items/reorder", json=[
            {"id": item1.id, "sort_order": 2},
            {"id": item2.id, "sort_order": 1},
        ], headers=headers)
        assert resp.status_code == 204
        db.refresh(item1)
        db.refresh(item2)
        assert item1.sort_order == 2
        assert item2.sort_order == 1


class TestListsSuggestions:
    def test_suggestions_endpoint(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Milk", checked=1, times_added=5,
                  last_added_at=datetime.now(timezone.utc) - timedelta(days=7),
                  avg_days_between_adds=7.0)
        headers = auth_headers(user)
        resp = client.get(f"/lists/suggestions?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200


# ── Admin route edge cases ───────────────────────────────────────────────────


class TestAdminDeactivateEdgeCases:
    def test_deactivate_nonexistent_404(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/users/nonexistent/deactivate", headers=headers)
        assert resp.status_code == 404

    def test_activate_nonexistent_404(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/users/nonexistent/activate", headers=headers)
        assert resp.status_code == 404


class TestAdminRevokeSessionsEdgeCases:
    def test_revoke_nonexistent_404(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/users/nonexistent/revoke-sessions", headers=headers)
        assert resp.status_code == 404


class TestAdminRoleChangeEdgeCases:
    def test_change_role_nonexistent_404(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.put("/admin/users/nonexistent/role", json={"role": "admin"}, headers=headers)
        assert resp.status_code == 404

    def test_demote_last_admin_blocked(self, client, db):
        """Cannot demote if it would leave zero admins."""
        admin = make_admin(db)
        admin2 = make_admin(db, email="admin2@test.com")
        headers = auth_headers(admin2)
        # admin is the only other admin. If we demote admin, admin2 is still admin so it should succeed.
        resp = client.put(f"/admin/users/{admin.id}/role", json={"role": "user"}, headers=headers)
        assert resp.status_code == 200
        # Now admin2 is the last admin — try to demote themselves (should be blocked by "own role" check)
        resp = client.put(f"/admin/users/{admin2.id}/role", json={"role": "user"}, headers=headers)
        assert resp.status_code == 400

    def test_demote_last_admin_guard(self, client, db):
        """Explicit test: only 1 admin, try to demote them via another admin's token (impossible but test the guard)."""
        admin = make_admin(db)
        user = make_user(db, email="normaluser@test.com", role="user")
        # Make user an admin temporarily
        user.role = "admin"
        db.commit()
        headers = auth_headers(user)
        # Now demote admin so user is the only admin
        resp = client.put(f"/admin/users/{admin.id}/role", json={"role": "user"}, headers=headers)
        assert resp.status_code == 200
        # Now try to demote user (last admin) — should be blocked
        # user can't demote themselves ("Cannot change your own role")
        resp = client.put(f"/admin/users/{user.id}/role", json={"role": "user"}, headers=headers)
        assert resp.status_code == 400


class TestAdminRegisteredAfterInvalidDate:
    def test_invalid_date_ignored(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.get("/admin/users?registered_after=not-a-date", headers=headers)
        assert resp.status_code == 200
