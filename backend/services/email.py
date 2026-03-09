"""
Email service — transactional emails sent from CartaraIQ.

All functions are fire-and-forget; failures are logged but never re-raised so
that a broken SMTP server cannot block registration or other auth flows.
"""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import settings

logger = logging.getLogger(__name__)


# ── Low-level sender ──────────────────────────────────────────────────────────

def _send(to_email: str, subject: str, html: str, plain: str) -> None:
    """Send a transactional email via the configured SMTP server."""
    smtp_host = (settings.smtp_host or "").strip()
    smtp_from = (settings.smtp_from or "").strip()
    smtp_port = int(settings.smtp_port or 0)

    if not smtp_host:
        logger.info("[Email] No SMTP_HOST configured — skipping send to %s (%s)", to_email, subject)
        return
    if not smtp_from:
        logger.warning("[Email] SMTP_FROM is empty — cannot send to %s", to_email)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"CartaraIQ <{smtp_from}>"
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        if smtp_port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx, timeout=15) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_pass)
                server.sendmail(smtp_from, to_email, msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_pass)
                server.sendmail(smtp_from, to_email, msg.as_string())

        logger.info("[Email] Sent '%s' to %s", subject, to_email)
    except Exception:
        logger.exception("[Email] Failed to send '%s' to %s via %s:%s", subject, to_email, smtp_host, smtp_port)


# ── Welcome email ─────────────────────────────────────────────────────────────

def send_welcome_email(to_email: str, name: str) -> None:
    """Send the welcome / onboarding email to a newly registered user."""
    first_name = (name or "").split()[0] if name else "there"
    subject = "Welcome to CartaraIQ"
    html = _build_welcome_html(first_name)
    plain = _build_welcome_plain(first_name)
    _send(to_email, subject, html, plain)


# ── Templates ─────────────────────────────────────────────────────────────────

def _build_welcome_html(first_name: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CartaraIQ</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Email wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#134e4a 100%);padding:48px 40px 40px;text-align:center;">
              <!-- Logo mark -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#14b8a6,#0d9488);border-radius:14px;padding:14px 20px;">
                    <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Cartara<span style="color:#ccfbf1;">IQ</span>
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                Welcome, {first_name}!
              </h1>
              <p style="margin:0;font-size:16px;color:#94a3b8;line-height:1.5;">
                Your smart list companion is ready
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <p style="margin:0 0 24px;font-size:16px;color:#334155;line-height:1.7;">
                Thanks for joining CartaraIQ — the app that turns every list into a smarter experience. Here's everything you can do right now:
              </p>

              <!-- Feature 1 -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
                <tr>
                  <td width="20" valign="top" style="font-size:16px;color:#334155;padding-top:2px;">&bull;</td>
                  <td valign="top">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a;">Smart Lists</p>
                    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
                      Build and share lists that update in real time. Add items by voice or text.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
                <tr>
                  <td width="20" valign="top" style="font-size:16px;color:#334155;padding-top:2px;">&bull;</td>
                  <td valign="top">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a;">Loyalty Card Wallet</p>
                    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
                      Store all your loyalty and rewards cards in one place. Scan barcodes instantly at checkout.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td width="20" valign="top" style="font-size:16px;color:#334155;padding-top:2px;">&bull;</td>
                  <td valign="top">
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a;">Recipe Suggestions</p>
                    <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
                      Get personalised recipe ideas based on what's already in your pantry.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#e2e8f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
                Questions? Reply to this email or contact us at
                <a href="mailto:support@cartaraiq.app" style="color:#14b8a6;text-decoration:none;">support@cartaraiq.app</a>
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1;">
                © 2026 CartaraIQ · All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""


def _build_welcome_plain(first_name: str) -> str:
    return f"""Welcome to CartaraIQ, {first_name}!

Thanks for joining. Here's what you can do:

• Smart Lists
Build and share lists that update in real time. Add items by voice or text.

• Loyalty Card Wallet
Store all your loyalty cards in one place and scan them at checkout.

• Recipe Suggestions
Get personalised recipe ideas based on what's in your pantry.

Questions? Email us at support@cartaraiq.app

© 2026 CartaraIQ
"""
