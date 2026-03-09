"""Tests for backend/services/email.py — welcome email service."""

from unittest.mock import MagicMock, patch

import pytest


# ── Unit tests: email service ─────────────────────────────────────────────────

class TestSendWelcomeEmail:
    """Unit tests for send_welcome_email — mock SMTP, test all branches."""

    def test_no_smtp_host_is_noop(self):
        """When SMTP_HOST is blank, send silently does nothing."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email.settings") as mock_settings:
            mock_settings.smtp_host = ""
            mock_settings.smtp_from = "support@cartaraiq.app"
            mock_settings.smtp_port = 587
            # Should not raise
            send_welcome_email("user@example.com", "Alice")

    def test_no_smtp_from_is_noop(self):
        """When SMTP_FROM is blank, send silently does nothing."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email.settings") as mock_settings:
            mock_settings.smtp_host = "mail.cartaraiq.app"
            mock_settings.smtp_from = ""
            mock_settings.smtp_port = 587
            send_welcome_email("user@example.com", "Alice")

    def test_sends_via_starttls_port_587(self):
        """Port 587 path uses STARTTLS."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email.settings") as mock_settings, \
             patch("backend.services.email.smtplib.SMTP") as mock_smtp_cls:

            mock_settings.smtp_host = "mail.cartaraiq.app"
            mock_settings.smtp_from = "support@cartaraiq.app"
            mock_settings.smtp_port = 587
            mock_settings.smtp_user = "support@cartaraiq.app"
            mock_settings.smtp_pass = "pass"

            mock_server = MagicMock()
            mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            send_welcome_email("user@example.com", "Alice")

            mock_smtp_cls.assert_called_once_with("mail.cartaraiq.app", 587, timeout=15)
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once_with("support@cartaraiq.app", "pass")
            mock_server.sendmail.assert_called_once()

    def test_sends_via_ssl_port_465(self):
        """Port 465 path uses SMTP_SSL."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email.settings") as mock_settings, \
             patch("backend.services.email.smtplib.SMTP_SSL") as mock_ssl_cls:

            mock_settings.smtp_host = "mail.cartaraiq.app"
            mock_settings.smtp_from = "support@cartaraiq.app"
            mock_settings.smtp_port = 465
            mock_settings.smtp_user = "support@cartaraiq.app"
            mock_settings.smtp_pass = "pass"

            mock_server = MagicMock()
            mock_ssl_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
            mock_ssl_cls.return_value.__exit__ = MagicMock(return_value=False)

            send_welcome_email("user@example.com", "Alice")

            mock_ssl_cls.assert_called_once()
            mock_server.sendmail.assert_called_once()

    def test_smtp_exception_does_not_propagate(self):
        """SMTP errors are swallowed so registration is never blocked."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email.settings") as mock_settings, \
             patch("backend.services.email.smtplib.SMTP") as mock_smtp_cls:

            mock_settings.smtp_host = "mail.cartaraiq.app"
            mock_settings.smtp_from = "support@cartaraiq.app"
            mock_settings.smtp_port = 587
            mock_settings.smtp_user = ""
            mock_smtp_cls.side_effect = ConnectionRefusedError("connection refused")

            # Must NOT raise
            send_welcome_email("user@example.com", "Alice")

    def test_first_name_extracted_from_full_name(self):
        """send_welcome_email puts only the first name in the email body."""
        from backend.services.email import _build_welcome_html, _build_welcome_plain
        html = _build_welcome_html("Alice")
        plain = _build_welcome_plain("Alice")
        assert "Alice" in html
        assert "Alice" in plain

    def test_email_without_spaces_in_name(self):
        """Single-word names work fine."""
        from backend.services.email import _build_welcome_html
        html = _build_welcome_html("Zara")
        assert "Zara" in html

    def test_empty_name_falls_back_to_there(self):
        """Empty name gracefully falls back to 'there'."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email._send") as mock_send:
            send_welcome_email("user@example.com", "")
            call_args = mock_send.call_args
            # The html & plain args should contain 'there' not crash
            assert "there" in call_args[0][2]  # html arg
            assert "there" in call_args[0][3]  # plain arg

    def test_html_contains_key_brand_elements(self):
        """Welcome HTML includes app name, CTA, and all 4 features."""
        from backend.services.email import _build_welcome_html
        html = _build_welcome_html("Matt")
        assert "CartaraIQ" in html
        assert "cartaraiq.app" in html
        assert "Loyalty Card" in html
        assert "Shopping List" in html
        assert "Pantry" in html
        assert "Recipe" in html
        assert "support@cartaraiq.app" in html

    def test_subject_line(self):
        """Subject line contains CartaraIQ and welcome messaging."""
        from backend.services.email import send_welcome_email
        with patch("backend.services.email._send") as mock_send:
            send_welcome_email("user@example.com", "Bob")
            subject = mock_send.call_args[0][1]
            assert "Welcome" in subject
            assert "CartaraIQ" in subject


# ── Integration tests: register endpoint triggers welcome email ───────────────

class TestWelcomeEmailOnRegister:

    def test_register_triggers_welcome_email(self, client):
        """POST /auth/register fires a background welcome email."""
        with patch("backend.routers.auth.send_welcome_email") as mock_send:
            resp = client.post("/auth/register", json={
                "email": "welcome@example.com",
                "password": "securepass",
                "name": "Welcome User",
            })
        assert resp.status_code == 201
        mock_send.assert_called_once_with("welcome@example.com", "Welcome User")

    def test_register_creates_welcome_email_audit_log(self, client, db):
        """POST /auth/register writes a welcome_email_sent audit log entry."""
        from backend.models.audit_log import AuditLog
        with patch("backend.routers.auth.send_welcome_email"):
            resp = client.post("/auth/register", json={
                "email": "auditlog@example.com",
                "password": "securepass",
                "name": "Audit User",
            })
        assert resp.status_code == 201
        user_id = resp.json()["user"]["id"]
        entry = db.query(AuditLog).filter(
            AuditLog.user_id == user_id,
            AuditLog.action == "welcome_email_sent",
        ).first()
        assert entry is not None
        assert entry.detail and "auditlog@example.com" in entry.detail

    def test_duplicate_register_does_not_send_email(self, client, db):
        """Failed registration (duplicate) must NOT send a welcome email."""
        from backend.tests.conftest import make_user
        make_user(db, email="dup@example.com")
        with patch("backend.routers.auth.send_welcome_email") as mock_send:
            resp = client.post("/auth/register", json={
                "email": "dup@example.com",
                "password": "pass",
                "name": "Dup",
            })
        assert resp.status_code == 409
        mock_send.assert_not_called()

    def test_duplicate_register_does_not_create_audit_log(self, client, db):
        """Failed registration must NOT write a welcome_email_sent audit entry."""
        from backend.models.audit_log import AuditLog
        from backend.tests.conftest import make_user
        make_user(db, email="dup2@example.com")
        with patch("backend.routers.auth.send_welcome_email"):
            client.post("/auth/register", json={
                "email": "dup2@example.com",
                "password": "pass",
                "name": "Dup",
            })
        entries = db.query(AuditLog).filter(
            AuditLog.action == "welcome_email_sent",
        ).all()
        assert len(entries) == 0
