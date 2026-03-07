"""Tests for backend/services/ — audit, prediction, nl_parser."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from backend.services.audit import log_audit
from backend.services.prediction import score_item, _minmax, _days_since, get_frequency_candidates
from backend.services.nl_parser import parse_shopping_input
from backend.tests.conftest import make_item, make_list, make_user


class TestAuditService:
    def test_log_audit_success(self, db):
        """Audit log writes to DB without error."""
        log_audit(db, action="test_action", user_id="user-1", status="success")
        from backend.models.audit_log import AuditLog
        entry = db.query(AuditLog).filter(AuditLog.action == "test_action").first()
        assert entry is not None
        assert entry.user_id == "user-1"

    def test_log_audit_with_detail_dict(self, db):
        log_audit(db, action="test_detail", detail={"key": "value"})
        from backend.models.audit_log import AuditLog
        entry = db.query(AuditLog).filter(AuditLog.action == "test_detail").first()
        assert '"key"' in entry.detail

    def test_log_audit_with_request(self, db):
        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.1"
        mock_request.headers.get.return_value = "Mozilla/5.0 Test"
        log_audit(db, action="test_request", request=mock_request)
        from backend.models.audit_log import AuditLog
        entry = db.query(AuditLog).filter(AuditLog.action == "test_request").first()
        assert entry.ip_address == "192.168.1.1"
        assert "Mozilla" in entry.user_agent

    def test_log_audit_never_raises(self, db):
        """Audit logging should never break the main flow, even on DB error."""
        # Use a closed session to trigger an error
        db.close()
        # This should not raise
        log_audit(db, action="should_not_fail")


class TestPredictionService:
    def test_score_item_basic(self):
        item = MagicMock()
        item.times_added = 5
        item.last_added_at = datetime.now(timezone.utc) - timedelta(days=7)
        item.avg_days_between_adds = 7.0
        score = score_item(item)
        assert score == pytest.approx(5.0, rel=0.1)

    def test_score_item_overdue(self):
        item = MagicMock()
        item.times_added = 3
        item.last_added_at = datetime.now(timezone.utc) - timedelta(days=14)
        item.avg_days_between_adds = 7.0
        score = score_item(item)
        assert score > 3.0  # Overdue

    def test_score_item_no_last_added(self):
        item = MagicMock()
        item.times_added = 1
        item.last_added_at = None
        item.avg_days_between_adds = None
        score = score_item(item)
        assert score > 0

    def test_minmax_normalisation(self):
        values = [0, 5, 10]
        result = _minmax(values)
        assert result == [0.0, 0.5, 1.0]

    def test_minmax_identical_values(self):
        result = _minmax([5, 5, 5])
        assert result == [1.0, 1.0, 1.0]

    def test_get_frequency_candidates_dedupes(self, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        # Two items with same name (different case), both checked — should dedup case-insensitively
        make_item(db, user.id, lst.id, name="Milk", checked=1, times_added=3)
        make_item(db, user.id, lst.id, name="milk", checked=1, times_added=1)
        candidates = get_frequency_candidates(db, user.id)
        names_lower = [c.name.lower() for c in candidates]
        assert names_lower.count("milk") == 1

    def test_get_frequency_candidates_excludes_unchecked(self, db):
        user = make_user(db)
        lst = make_list(db, user.id)
        make_item(db, user.id, lst.id, name="On List", checked=0, times_added=5)
        make_item(db, user.id, lst.id, name="Checked Off", checked=1, times_added=5)
        candidates = get_frequency_candidates(db, user.id)
        names = [c.name for c in candidates]
        assert "On List" not in names
        assert "Checked Off" in names


class TestNLParser:
    def test_fallback_when_no_api_key(self):
        result = parse_shopping_input("2 avocados and a lime", "")
        assert len(result) == 1
        assert result[0]["name"] == "2 avocados and a lime"
        assert result[0]["quantity"] == 1

    @patch("groq.Groq")
    def test_parses_successfully(self, mock_groq_class):
        # Mock Groq response
        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '[{"name":"Avocados","quantity":2,"unit":null},{"name":"Lime","quantity":1,"unit":null}]'
        mock_client.chat.completions.create.return_value = mock_response

        result = parse_shopping_input("2 avocados and a lime", "fake-key")
        assert len(result) == 2
        assert result[0]["name"] == "Avocados"
        assert result[0]["quantity"] == 2

    @patch("groq.Groq")
    def test_fallback_on_api_error(self, mock_groq_class):
        mock_groq_class.side_effect = Exception("API error")
        result = parse_shopping_input("some items", "fake-key")
        assert len(result) == 1
        assert result[0]["name"] == "some items"

    @patch("groq.Groq")
    def test_fallback_on_invalid_json(self, mock_groq_class):
        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "not json"
        mock_client.chat.completions.create.return_value = mock_response

        result = parse_shopping_input("bananas", "fake-key")
        assert len(result) == 1
        assert result[0]["name"] == "bananas"
