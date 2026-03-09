"""
Recipe inspiration — powered by the FatSecret Platform API.

Endpoint:
  GET /recipes/inspiration?category=breakfast   → 10 recipes for the given meal category
  GET /recipes/inspiration                      → auto-detects category from server time (UTC+0)
                                                  but the front-end passes the category
                                                  based on the user's local time.

Supported categories: breakfast | lunch | dinner | dessert
"""

import time
import base64
from datetime import datetime
from typing import Optional
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recipes", tags=["recipes"])

# ── FatSecret config ──────────────────────────────────────────────────────────
# Credentials are read from Settings (loaded from .env via pydantic-settings)
FS_TOKEN_URL = "https://oauth.fatsecret.com/connect/token"
FS_SEARCH_URL = "https://platform.fatsecret.com/rest/recipes/search/v3"
FS_RECIPE_URL = "https://platform.fatsecret.com/rest/recipe/v2"

# ── Simple in-process token cache ────────────────────────────────────────────
_token_cache: dict = {"access_token": None, "expires_at": 0.0}

# Maps our category names → FatSecret recipe_types values
# Use recipe_types (plural) + recipe_types_matchall=yes for correct filtering.
CATEGORY_TYPES: dict[str, str] = {
    "breakfast": "Breakfast",
    "lunch": "Lunch",
    "dinner": "Main Dish",
    "dessert": "Dessert",
}


# ── Pydantic models ───────────────────────────────────────────────────────────
class RecipeIngredient(BaseModel):
    name: str


class RecipeNutrition(BaseModel):
    calories: Optional[str] = None
    protein: Optional[str] = None
    fat: Optional[str] = None
    carbohydrate: Optional[str] = None


class Recipe(BaseModel):
    id: str
    name: str
    description: str
    image_url: Optional[str] = None
    recipe_types: list[str] = []
    ingredients: list[RecipeIngredient]
    nutrition: Optional[RecipeNutrition] = None


class InspirationResponse(BaseModel):
    category: str
    recipes: list[Recipe]


