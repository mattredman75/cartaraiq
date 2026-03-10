import logging
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.staticfiles import StaticFiles
from .routers import admin, auth, lists, products, app_status, my_data, push, loyalty_programs, recipes

# Write logs to a file next to passenger_wsgi.py so they're easy to find.
# Falls back to stderr (works fine under local uvicorn).
_log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs", "app.log")
_log_handlers: list[logging.Handler] = [logging.StreamHandler()]
_file_logging_enabled = False
try:
    os.makedirs(os.path.dirname(_log_path), exist_ok=True)
    _log_handlers.insert(0, logging.FileHandler(_log_path))
    _file_logging_enabled = True
except Exception:
    _file_logging_enabled = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=_log_handlers,
)

if not _file_logging_enabled:
    logging.getLogger(__name__).warning(
        "File logging unavailable at %s; continuing with stderr logging only",
        _log_path,
    )

# ── Rate Limiting ─────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


def _custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Return a JSON response (with 'detail' key) so the mobile app can display it."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again shortly."},
    )


app = FastAPI(title="CartaraIQ API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _custom_rate_limit_handler)

_base_origins = [
    "https://cartaraiq.app",
    "https://www.cartaraiq.app",
    "https://admin.cartaraiq.app",
    "http://localhost:5173",
    "http://localhost:8081",
    "http://localhost:19006",
]
# Allow extra origins for local network testing (e.g. CORS_EXTRA_ORIGINS=http://192.168.1.5:8081,http://192.168.1.5:5173)
from .config import settings as _settings
_extra_origins = [
    o.strip()
    for o in _settings.cors_extra_origins.split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_base_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(lists.router)
app.include_router(products.router)
app.include_router(app_status.router)
app.include_router(my_data.router)
app.include_router(push.router)
app.include_router(loyalty_programs.router)
app.include_router(recipes.router)

# Serve uploaded files (avatars etc.) from /uploads
_uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def landing():
    """Public landing page at cartaraiq.app"""
    import base64, pathlib
    _logo_path = pathlib.Path(__file__).parent.parent / "brand_assetts" / "steps" / "cartara_step-1.png"
    try:
        _logo_b64 = base64.b64encode(_logo_path.read_bytes()).decode()
        logo_img = f'<img src="data:image/png;base64,{_logo_b64}" alt="CartaraIQ" class="logo-img">'
    except Exception:
        logo_img = '<div class="logo-text">CartaraIQ</div>'

    app_store_url = "https://apps.apple.com/app/cartaraiq/id6744870999"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CartaraIQ — Smart Lists</title>
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,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">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    :root {{
      --teal: #1B6B7A;
      --teal-light: #25919f;
      --teal-glow: rgba(27,107,122,0.5);
      --bg: #07232b;
      --surface: rgba(255,255,255,0.055);
      --border: rgba(255,255,255,0.1);
      --text: #fff;
      --muted: rgba(255,255,255,0.55);
    }}

    @keyframes float {{
      0%, 100% {{ transform: translateY(0px); }}
      50% {{ transform: translateY(-10px); }}
    }}
    @keyframes pulse-ring {{
      0% {{ box-shadow: 0 0 0 0 var(--teal-glow); }}
      70% {{ box-shadow: 0 0 0 22px rgba(27,107,122,0); }}
      100% {{ box-shadow: 0 0 0 0 rgba(27,107,122,0); }}
    }}
    @keyframes fade-up {{
      from {{ opacity: 0; transform: translateY(20px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}
    @keyframes shimmer {{
      0% {{ background-position: -200% center; }}
      100% {{ background-position: 200% center; }}
    }}

    html, body {{
      min-height: 100%;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      background: var(--bg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px 48px;
      color: var(--text);
      overflow-x: hidden;
    }}

    /* Animated background blobs */
    .bg-blob {{
      position: fixed;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.18;
      pointer-events: none;
      z-index: 0;
    }}
    .bg-blob-1 {{
      width: 600px; height: 600px;
      background: var(--teal);
      top: -200px; left: -200px;
    }}
    .bg-blob-2 {{
      width: 500px; height: 500px;
      background: #0d5460;
      bottom: -150px; right: -150px;
    }}
    .bg-blob-3 {{
      width: 300px; height: 300px;
      background: var(--teal-light);
      top: 40%; left: 55%;
      opacity: 0.1;
    }}

    /* Grid dot pattern */
    body::before {{
      content: "";
      position: fixed;
      inset: 0;
      background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 32px 32px;
      pointer-events: none;
      z-index: 0;
    }}

    .content {{
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 520px;
      text-align: center;
    }}

    .logo-img {{
      height: 200px;
      width: auto;
      animation: float 5s ease-in-out infinite;
      margin-bottom: 12px;
      filter: drop-shadow(0 0 20px rgba(255,255,255,0.6)) drop-shadow(0 0 40px rgba(255,255,255,0.3));
    }}

    .badge {{
      display: inline-block;
      background: rgba(27,107,122,0.25);
      border: 1px solid rgba(37,145,159,0.4);
      color: #6de0ef;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-radius: 100px;
      padding: 5px 14px;
      margin-bottom: 22px;
      animation: fade-up 0.6s ease both 0.2s;
    }}

    h1 {{
      font-size: clamp(32px, 7vw, 52px);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -1.5px;
      margin-bottom: 18px;
      animation: fade-up 0.6s ease both 0.35s;
    }}

    h1 .shimmer {{
      background: linear-gradient(90deg, #fff 0%, #6de0ef 40%, #25919f 60%, #fff 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 3.5s linear infinite;
    }}

    .tagline {{
      font-size: 17px;
      color: var(--muted);
      line-height: 1.6;
      max-width: 380px;
      margin: 0 auto 42px;
      animation: fade-up 0.6s ease both 0.5s;
    }}

    /* Feature pills */
    .features {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      margin-bottom: 44px;
      animation: fade-up 0.6s ease both 0.65s;
    }}
    .feature {{
      display: flex;
      align-items: center;
      gap: 7px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 100px;
      padding: 8px 15px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,0.8);
      backdrop-filter: blur(10px);
    }}
    .feature-icon {{
      font-size: 15px;
    }}

    /* CTA */
    .cta-wrap {{
      animation: fade-up 0.6s ease both 0.8s;
    }}

    .app-store-btn {{
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: #fff;
      color: #07232b;
      text-decoration: none;
      border-radius: 18px;
      padding: 16px 28px;
      font-size: 16px;
      font-weight: 700;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 4px 30px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1);
      animation: pulse-ring 2.5s ease-out infinite 1.5s;
    }}
    .app-store-btn:hover {{
      transform: translateY(-2px);
      box-shadow: 0 8px 40px rgba(0,0,0,0.4);
    }}
    .app-store-btn:active {{
      transform: translateY(0);
    }}
    .app-store-btn svg {{
      flex-shrink: 0;
    }}
    .btn-text {{
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1;
    }}
    .btn-text small {{
      font-size: 10px;
      font-weight: 500;
      opacity: 0.6;
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }}

    .sub-note {{
      margin-top: 16px;
      font-size: 12px;
      color: rgba(255,255,255,0.25);
    }}

    /* Floating cards decoration */
    .cards-preview {{
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 44px;
      animation: fade-up 0.6s ease both 0.5s;
    }}
    .mini-card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      font-size: 13px;
      backdrop-filter: blur(12px);
      text-align: left;
      min-width: 130px;
    }}
    .mini-card:nth-child(1) {{ transform: rotate(-3deg) translateY(4px); }}
    .mini-card:nth-child(3) {{ transform: rotate(3deg) translateY(4px); }}
    .mini-card-title {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #6de0ef;
      margin-bottom: 8px;
      text-transform: uppercase;
    }}
    .mini-item {{
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 5px;
    }}
    .mini-item:last-child {{ margin-bottom: 0; }}
    .mini-check {{
      width: 14px; height: 14px;
      border-radius: 50%;
      border: 1.5px solid rgba(37,145,159,0.6);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .mini-check.done {{
      background: var(--teal);
      border-color: var(--teal);
    }}
    .mini-check.done::after {{
      content: "";
      width: 6px; height: 4px;
      border-left: 1.5px solid #fff;
      border-bottom: 1.5px solid #fff;
      transform: rotate(-45deg) translateY(-1px);
    }}

    footer {{
      margin-top: 56px;
      font-size: 12px;
      color: rgba(255,255,255,0.18);
      text-align: center;
      position: relative;
      z-index: 1;
    }}
    footer a {{
      color: rgba(255,255,255,0.3);
      text-decoration: none;
    }}
    footer a:hover {{
      color: rgba(255,255,255,0.6);
    }}
  </style>
</head>
<body>
  <div class="bg-blob bg-blob-1"></div>
  <div class="bg-blob bg-blob-2"></div>
  <div class="bg-blob bg-blob-3"></div>

  <div class="content">

    {logo_img}

    <div class="badge">Now on the App Store</div>

    <h1>
      <span class="shimmer">Smart lists.</span><br>Less effort.
    </h1>

    <p class="tagline">
      CartaraIQ keeps your lists organised and in your pocket — wherever you shop.
    </p>

    <div class="cards-preview">
      <div class="mini-card">
        <div class="mini-card-title">Weekly Essentials</div>
        <div class="mini-item"><div class="mini-check done"></div>Milk</div>
        <div class="mini-item"><div class="mini-check done"></div>Bread</div>
        <div class="mini-item"><div class="mini-check"></div>Eggs</div>
        <div class="mini-item"><div class="mini-check"></div>Cheese</div>
      </div>
      <div class="mini-card">
        <div class="mini-card-title">BBQ Saturday</div>
        <div class="mini-item"><div class="mini-check done"></div>Sausages</div>
        <div class="mini-item"><div class="mini-check done"></div>Buns</div>
        <div class="mini-item"><div class="mini-check done"></div>Sauce</div>
        <div class="mini-item"><div class="mini-check"></div>Salad</div>
      </div>
      <div class="mini-card">
        <div class="mini-card-title">Hardware Run</div>
        <div class="mini-item"><div class="mini-check"></div>Paint</div>
        <div class="mini-item"><div class="mini-check done"></div>Rollers</div>
        <div class="mini-item"><div class="mini-check"></div>Tape</div>
        <div class="mini-item"><div class="mini-check"></div>Tray</div>
      </div>
    </div>

    <div class="features">
      <div class="feature"><span class="feature-icon">📋</span>Smart list building</div>
      <div class="feature"><span class="feature-icon">🤝</span>Shared lists</div>
      <div class="feature"><span class="feature-icon">🎁</span>Loyalty tracking</div>
      <div class="feature"><span class="feature-icon">⚡</span>Instant sync</div>
    </div>

    <div class="cta-wrap">
      <a class="app-store-btn" href="{app_store_url}">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#07232b">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        <div class="btn-text">
          <small>Download on the</small>
          App Store
        </div>
      </a>
      <p class="sub-note">iOS</p>
    </div>

  </div>

  <footer>
    &copy; 2026 CartaraIQ &nbsp;·&nbsp;
    <a href="/tos">Terms</a> &nbsp;·&nbsp;
    <a href="/user-delete">Delete Account</a>
  </footer>

</body>
</html>"""
    return HTMLResponse(content=html)


@app.get("/share/{token}", response_class=HTMLResponse)
def share_landing(token: str):
    """Web landing page for invite links. Opens the app if installed, otherwise shows download instructions."""
    import base64, pathlib
    deep_link = f"cartaraiq://share/{token}"
    app_store_url = "https://apps.apple.com/app/cartaraiq/id6744870999"

    _logo_path = pathlib.Path(__file__).parent.parent / "brand_assetts" / "cartara_logo_transparent.png"
    try:
        _logo_b64 = base64.b64encode(_logo_path.read_bytes()).decode()
        logo_img = f'<img src="data:image/png;base64,{_logo_b64}" alt="CartaraIQ" style="height:300px;width:auto;margin-bottom:-20px;filter:drop-shadow(0 0px 0px rgba(0,0,0,0.6)) drop-shadow(0 0px 0px rgba(0,0,0,0.4));">'
    except Exception:
        logo_img = '<div class="logo">CartaraIQ</div>'
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,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">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You've been invited · CartaraIQ</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a3d49;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #fff;
    }}

    /* Radial glow behind the card */
    body::before {{
      content: "";
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse 80% 60% at 50% 30%, rgba(27,107,122,0.55) 0%, transparent 70%);
      pointer-events: none;
    }}

    .logo {{
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
      margin-bottom: 40px;
    }}

    .card {{
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border-radius: 28px;
      padding: 44px 36px 40px;
      max-width: 380px;
      width: 100%;
      text-align: center;
    }}

    .icon {{
      margin-bottom: 0;
    }}

    .icon svg {{
      display: none;
    }}

    h1 {{
      font-size: 26px;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 10px;
      color: #fff;
    }}

    .subtitle {{
      font-size: 15px;
      color: rgba(255,255,255,0.6);
      line-height: 1.5;
      margin-bottom: 36px;
    }}

    /* Open-app button (shown immediately, hidden if not installed) */
    #openBtn {{
      display: block;
      background: linear-gradient(135deg, #1B6B7A 0%, #25919f 100%);
      color: #fff;
      text-decoration: none;
      border-radius: 14px;
      padding: 16px;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 32px;
      box-shadow: 0 4px 20px rgba(27,107,122,0.45);
      transition: opacity 0.15s;
    }}
    #openBtn:active {{ opacity: 0.85; }}

    /* Download section — hidden until app not detected */
    #downloadSection {{
      display: none;
    }}

    .divider {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }}
    .divider::before, .divider::after {{
      content: "";
      flex: 1;
      height: 1px;
      background: rgba(255,255,255,0.12);
    }}
    .divider span {{
      font-size: 12px;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 1px;
    }}

    .steps {{
      text-align: left;
      margin-bottom: 28px;
    }}
    .step {{
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 18px;
    }}
    .step:last-child {{ margin-bottom: 0; }}
    .step-num {{
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255,255,255,0.7);
    }}
    .step-text {{
      padding-top: 4px;
      font-size: 14px;
      color: rgba(255,255,255,0.75);
      line-height: 1.4;
    }}
    .step-text strong {{ color: #fff; font-weight: 600; }}

    .store-btn {{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: #fff;
      color: #0a3d49;
      text-decoration: none;
      border-radius: 14px;
      padding: 14px 20px;
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 14px;
      transition: opacity 0.15s;
    }}
    .store-btn:active {{ opacity: 0.85; }}

    .accept-btn {{
      display: block;
      background: linear-gradient(135deg, #1B6B7A 0%, #25919f 100%);
      color: #fff;
      text-decoration: none;
      border-radius: 14px;
      padding: 16px;
      font-size: 16px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(27,107,122,0.45);
      transition: opacity 0.15s;
    }}
    .accept-btn:active {{ opacity: 0.85; }}

    .footer {{
      margin-top: 32px;
      font-size: 12px;
      color: rgba(255,255,255,0.25);
    }}
  </style>
</head>
<body>
  {logo_img}

  <div class="card">

    <h1>You've been invited!</h1>
    <p class="subtitle">Someone shared their CartaraIQ shopping list with you.</p>

    <!-- Shown immediately; redirects to app if installed -->
    <a id="openBtn" href="{deep_link}">Open in CartaraIQ</a>

    <!-- Shown after timeout if app isn't installed -->
    <div id="downloadSection">
      <div class="divider"><span>Don't have the app?</span></div>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-text"><strong>Download CartaraIQ</strong> — free on the App Store</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text"><strong>Create your account</strong> or sign in</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text"><strong>Come back here</strong> and tap the button below to accept</div>
        </div>
      </div>

      <a class="store-btn" href="{app_store_url}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Download on the App Store
      </a>

      <a class="accept-btn" href="{deep_link}">Tap here to accept the invite</a>
    </div>
  </div>

  <p class="footer">CartaraIQ · Your smart shopping companion</p>

  <script>
    // Attempt to open the app immediately
    window.location.href = "{deep_link}";

    // If the page is still visible after 2.5s the app isn't installed — show download steps
    var t = setTimeout(function() {{
      document.getElementById('openBtn').style.display = 'none';
      document.getElementById('downloadSection').style.display = 'block';
    }}, 2500);

    // If the page loses visibility the app opened successfully — cancel the timer
    document.addEventListener('visibilitychange', function() {{
      if (document.hidden) clearTimeout(t);
    }});
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)
