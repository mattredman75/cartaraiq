import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, lists, products

# Write logs to a file next to passenger_wsgi.py so they're easy to find.
# Falls back to stderr (works fine under local uvicorn).
_log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs", "app.log")
os.makedirs(os.path.dirname(_log_path), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(_log_path),
        logging.StreamHandler(),  # also keep stderr for local uvicorn
    ],
)

app = FastAPI(title="CartaraIQ API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(lists.router)
app.include_router(products.router)


@app.get("/health")
def health():
    return {"status": "ok"}
