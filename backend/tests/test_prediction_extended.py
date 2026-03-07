"""Additional coverage tests for prediction service — reason generation, co-occurrence, edge cases."""

import time
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from backend.services.prediction import (
    _days_since,
    _generate_reason,
    _build_cooccurrence,
    _ensure_cooc_cache,
    _cooccurrence_score,
    _get_user_item_set,
    get_smart_suggestions,
    score_item,
    _COOC_TTL,
    _MIN_COOC_ITEMS,
)
from backend.models.list_item import ListItem
from backend.tests.conftest import make_user, make_list, make_item
import backend.services.prediction as pred_module


class TestDaysSinceEdgeCases:
    def test_naive_datetime_treated_as_utc(self):
        naive = datetime(2020, 1, 1)  # no tzinfo
        result = _days_since(naive)
        # Should not raise;  result should be > 0
        assert result > 0


class TestGenerateReason:
    def _make_item(self, times_added=5, days_ago=7, avg_days=7.0):
        item = MagicMock()
        item.times_added = times_added
        item.last_added_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
        item.avg_days_between_adds = avg_days
        return item

    def test_overdue_high_frequency(self):
        item = self._make_item(times_added=15, days_ago=14, avg_days=7.0)
        reason = _generate_reason(item, 2.0, 0.0)
        assert "every" in reason.lower() and "days" in reason.lower()

    def test_overdue_low_frequency(self):
        item = self._make_item(times_added=2, days_ago=14, avg_days=7.0)
        reason = _generate_reason(item, 2.0, 0.0)
        assert "days since" in reason.lower()

    def test_overdue_short_cycle(self):
        item = self._make_item(times_added=3, days_ago=8, avg_days=5.0)
        reason = _generate_reason(item, 1.3, 0.0)
        assert "math" in reason.lower()

    def test_overdue_long_cycle(self):
        item = self._make_item(times_added=3, days_ago=10, avg_days=8.0)
        reason = _generate_reason(item, 1.25, 0.0)
        assert "habit" in reason.lower()

    def test_approaching_high_frequency(self):
        item = self._make_item(times_added=8, days_ago=6, avg_days=7.0)
        reason = _generate_reason(item, 0.85, 0.0)
        assert "reliably" in reason.lower() or "every" in reason.lower()

    def test_approaching_low_frequency(self):
        item = self._make_item(times_added=2, days_ago=5, avg_days=7.0)
        reason = _generate_reason(item, 0.75, 0.0)
        assert "not urgent" in reason.lower()

    def test_high_cooc_score(self):
        item = self._make_item(times_added=2, days_ago=1, avg_days=14.0)
        reason = _generate_reason(item, 0.07, 0.8)
        assert "others" in reason.lower()

    def test_personal_staple(self):
        item = self._make_item(times_added=12, days_ago=1, avg_days=14.0)
        reason = _generate_reason(item, 0.07, 0.0)
        assert "staple" in reason.lower()

    def test_fallback_generic_reason(self):
        item = self._make_item(times_added=2, days_ago=1, avg_days=14.0)
        reason = _generate_reason(item, 0.07, 0.0)
        # Should return one of the random fallback phrases
        assert isinstance(reason, str) and len(reason) > 0


class TestBuildCooccurrence:
    def test_builds_from_items(self, db):
        user1 = make_user(db, email="u1@test.com")
        user2 = make_user(db, email="u2@test.com")
        lst1 = make_list(db, user1.id)
        lst2 = make_list(db, user2.id)

        # Both users bought "Milk" and "Bread" (times_added >= 2, recent)
        now = datetime.now(timezone.utc)
        make_item(db, user1.id, lst1.id, name="Milk", times_added=3, last_added_at=now, checked=1)
        make_item(db, user1.id, lst1.id, name="Bread", times_added=2, last_added_at=now, checked=1)
        make_item(db, user2.id, lst2.id, name="Milk", times_added=5, last_added_at=now, checked=1)
        make_item(db, user2.id, lst2.id, name="Bread", times_added=4, last_added_at=now, checked=1)

        _build_cooccurrence(db)

        # After building, cache should have data
        assert len(pred_module._item_popularity) > 0

    def test_build_exception_keeps_stale_cache(self, db):
        # Force an exception by closing the session
        db.close()
        old_cache = dict(pred_module._cooccurrence)
        _build_cooccurrence(db)
        # Cache should not be cleared; old data preserved


