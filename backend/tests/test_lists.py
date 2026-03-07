"""Tests for backend/routers/lists.py — shopping list CRUD and item operations."""

import pytest
from backend.tests.conftest import auth_headers, make_item, make_list, make_user


class TestListGroups:
    def test_get_lists_creates_default(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/lists/groups", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["name"] == "My List"

    def test_get_lists_returns_existing(self, client, db):
        user = make_user(db)
        make_list(db, user.id, name="Groceries")
        make_list(db, user.id, name="Hardware")
        headers = auth_headers(user)
        resp = client.get("/lists/groups", headers=headers)
        assert resp.status_code == 200
        names = [l["name"] for l in resp.json()]
        assert "Groceries" in names
        assert "Hardware" in names

    def test_create_list(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/lists/groups", json={"name": "New List"}, headers=headers)
        assert resp.status_code == 201
        assert resp.json()["name"] == "New List"

    def test_rename_list(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id, name="Old Name")
        headers = auth_headers(user)
        resp = client.patch(f"/lists/groups/{lst.id}", json={"name": "New Name"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_rename_other_users_list_404(self, client, db):
        user1 = make_user(db, email="a@a.com")
        user2 = make_user(db, email="b@b.com")
        lst = make_list(db, user1.id)
        headers = auth_headers(user2)
        resp = client.patch(f"/lists/groups/{lst.id}", json={"name": "Hack"}, headers=headers)
        assert resp.status_code == 404

    def test_delete_list(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id, name="Delete Me")
        make_item(db, user.id, lst.id, name="Item")
        headers = auth_headers(user)
        resp = client.delete(f"/lists/groups/{lst.id}", headers=headers)
        assert resp.status_code == 204

    def test_delete_other_users_list_404(self, client, db):
        user1 = make_user(db, email="a@a.com")
        user2 = make_user(db, email="b@b.com")
        lst = make_list(db, user1.id)
        headers = auth_headers(user2)
        resp = client.delete(f"/lists/groups/{lst.id}", headers=headers)
        assert resp.status_code == 404


class TestListItems:
    def test_get_items_empty(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        headers = auth_headers(user)
        resp = client.get(f"/lists?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_items_excludes_deleted(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Active", checked=0)
        make_item(db, user.id, lst.id, name="Deleted", checked=2)
        headers = auth_headers(user)
        resp = client.get(f"/lists?list_id={lst.id}", headers=headers)
        names = [i["name"] for i in resp.json()]
        assert "Active" in names
        assert "Deleted" not in names

    def test_get_deleted_items(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Active", checked=0)
        make_item(db, user.id, lst.id, name="Deleted", checked=2)
        headers = auth_headers(user)
        resp = client.get(f"/lists/items/deleted?list_id={lst.id}", headers=headers)
        names = [i["name"] for i in resp.json()]
        assert "Deleted" in names
        assert "Active" not in names

    def test_add_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        headers = auth_headers(user)
        resp = client.post("/lists/items", json={
            "name": "Milk",
            "quantity": 2,
            "list_id": lst.id,
        }, headers=headers)
        assert resp.status_code == 201
        assert resp.json()["name"] == "Milk"
        assert resp.json()["quantity"] == 2

    def test_add_item_reactivates_existing(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="Eggs", checked=2, times_added=3)
        headers = auth_headers(user)
        resp = client.post("/lists/items", json={
            "name": "Eggs",
            "quantity": 1,
            "list_id": lst.id,
        }, headers=headers)
        assert resp.status_code == 201
        assert resp.json()["checked"] == 0
        assert resp.json()["times_added"] == 4

    def test_update_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="Bread")
        headers = auth_headers(user)
        resp = client.patch(f"/lists/items/{item.id}", json={
            "name": "Sourdough Bread",
            "quantity": 2,
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Sourdough Bread"

    def test_update_other_users_item_404(self, client, db):
        user1 = make_user(db, email="a@a.com")
        user2 = make_user(db, email="b@b.com")
        lst = make_list(db, user1.id)
        item = make_item(db, user1.id, lst.id)
        headers = auth_headers(user2)
        resp = client.patch(f"/lists/items/{item.id}", json={"name": "Hack"}, headers=headers)
        assert resp.status_code == 404

    def test_soft_delete_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="Remove Me")
        headers = auth_headers(user)
        resp = client.delete(f"/lists/items/{item.id}", headers=headers)
        assert resp.status_code == 204
        db.refresh(item)
        assert item.checked == 2

    def test_hard_delete_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="Gone")
        item_id = item.id
        headers = auth_headers(user)
        resp = client.delete(f"/lists/items/{item_id}/permanent", headers=headers)
        assert resp.status_code == 204
        from backend.models.list_item import ListItem
        assert db.query(ListItem).filter(ListItem.id == item_id).first() is None

    def test_reorder_items(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        i1 = make_item(db, user.id, lst.id, name="A", sort_order=0)
        i2 = make_item(db, user.id, lst.id, name="B", sort_order=1)
        headers = auth_headers(user)
        resp = client.put("/lists/items/reorder", json=[
            {"id": i1.id, "sort_order": 1},
            {"id": i2.id, "sort_order": 0},
        ], headers=headers)
        assert resp.status_code == 204
        db.refresh(i1)
        db.refresh(i2)
        assert i1.sort_order == 1
        assert i2.sort_order == 0

    def test_check_item(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        item = make_item(db, user.id, lst.id, name="Check Me")
        headers = auth_headers(user)
        resp = client.patch(f"/lists/items/{item.id}", json={"checked": 1}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["checked"] == 1


class TestSuggestions:
    def test_suggestions_endpoint_returns_list(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        # Add some history
        make_item(db, user.id, lst.id, name="Milk", checked=1, times_added=5)
        headers = auth_headers(user)
        resp = client.get(f"/lists/suggestions?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_suggestions_excludes_items_on_list(self, client, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Milk", checked=0)  # On list
        make_item(db, user.id, lst.id, name="Eggs", checked=1, times_added=5)  # Candidate
        headers = auth_headers(user)
        resp = client.get(f"/lists/suggestions?list_id={lst.id}", headers=headers)
        names = [s["name"] for s in resp.json()]
        assert "Milk" not in names
