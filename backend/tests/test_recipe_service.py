"""Tests for backend/services/recipe_suggestions.py — TheMealDB pairings."""

import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from backend.services.recipe_suggestions import (
    get_recipe_suggestions,
    _ensure_pairings_cached,
    _get_random_pairing_phrase,
    warm_ingredient_pairings,
    PAIRING_PHRASES,
)
from backend.models.ingredient_pairing import IngredientPairing
from backend.tests.conftest import make_user, make_list, make_item


class TestGetRandomPairingPhrase:
    def test_returns_valid_phrase(self):
        phrase = _get_random_pairing_phrase()
        assert phrase in PAIRING_PHRASES


class TestEnsurePairingsCached:
    def test_cache_hit_skips_fetch(self, db):
        """If fresh pairings exist, no external call is made."""
        pairing = IngredientPairing(
            base_ingredient="chicken",
            paired_ingredient="garlic",
            co_occurrence_count=5,
            fetched_at=datetime.now(timezone.utc),
        )
        db.add(pairing)
        db.commit()

        with patch("backend.services.recipe_suggestions._get_recipes_for_ingredient") as mock_fetch:
            _ensure_pairings_cached("chicken", db)
            mock_fetch.assert_not_called()

    @patch("backend.services.recipe_suggestions._get_meal_ingredients")
    @patch("backend.services.recipe_suggestions._get_recipes_for_ingredient")
    def test_cache_miss_fetches_and_stores(self, mock_recipes, mock_ingredients, db):
        mock_recipes.return_value = ["12345"]
        mock_ingredients.return_value = ["Garlic", "Onion", "Salt"]

        _ensure_pairings_cached("chicken", db)

        pairings = db.query(IngredientPairing).filter(
            IngredientPairing.base_ingredient == "chicken"
        ).all()
        paired_names = {p.paired_ingredient for p in pairings}
        assert "garlic" in paired_names
        assert "onion" in paired_names
        assert "salt" in paired_names

    @patch("backend.services.recipe_suggestions._get_recipes_for_ingredient")
    def test_no_recipes_found(self, mock_recipes, db):
        mock_recipes.return_value = []
        _ensure_pairings_cached("exotic_fruit", db)
        count = db.query(IngredientPairing).filter(
            IngredientPairing.base_ingredient == "exotic_fruit"
        ).count()
        assert count == 0


class TestGetRecipeSuggestions:
    def test_empty_items_returns_empty(self, db):
        result = get_recipe_suggestions([], db)
        assert result == []

    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_returns_suggestions_from_cached_pairings(self, mock_cache, db):
        # Pre-seed pairings
        now = datetime.now(timezone.utc)
        for paired, count in [("garlic", 5), ("onion", 3), ("salt", 2)]:
            db.add(IngredientPairing(
                base_ingredient="chicken",
                paired_ingredient=paired,
                co_occurrence_count=count,
                fetched_at=now,
            ))
        db.commit()

        result = get_recipe_suggestions(["Chicken"], db)
        assert len(result) <= 6
        names = [r["name"].lower() for r in result]
        assert "garlic" in names
        for item in result:
            assert "name" in item
            assert "reason" in item

    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_excludes_items_already_on_list(self, mock_cache, db):
        now = datetime.now(timezone.utc)
        db.add(IngredientPairing(
            base_ingredient="chicken",
            paired_ingredient="garlic",
            co_occurrence_count=5,
            fetched_at=now,
        ))
        db.commit()

        # "garlic" is already in the item_names list, so should be excluded
        result = get_recipe_suggestions(["Chicken", "Garlic"], db)
        names = [r["name"].lower() for r in result]
        assert "garlic" not in names


class TestWarmIngredientPairings:
    @patch("backend.services.recipe_suggestions.SessionLocal")
    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_warms_in_own_session(self, mock_cache, mock_session_cls):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        warm_ingredient_pairings("Chicken")
        mock_cache.assert_called_once_with("chicken", mock_session)
        mock_session.close.assert_called_once()

    @patch("backend.services.recipe_suggestions.SessionLocal")
    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_empty_name_skips(self, mock_cache, mock_session_cls):
        warm_ingredient_pairings("")
        mock_cache.assert_not_called()

    @patch("backend.services.recipe_suggestions.SessionLocal")
    @patch("backend.services.recipe_suggestions._ensure_pairings_cached")
    def test_handles_exception(self, mock_cache, mock_session_cls):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        mock_cache.side_effect = Exception("DB error")

        # Should not raise
        warm_ingredient_pairings("chicken")
        mock_session.close.assert_called_once()
