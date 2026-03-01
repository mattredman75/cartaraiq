from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .models import User, ShoppingList, ListItem
from .routers import auth, lists, products

Base.metadata.create_all(bind=engine)

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
