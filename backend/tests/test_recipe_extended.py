"""Additional coverage tests for recipe_suggestions.py — HTTP helpers, edge cases."""

import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from backend.services.recipe_suggestions import (
    _fetch_json,
    _get_recipes_for_ingredient,
    _get_meal_ingredients,
    get_recipe_suggestions,
    warm_ingredient_pairings,
    _ensure_pairings_cached,
)
from backend.models.ingredient_pairing import IngredientPairing


class TestFetchJson:
    @patch("backend.services.recipe_suggestions.urllib.request.urlopen")
    def test_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"meals": [{"idMeal": "123"}]}'
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        result = _fetch_json("https://example.com/api")
        assert result == {"meals": [{"idMeal": "123"}]}

    @patch("backend.services.recipe_suggestions.urllib.request.urlopen")
    def test_failure_returns_none(self, mock_urlopen):
        mock_urlopen.side_effect = Exception("Network error")
        result = _fetch_json("https://example.com/api")
        assert result is None


class TestGetRecipesForIngredient:
    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_returns_meal_ids(self, mock_fetch):
        mock_fetch.return_value = {
            "meals": [
                {"idMeal": "1", "strMeal": "Chicken Soup"},
                {"idMeal": "2", "strMeal": "Chicken Pasta"},
            ]
        }
        result = _get_recipes_for_ingredient("chicken")
        assert result == ["1", "2"]

    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_returns_empty_on_none(self, mock_fetch):
        mock_fetch.return_value = None
        result = _get_recipes_for_ingredient("xyz")
        assert result == []

    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_returns_empty_on_no_meals(self, mock_fetch):
        mock_fetch.return_value = {"meals": None}
        result = _get_recipes_for_ingredient("xyz")
        assert result == []


class TestGetMealIngredients:
    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_extracts_ingredients(self, mock_fetch):
        meal = {"strIngredient1": "Chicken", "strIngredient2": "Garlic",
                "strIngredient3": "", "strIngredient4": None}
        # Fill remaining slots
        for i in range(5, 21):
            meal[f"strIngredient{i}"] = ""
        mock_fetch.return_value = {"meals": [meal]}

        result = _get_meal_ingredients("123")
        assert result == ["Chicken", "Garlic"]

    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_no_meals_returns_empty(self, mock_fetch):
        mock_fetch.return_value = None
        result = _get_meal_ingredients("999")
        assert result == []

    @patch("backend.services.recipe_suggestions._fetch_json")
    def test_empty_meals_list(self, mock_fetch):
        mock_fetch.return_value = {"meals": None}
        result = _get_meal_ingredients("999")
        assert result == []


class TestGetRecipeSuggestionsEdgeCases:
    def test_whitespace_only_names(self, db):
        result = get_recipe_suggestions(["  ", ""], db)
        assert result == []

    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_no_rows_returns_empty(self, mock_cache, db):
        result = get_recipe_suggestions(["Chicken"], db)
        assert result == []

    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_multiple_triggers_in_reason(self, mock_cache, db):
        """When an ingredient is paired with multiple items, reason should list them."""
        now = datetime.now(timezone.utc)
        # Garlic pairs with both chicken and beef
        db.add(IngredientPairing(base_ingredient="chicken", paired_ingredient="garlic",
                                 co_occurrence_count=5, fetched_at=now))
        db.add(IngredientPairing(base_ingredient="beef", paired_ingredient="garlic",
                                 co_occurrence_count=3, fetched_at=now))
        db.commit()

        result = get_recipe_suggestions(["Chicken", "Beef"], db)
        # Should find garlic with both triggers
        garlic = next((r for r in result if r["name"].lower() == "garlic"), None)
        assert garlic is not None
        # Reason should mention both triggers
        assert "Chicken" in garlic["reason"] or "Beef" in garlic["reason"]

    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_three_triggers(self, mock_cache, db):
        """Test the 3-trigger reason format."""
        now = datetime.now(timezone.utc)
        for base in ["chicken", "beef", "pork"]:
            db.add(IngredientPairing(base_ingredient=base, paired_ingredient="salt",
                                     co_occurrence_count=3, fetched_at=now))
        db.commit()

        result = get_recipe_suggestions(["Chicken", "Beef", "Pork"], db)
        salt = next((r for r in result if r["name"].lower() == "salt"), None)
        assert salt is not None
        # Should contain "and" for 3-item listing
        assert "and" in salt["reason"]


class TestEnsurePairingsCachedEdgeCases:
    @patch("backend.services.recipe_suggestions._get_meal_ingredients")
    @patch("backend.services.recipe_suggestions._get_recipes_for_ingredient")
    def test_no_paired_counts_skips_store(self, mock_recipes, mock_ingredients, db):
        """When TheMealDB returns recipes but ingredients only match the base."""
        mock_recipes.return_value = ["123"]
        mock_ingredients.return_value = ["chicken"]  # Same as base ingredient

        _ensure_pairings_cached("chicken", db)
        count = db.query(IngredientPairing).filter(
            IngredientPairing.base_ingredient == "chicken"
        ).count()
        assert count == 0
