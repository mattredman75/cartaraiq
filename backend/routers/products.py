"""
Product search — mocked data for now.
Replace MOCK_PRODUCTS with a real API call (e.g. Open Food Facts, Kroger API) later.
"""

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/products", tags=["products"])

MOCK_PRODUCTS = [
    {"id": "1", "name": "Organic Whole Milk", "brand": "Horizon", "price": 5.99, "unit": "1 gallon", "category": "Dairy", "emoji": "🥛", "ai_tag": "Staple"},
    {"id": "2", "name": "Free-Range Eggs", "brand": "Vital Farms", "price": 7.49, "unit": "12 count", "category": "Dairy", "emoji": "🥚", "ai_tag": "Staple"},
    {"id": "3", "name": "Sourdough Bread", "brand": "Boudin", "price": 6.29, "unit": "1 loaf", "category": "Bakery", "emoji": "🍞", "ai_tag": "Popular"},
    {"id": "4", "name": "Chicken Breast", "brand": "Bell & Evans", "price": 9.99, "unit": "per lb", "category": "Meat", "emoji": "🍗", "ai_tag": "Bestseller"},
    {"id": "5", "name": "Baby Spinach", "brand": "Earthbound Farm", "price": 3.99, "unit": "5 oz bag", "category": "Produce", "emoji": "🥬", "ai_tag": "Healthy"},
    {"id": "6", "name": "Avocados", "brand": "Fresh", "price": 1.50, "unit": "each", "category": "Produce", "emoji": "🥑", "ai_tag": "Trending"},
    {"id": "7", "name": "Greek Yogurt", "brand": "Fage", "price": 4.79, "unit": "17.6 oz", "category": "Dairy", "emoji": "🫙", "ai_tag": "Healthy"},
    {"id": "8", "name": "Orange Juice", "brand": "Tropicana", "price": 4.49, "unit": "52 oz", "category": "Beverages", "emoji": "🍊", "ai_tag": "Staple"},
    {"id": "9", "name": "Salmon Fillet", "brand": "Wild Caught", "price": 12.99, "unit": "per lb", "category": "Seafood", "emoji": "🐟", "ai_tag": "Premium"},
    {"id": "10", "name": "Pasta (Penne)", "brand": "Barilla", "price": 1.99, "unit": "16 oz", "category": "Pantry", "emoji": "🍝", "ai_tag": "Staple"},
    {"id": "11", "name": "Cherry Tomatoes", "brand": "Sunset", "price": 3.49, "unit": "1 pint", "category": "Produce", "emoji": "🍅", "ai_tag": "Fresh"},
    {"id": "12", "name": "Almond Butter", "brand": "Justin's", "price": 8.99, "unit": "16 oz", "category": "Pantry", "emoji": "🥜", "ai_tag": "Healthy"},
    {"id": "13", "name": "Sparkling Water", "brand": "LaCroix", "price": 5.99, "unit": "12-pack", "category": "Beverages", "emoji": "💧", "ai_tag": "Trending"},
    {"id": "14", "name": "Cheddar Cheese", "brand": "Tillamook", "price": 6.49, "unit": "16 oz block", "category": "Dairy", "emoji": "🧀", "ai_tag": "Staple"},
    {"id": "15", "name": "Bananas", "brand": "Dole", "price": 0.29, "unit": "per lb", "category": "Produce", "emoji": "🍌", "ai_tag": "Staple"},
]


class ProductOut(BaseModel):
    id: str
    name: str
    brand: str
    price: float
    unit: str
    category: str
    emoji: str
    ai_tag: str


@router.get("/search", response_model=list[ProductOut])
def search_products(q: str = Query(default="", min_length=0)):
    if not q:
        return MOCK_PRODUCTS[:12]
    q_lower = q.lower()
    results = [
        p for p in MOCK_PRODUCTS
        if q_lower in p["name"].lower()
        or q_lower in p["brand"].lower()
        or q_lower in p["category"].lower()
    ]
    return results


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str):
    product = next((p for p in MOCK_PRODUCTS if p["id"] == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
