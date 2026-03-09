import logging
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
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


@app.get("/health")
def health():
    return {"status": "ok"}


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