class RecipeDetail(Recipe):
    directions: list[str] = []
    prep_time_min: Optional[str] = None
    cook_time_min: Optional[str] = None
    servings: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_access_token() -> str:
    """Returns a cached or fresh OAuth2 client-credentials token."""
    if not settings.fat_secret_client_id or not settings.fat_secret_api_secret:
        raise HTTPException(
            status_code=503,
            detail="FatSecret API credentials not configured on this server.",
        )

    now = time.time()
    if _token_cache["access_token"] and now < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    credentials = base64.b64encode(
        f"{settings.fat_secret_client_id}:{settings.fat_secret_api_secret}".encode()
    ).decode()

    try:
        resp = httpx.post(
            FS_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("FatSecret token request failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to authenticate with recipe service.",
        )

    data = resp.json()
    token = data.get("access_token")
    expires_in = int(data.get("expires_in", 86400))
    _token_cache["access_token"] = token
    _token_cache["expires_at"] = now + expires_in - 60  # 1-min buffer

    return token


def _safe_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_ingredients(recipe_data: dict) -> list[RecipeIngredient]:
    """Extract ingredients from a FatSecret recipe dict.
    The API returns recipe_ingredients.ingredient as a list of plain strings.
    """
    ingredients_block = recipe_data.get("recipe_ingredients", {})
    if not ingredients_block:
        return []

    raw = ingredients_block.get("ingredient", [])
    # API returns a single string (not list) when there is only one ingredient
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        return []

    return [RecipeIngredient(name=item.strip()) for item in raw if isinstance(item, str) and item.strip()]


def _parse_nutrition(recipe_data: dict) -> Optional[RecipeNutrition]:
    """Extract nutrition from a FatSecret recipe dict.
    The API returns recipe_nutrition with calories/carbohydrate/fat/protein as strings.
    """
    n = recipe_data.get("recipe_nutrition")
    if not n or not isinstance(n, dict):
        return None
    return RecipeNutrition(
        calories=n.get("calories"),
        protein=n.get("protein"),
        fat=n.get("fat"),
        carbohydrate=n.get("carbohydrate"),
    )


def _parse_recipe_types(r: dict) -> list[str]:
    types_block = r.get("recipe_types", {})
    if not types_block:
        return []
    raw = types_block.get("recipe_type", [])
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return raw
    return []


def _parse_recipe(r: dict) -> Recipe:
    return Recipe(
        id=str(r.get("recipe_id", "")),
        name=r.get("recipe_name", "Untitled Recipe"),
        description=r.get("recipe_description", ""),
        image_url=r.get("recipe_image") or None,
        recipe_types=_parse_recipe_types(r),
        ingredients=_parse_ingredients(r),
        nutrition=_parse_nutrition(r),
    )


def _parse_directions(recipe_data: dict) -> list[str]:
    """Extract step-by-step directions from a FatSecret recipe dict."""
    directions_block = recipe_data.get("recipe_directions", {})
    if not directions_block:
        return []
    raw = directions_block.get("direction", [])
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    # Each direction has direction_number and direction_description
    steps = sorted(raw, key=lambda d: int(d.get("direction_number", 0)))
    return [
        step.get("direction_description", "").strip()
        for step in steps
        if step.get("direction_description")
    ]


def _fetch_recipes(category: str, page: int = 0) -> list[Recipe]:
    token = _get_access_token()
    recipe_type = CATEGORY_TYPES.get(category, "Main Dish")

    try:
        resp = httpx.get(
            FS_SEARCH_URL,
            headers={"Authorization": f"Bearer {token}"},
            params={
                "format": "json",
                "recipe_types": recipe_type,
                "recipe_types_matchall": "yes",
                "must_have_images": "true",
                "sort_by": "random",
                "max_results": 10,
                "page_number": page % 10,
            },
            timeout=15,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("FatSecret recipe search failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch recipes from recipe service.",
        )

    data = resp.json()
    raw_recipes = data.get("recipes", {}).get("recipe", [])

    # API returns a dict (not list) when there is only one result
    if isinstance(raw_recipes, dict):
        raw_recipes = [raw_recipes]
    if not isinstance(raw_recipes, list):
        return []

    # must_have_images=true ensures all results have images; parse all returned
    return [_parse_recipe(r) for r in raw_recipes[:10]]


# ── Route ─────────────────────────────────────────────────────────────────────
@router.get("/inspiration", response_model=InspirationResponse)
def get_inspiration(
    category: str = Query(
        default="",
        description="One of: breakfast, lunch, dinner, dessert. "
                    "Omit to auto-detect from server hour.",
    ),
    page: int = Query(default=0, ge=0, description="Page number for randomised results (0-9)."),
):
    """
    Return 10 recipe suggestions for the requested meal category.
    The front-end passes the user's local category so timezone is handled on device.
    """
    category = category.lower().strip()
    if category not in CATEGORY_TYPES:
        # Auto-detect from UTC hour as a fallback
        hour = datetime.utcnow().hour
        if 5 <= hour < 11:
            category = "breakfast"
        elif 11 <= hour < 15:
            category = "lunch"
        elif 17 <= hour < 21:
            category = "dinner"
        else:
            category = "dessert"

    recipes = _fetch_recipes(category, page)
    return InspirationResponse(category=category, recipes=recipes)


# ── Allrecipes carousel scraper ───────────────────────────────────────────────

try:
    from bs4 import BeautifulSoup
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
    _SCRAPER_AVAILABLE = True
except ImportError:
    _SCRAPER_AVAILABLE = False


class CarouselRecipe(BaseModel):
    name: str
    image_url: Optional[str] = None
    url: str


@router.get("/allrecipes-carousel", response_model=list[CarouselRecipe])
def get_allrecipes_carousel():
    """
    Launches a headless Chromium browser, loads allrecipes.com, waits for the
    'loc carousel-items' section to render, then returns each recipe card's
    name, image URL, and URL.
    """
    if not _SCRAPER_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="playwright or beautifulsoup4 not installed. Run: pip install playwright beautifulsoup4 lxml && python -m playwright install chromium"
        )

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                ),
                viewport={"width": 390, "height": 844},
            )
            page.goto("https://www.allrecipes.com", wait_until="domcontentloaded", timeout=20000)

            # Wait for at least one carousel card to appear
            try:
                page.wait_for_selector(
                    "[class*='carousel-items'] a, .loc.carousel-items a",
                    timeout=12000,
                )
            except PWTimeoutError:
                logger.warning("Allrecipes carousel selector timed out — dumping available classes")

            html = page.content()
            browser.close()
    except Exception as exc:
        logger.error("Playwright error scraping allrecipes: %s", exc)
        raise HTTPException(status_code=502, detail=f"Scraper error: {exc}")

    soup = BeautifulSoup(html, "lxml")

    # Primary: class list contains both 'loc' and 'carousel-items'
    carousel = soup.find(
        lambda tag: tag.name in ("section", "div", "ul", "ol")
        and "loc" in tag.get("class", [])
        and "carousel-items" in tag.get("class", [])
    )
    # Fallback: any element whose class string contains 'carousel-items'
    if carousel is None:
        carousel = soup.find(
            lambda tag: "carousel-items" in " ".join(tag.get("class", []))
        )

    if carousel is None:
        logger.warning("allrecipes carousel element not found after JS render")
        raise HTTPException(
            status_code=404,
            detail="Carousel element not found. allrecipes.com page structure may have changed."
        )

    results: list[CarouselRecipe] = []
    seen_urls: set[str] = set()

    # Each card is an <li class="mntl-carousel__item"> with:
    #   data-tracking-metadata-label  → recipe name
    #   inner <div href="...">        → recipe URL
    #   inner <img data-src="...">   → thumbnail
    for item in carousel.find_all("li", class_=lambda c: c and "mntl-carousel__item" in c):
        name: str = (item.get("data-tracking-metadata-label") or "").strip()
        if not name:
            continue

        # URL: inner card div carries an href attribute (not a real <a>)
        card_div = item.find("div", href=True)
        if card_div:
            href = card_div["href"].strip()
        else:
            # Fallback: "View Recipe" <a> link
            view_a = item.find("a", href=True)
            href = view_a["href"].strip() if view_a else ""
        if not href:
            continue
        if not href.startswith("http"):
            href = "https://www.allrecipes.com" + href
        if href in seen_urls:
            continue
        seen_urls.add(href)

        # Image: prefer lazy-load src, skip base64 blobs and SVG placeholders
        image_url: Optional[str] = None
        img_tag = item.find("img", class_=lambda c: c and "card__img" in (c if isinstance(c, list) else [c]))
        if img_tag is None:
            img_tag = item.find("img")
        if img_tag:
            for attr in ("data-src", "data-lazy-src", "data-original", "src"):
                candidate = img_tag.get(attr, "")
                if candidate and not candidate.startswith("data:") and not candidate.endswith(".svg"):
                    image_url = candidate
                    break

        results.append(CarouselRecipe(name=name, image_url=image_url, url=href))

    return results


