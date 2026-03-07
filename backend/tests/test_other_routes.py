"""Tests for backend/routers/app_status.py, products.py, push.py, my_data.py."""

import pytest
from backend.tests.conftest import (
    auth_headers,
    make_admin,
    make_item,
    make_list,
    make_maintenance_record,
    make_user,
)


# ── App Status ───────────────────────────────────────────────────────────────

class TestAppStatus:
    def test_get_status_no_record_returns_operational(self, client):
        resp = client.get("/app/status")
        assert resp.status_code == 200
        assert resp.json()["maintenance"] is False

    def test_get_status_returns_current_state(self, client, db):
        make_maintenance_record(db, value=True, message="Down for updates")
        resp = client.get("/app/status")
        assert resp.status_code == 200
        assert resp.json()["maintenance"] is True
        assert resp.json()["message"] == "Down for updates"

    def test_set_maintenance_requires_admin(self, client, db):
        make_maintenance_record(db)
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.put("/app/maintenance", json={"maintenance": True}, headers=headers)
        assert resp.status_code == 403

    def test_set_maintenance_as_admin(self, client, db):
        make_maintenance_record(db)
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.put("/app/maintenance", json={
            "maintenance": True,
            "message": "Scheduled maintenance",
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["maintenance"] is True


class TestAppLifecycle:
    def test_report_foreground(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/app/lifecycle", json={"state": "foreground"}, headers=headers)
        assert resp.status_code == 204

    def test_report_background(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/app/lifecycle", json={"state": "background"}, headers=headers)
        assert resp.status_code == 204

    def test_report_invalid_state(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/app/lifecycle", json={"state": "invalid"}, headers=headers)
        assert resp.status_code == 204  # Silently ignored

    def test_requires_auth(self, client):
        resp = client.post("/app/lifecycle", json={"state": "foreground"})
        assert resp.status_code == 401


# ── Products ─────────────────────────────────────────────────────────────────

class TestProducts:
    def test_search_no_query_returns_default(self, client):
        resp = client.get("/products/search")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 12
        assert all("name" in p for p in data)

    def test_search_with_query(self, client):
        resp = client.get("/products/search?q=milk")
        assert resp.status_code == 200
        names = [p["name"].lower() for p in resp.json()]
        assert any("milk" in n for n in names)

    def test_search_no_results(self, client):
        resp = client.get("/products/search?q=xyznonexistent")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_product_by_id(self, client):
        resp = client.get("/products/1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "1"

    def test_get_product_not_found(self, client):
        resp = client.get("/products/9999")
        assert resp.status_code == 404


# ── Push Tokens ──────────────────────────────────────────────────────────────

class TestPushTokens:
    def test_register_token(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/push/register", json={
            "token": "ExponentPushToken[abc123]",
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_register_invalid_format(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/push/register", json={"token": "not-expo-token"}, headers=headers)
        assert resp.status_code == 400

    def test_register_same_token_idempotent(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        token = "ExponentPushToken[same123]"
        client.post("/push/register", json={"token": token}, headers=headers)
        resp = client.post("/push/register", json={"token": token}, headers=headers)
        assert resp.status_code == 200

    def test_register_reassigns_token(self, client, db):
        user1 = make_user(db, email="u1@test.com")
        user2 = make_user(db, email="u2@test.com")
        token = "ExponentPushToken[shared123]"
        client.post("/push/register", json={"token": token}, headers=auth_headers(user1))
        client.post("/push/register", json={"token": token}, headers=auth_headers(user2))
        from backend.models.push_token import PushToken
        pt = db.query(PushToken).filter(PushToken.token == token).first()
        assert pt.user_id == user2.id

    def test_unregister_token(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        token = "ExponentPushToken[unreg123]"
        client.post("/push/register", json={"token": token}, headers=headers)
        resp = client.request("DELETE", "/push/unregister", json={"token": token}, headers=headers)
        assert resp.status_code == 200

    def test_unregister_nonexistent_idempotent(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.request("DELETE", "/push/unregister", json={"token": "ExponentPushToken[nope]"}, headers=headers)
        assert resp.status_code == 200


# ── My Data (Export/Import) ──────────────────────────────────────────────────

class TestMyData:
    def test_export_data(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id, "Groceries")
        make_item(db, user.id, lst.id, name="Milk", checked=0)
        make_item(db, user.id, lst.id, name="Done Item", checked=1)
        headers = auth_headers(user)
        resp = client.get("/my/data", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["exporter"] == user.id
        assert len(data["lists"]) == 1
        assert data["lists"][0]["listName"] == "Groceries"
        assert len(data["lists"][0]["outstanding"]) == 1
        assert len(data["lists"][0]["completed"]) == 1

    def test_import_replaces_data(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id, "Old List")
        make_item(db, user.id, lst.id, name="Old Item")
        headers = auth_headers(user)
        resp = client.post("/my/data", json={
            "lists": [
                {
                    "listName": "Imported List",
                    "outstanding": [{"name": "New Item", "quantity": 1}],
                    "completed": [],
                }
            ],
            "version": 1,
        }, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["lists"]) == 1
        assert data["lists"][0]["listName"] == "Imported List"

    def test_export_empty(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/my/data", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["lists"] == []


# ── Health Endpoint ──────────────────────────────────────────────────────────

class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
