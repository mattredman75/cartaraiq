"""Additional tests for lists routes — bulk add, parse-text, recipe-suggestions."""

import pytest
from unittest.mock import patch, MagicMock

from backend.tests.conftest import auth_headers, make_user, make_list, make_item


class TestBulkAddItems:
    @patch("backend.routers.lists.parse_shopping_input")
    def test_bulk_add_parses_and_adds(self, mock_parse, client, db):
        mock_parse.return_value = [
            {"name": "Eggs", "quantity": 12, "unit": None},
            {"name": "Bread", "quantity": 1, "unit": "loaf"},
        ]
        user = make_user(db)
        lst = make_list(db, user.id)
        headers = auth_headers(user)
        resp = client.post("/lists/items/bulk", json={
            "text": "12 eggs and a loaf of bread",
            "list_id": lst.id,
        }, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert len(data) == 2
        names = {item["name"] for item in data}
        assert "Eggs" in names
        assert "Bread" in names

    @patch("backend.routers.lists.parse_shopping_input")
    def test_bulk_add_uses_default_list(self, mock_parse, client, db):
        mock_parse.return_value = [{"name": "Milk", "quantity": 1, "unit": None}]
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/lists/items/bulk", json={
            "text": "milk",
        }, headers=headers)
        assert resp.status_code == 201


class TestParseText:
    @patch("backend.routers.lists.parse_shopping_input")
    def test_parse_text_returns_parsed_items(self, mock_parse, client, db):
        mock_parse.return_value = [
            {"name": "Avocados", "quantity": 2, "unit": None},
            {"name": "Lime", "quantity": 1, "unit": None},
        ]
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/lists/items/parse-text", json={
            "text": "2 avocados and a lime",
        }, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "Avocados"


class TestRecipeSuggestionsEndpoint:
    @patch("backend.routers.lists.get_recipe_suggestions")
    def test_recipe_suggestions_with_items(self, mock_recipes, client, db):
        mock_recipes.return_value = [
            {"name": "Garlic", "reason": "Goes well with Chicken"},
        ]
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Chicken", checked=0)
        headers = auth_headers(user)
        resp = client.get(f"/lists/recipe-suggestions?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Garlic"

    @patch("backend.routers.lists.get_recipe_suggestions")
    def test_recipe_suggestions_empty_list(self, mock_recipes, client, db):
        mock_recipes.return_value = []
        user = make_user(db)
        lst = make_list(db, user.id)
        headers = auth_headers(user)
        resp = client.get(f"/lists/recipe-suggestions?list_id={lst.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @patch("backend.routers.lists.get_recipe_suggestions")
    def test_recipe_suggestions_uses_default_list(self, mock_recipes, client, db):
        mock_recipes.return_value = []
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/lists/recipe-suggestions", headers=headers)
        assert resp.status_code == 200


class TestDebugGroq:
    def test_debug_groq_endpoint(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/lists/debug/groq", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "groq_key_set" in data
        assert "groq_package_installed" in data