# ── Single recipe detail ──────────────────────────────────────────────────────
@router.get("/{recipe_id}", response_model=RecipeDetail)
def get_recipe_detail(recipe_id: str):
    """
    Return full detail for a single recipe including directions,
    prep/cook times, and serving information.
    """
    token = _get_access_token()

    try:
        resp = httpx.get(
            FS_RECIPE_URL,
            headers={"Authorization": f"Bearer {token}"},
            params={"format": "json", "recipe_id": recipe_id},
            timeout=15,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("FatSecret recipe detail failed for %s: %s", recipe_id, exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch recipe detail.",
        )

    data = resp.json()
    r = data.get("recipe", {})
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found.")

    # ── Image ──────────────────────────────────────────────────────────────────
    images_block = r.get("recipe_images", {})
    raw_images = images_block.get("recipe_image", []) if images_block else []
    if isinstance(raw_images, str):
        raw_images = [raw_images]
    image_url = raw_images[0] if raw_images else r.get("recipe_image") or None

    # ── Ingredients (v2 uses "ingredients.ingredient[].ingredient_description") ─
    ingredients: list[RecipeIngredient] = []
    ing_block = r.get("ingredients", {})
    if ing_block:
        raw_ings = ing_block.get("ingredient", [])
        if isinstance(raw_ings, dict):
            raw_ings = [raw_ings]
        if isinstance(raw_ings, list):
            for ing in raw_ings:
                desc = (
                    ing.get("ingredient_description")
                    or ing.get("food_name")
                    or ""
                ).strip()
                if desc:
                    ingredients.append(RecipeIngredient(name=desc))

    # ── Directions (v2 uses "directions.direction") ────────────────────────────
    directions: list[str] = []
    dir_block = r.get("directions", {})
    if dir_block:
        raw_dirs = dir_block.get("direction", [])
        if isinstance(raw_dirs, dict):
            raw_dirs = [raw_dirs]
        if isinstance(raw_dirs, list):
            steps = sorted(raw_dirs, key=lambda d: int(d.get("direction_number", 0)))
            directions = [
                s.get("direction_description", "").strip()
                for s in steps
                if s.get("direction_description")
            ]

    # ── Nutrition (v2 uses "serving_sizes.serving") ───────────────────────────
    nutrition: Optional[RecipeNutrition] = None
    serving_block = r.get("serving_sizes", {})
    if serving_block:
        srv = serving_block.get("serving", {})
        if srv and isinstance(srv, dict):
            nutrition = RecipeNutrition(
                calories=srv.get("calories"),
                protein=srv.get("protein"),
                fat=srv.get("fat"),
                carbohydrate=srv.get("carbohydrate"),
            )

    # ── Recipe types ───────────────────────────────────────────────────────────
    recipe_types = _parse_recipe_types(r)

    return RecipeDetail(
        id=str(r.get("recipe_id", recipe_id)),
        name=r.get("recipe_name", "Untitled Recipe"),
        description=r.get("recipe_description", ""),
        image_url=image_url,
        recipe_types=recipe_types,
        ingredients=ingredients,
        nutrition=nutrition,
        directions=directions,
        prep_time_min=r.get("preparation_time_min"),
        cook_time_min=r.get("cooking_time_min"),
        servings=r.get("number_of_servings"),
    )