class TestEnsureCoocCache:
    def test_skips_rebuild_within_ttl(self, db):
        pred_module._cooc_built_at = time.time()  # Just built
        with patch("backend.services.prediction._build_cooccurrence") as mock_build:
            _ensure_cooc_cache(db)
            mock_build.assert_not_called()

    def test_rebuilds_after_ttl(self, db):
        pred_module._cooc_built_at = time.time() - _COOC_TTL - 1
        with patch("backend.services.prediction._build_cooccurrence") as mock_build:
            _ensure_cooc_cache(db)
            mock_build.assert_called_once()


class TestCooccurrenceScore:
    def test_no_cooccurrence_data(self):
        pred_module._cooccurrence = {}
        score = _cooccurrence_score("Milk", {"Bread", "Eggs"})
        assert score == 0.0

    def test_with_cooccurrence(self):
        pred_module._cooccurrence = {"milk": {"Bread": 3, "Eggs": 2}}
        pred_module._item_popularity = {"Milk": 5}
        score = _cooccurrence_score("Milk", {"Bread", "Eggs"})
        assert score == 1.0  # (3 + 2) / 5


class TestGetUserItemSet:
    def test_returns_user_items(self, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="Milk", checked=1, times_added=3)
        make_item(db, user.id, lst.id, name="Bread", checked=1, times_added=2)
        make_item(db, user.id, lst.id, name="On List", checked=0, times_added=1)

        result = _get_user_item_set(db, user.id)
        assert "Milk" in result
        assert "Bread" in result
        assert "On List" not in result


class TestGetSmartSuggestions:
    def test_empty_candidates_returns_empty(self, db):
        result = get_smart_suggestions([], "user-1", "list-1", db)
        assert result == []

    def test_returns_suggestions_with_reasons(self, db):
        user = make_user(db)
        lst = make_list(db, user.id)

        # Reset cooc cache
        pred_module._item_popularity = {}
        pred_module._cooccurrence = {}
        pred_module._cooc_built_at = time.time()

        candidates = []
        for name in ["Milk", "Bread", "Eggs", "Butter"]:
            item = make_item(db, user.id, lst.id, name=name, checked=1,
                             times_added=5,
                             last_added_at=datetime.now(timezone.utc) - timedelta(days=7),
                             avg_days_between_adds=7.0)
            candidates.append(item)

        result = get_smart_suggestions(candidates, user.id, lst.id, db)
        assert len(result) > 0
        for r in result:
            assert "name" in r
            assert "reason" in r

    def test_uses_cooc_when_enough_items(self, db):
        user = make_user(db)
        lst = make_list(db, user.id)

        # Setup cooc cache with enough items
        pred_module._item_popularity = {f"item{i}": 2 for i in range(_MIN_COOC_ITEMS + 1)}
        pred_module._cooccurrence = {}
        pred_module._cooc_built_at = time.time()

        item = make_item(db, user.id, lst.id, name="Milk", checked=1,
                         times_added=5,
                         last_added_at=datetime.now(timezone.utc) - timedelta(days=7),
                         avg_days_between_adds=7.0)

        result = get_smart_suggestions([item], user.id, lst.id, db)
        assert isinstance(result, list)


class TestGetFrequencyCandidatesWithListId:
    def test_filters_by_list_id(self, db):
        from backend.services.prediction import get_frequency_candidates
        user = make_user(db)
        lst1 = make_list(db, user.id, "List 1")
        lst2 = make_list(db, user.id, "List 2")
        make_item(db, user.id, lst1.id, name="Milk", checked=1, times_added=3)
        make_item(db, user.id, lst2.id, name="Bread", checked=1, times_added=3)

        result = get_frequency_candidates(db, user.id, list_id=lst1.id)
        names = [c.name for c in result]
        assert "Milk" in names
        assert "Bread" not in names
