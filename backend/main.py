import logging
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cartaraiq.app",
        "https://www.cartaraiq.app",
        "https://admin.cartaraiq.app",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost:19006",
    ],
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
