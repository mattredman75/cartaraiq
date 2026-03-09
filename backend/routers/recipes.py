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
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.recipe_db import RecipeDB
from ..models.ar_recipe import ARRecipe
from ..models.ar_ingredient import ARIngredient
from ..models.ar_step import ARStep
from ..models.ar_tag import ARTag
from ..models.ar_recipe_tag import ARRecipeTag
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


# ── Allrecipes detailed scraper ───────────────────────────────────────────────
_AR_30MIN_URL = (
    "https://www.allrecipes.com/recipes/455/everyday-cooking/"
    "more-meal-ideas/30-minute-meals/"
)


class ARNutrition(BaseModel):
    calories: Optional[str] = None
    fat: Optional[str] = None
    carbs: Optional[str] = None
    protein: Optional[str] = None


class ARDetailedRecipe(BaseModel):
    name: str
    url: str
    image_url: Optional[str] = None
    description: Optional[str] = None
    prep_time: Optional[str] = None
    cook_time: Optional[str] = None
    total_time: Optional[str] = None
    servings: Optional[str] = None
    ingredients: list[str] = []
    directions: list[str] = []
    nutrition: ARNutrition = ARNutrition()
    recipe_categories: list[str] = []
    recipe_cuisines: list[str] = []


def _parse_ar_recipe_page(html: str, url: str) -> ARDetailedRecipe:
    """Parse a rendered allrecipes.com recipe page into an ARDetailedRecipe."""
    import json as _json
    soup = BeautifulSoup(html, "lxml")

    # ── Name ──
    h1 = soup.find("h1")
    name = h1.get_text(strip=True) if h1 else ""

    # ── JSON-LD (description, recipeCategory, recipeCuisine) ──
    description: Optional[str] = None
    recipe_categories: list[str] = []
    recipe_cuisines: list[str] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.string or ""
            data = _json.loads(raw)
            items = data if isinstance(data, list) else [data]
            for item in items:
                t = item.get("@type", "")
                if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                    if not description and item.get("description"):
                        description = item["description"]
                    cats = item.get("recipeCategory", [])
                    if isinstance(cats, str):
                        cats = [cats]
                    recipe_categories = [c for c in cats if c]
                    cuis = item.get("recipeCuisine", [])
                    if isinstance(cuis, str):
                        cuis = [cuis]
                    recipe_cuisines = [c for c in cuis if c]
                    break
        except Exception:
            pass

    # ── Image ──
    image_url: Optional[str] = None
    # Try data-src first (lazy-load attr set before JS fires), then src.
    # Also check <noscript> fallback img which always carries the real URL.
    for img in soup.find_all("img", class_=lambda c: c and "universal-image__image" in " ".join(c) if c else False):
        for attr in ("data-src", "src"):
            candidate = img.get(attr, "")
            if candidate and not candidate.startswith("data:") and "placeholder" not in candidate:
                image_url = candidate
                break
        if image_url:
            break
    # Fallback: <noscript> img (always has the real full-res src)
    if not image_url:
        for noscript in soup.find_all("noscript"):
            ns_soup = BeautifulSoup(noscript.decode_contents(), "lxml")
            ns_img = ns_soup.find("img", src=True)
            if ns_img:
                candidate = ns_img["src"]
                if not candidate.startswith("data:") and "placeholder" not in candidate:
                    image_url = candidate
                    break

    # ── Prep / Cook / Total / Servings ──
    prep_time = cook_time = total_time = servings = None
    for item in soup.find_all(class_="mm-recipes-details__item"):
        label_el = item.find(class_="mm-recipes-details__label")
        value_el = item.find(class_="mm-recipes-details__value")
        if not label_el or not value_el:
            continue
        label = label_el.get_text(strip=True).rstrip(":").lower()
        value = value_el.get_text(strip=True)
        if "prep" in label:
            prep_time = value
        elif "cook" in label:
            cook_time = value
        elif "total" in label:
            total_time = value
        elif "serving" in label:
            servings = value

    # ── Ingredients ──
    ingredients: list[str] = []
    ing_container = (
        soup.find(id=lambda i: i and "mm-recipes-structured-ingredients" in (i or ""))
        or soup.find(class_=lambda c: c and "mm-recipes-structured-ingredients" in " ".join(c) if c else False)
    )
    if ing_container:
        for li in ing_container.find_all("li"):
            text = li.get_text(" ", strip=True)
            if text:
                ingredients.append(text)

    # ── Directions ──
    directions: list[str] = []
    # Look for an <ol> with multiple substantive <li> items (the step list)
    for ol in soup.find_all("ol"):
        lis = ol.find_all("li", recursive=False) or ol.find_all("li")
        steps = []
        for li in lis:
            # Remove figcaption and any nested image/media captions before extracting text
            for figcap in li.find_all("figcaption"):
                figcap.decompose()
            for fig in li.find_all("figure"):
                fig.decompose()
            text = li.get_text(" ", strip=True)
            # Strip trailing photo credits
            for credit in ("Dotdash Meredith Food Studios", "Allrecipes"):
                text = text.replace(credit, "").strip()
            text = text.strip(". ")
            if len(text) > 15:
                steps.append(text)
        if len(steps) >= 2:
            directions = steps
            break

    # ── Nutrition ──
    calories = fat = carbs = protein = None
    nut_label = soup.find(class_="mm-recipes-nutrition-facts-label")
    if nut_label:
        for row in nut_label.find_all("tr"):
            text = row.get_text(" ", strip=True)
            # Calories row: "Calories 964"
            if text.startswith("Calories"):
                parts = text.split()
                if len(parts) >= 2:
                    calories = parts[1]
            # Nutrient rows: "Total Fat 61g 78%", "Total Carbohydrate 84g ...", "Protein 24g ..."
            elif "Total Fat" in text:
                fat = _extract_nutrient_value(text, "Total Fat")
            elif "Total Carbohydrate" in text:
                carbs = _extract_nutrient_value(text, "Total Carbohydrate")
            elif text.strip().startswith("Protein"):
                protein = _extract_nutrient_value(text, "Protein")

    return ARDetailedRecipe(
        name=name,
        url=url,
        image_url=image_url,
        description=description,
        prep_time=prep_time,
        cook_time=cook_time,
        total_time=total_time,
        servings=servings,
        ingredients=ingredients,
        directions=directions,
        nutrition=ARNutrition(calories=calories, fat=fat, carbs=carbs, protein=protein),
        recipe_categories=recipe_categories,
        recipe_cuisines=recipe_cuisines,
    )


def _extract_nutrient_value(row_text: str, label: str) -> Optional[str]:
    """Pull the amount (e.g. '61g') immediately following a nutrient label."""
    after = row_text.replace(label, "").strip()
    parts = after.split()
    return parts[0] if parts else None


# ── In-memory result cache (keyed by limit, TTL = 1 hour) ────────────────────
import time as _time
import concurrent.futures as _futures

_AR_CACHE: dict[int, tuple[float, list]] = {}   # limit -> (fetched_at, results)
_AR_CACHE_TTL = 3600  # seconds

_AR_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _fetch_single_recipe(url: str) -> Optional[ARDetailedRecipe]:
    """
    Runs in a thread-pool worker. Each worker owns its own Playwright instance
    so there is no cross-thread sharing of browser objects.
    Waits for the details block selector instead of a fixed sleep.
    """
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=_AR_UA,
                viewport={"width": 1280, "height": 900},
            )
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_selector(".mm-recipes-details__item", timeout=8000)
            except PWTimeoutError:
                pass
            html = page.content()
            browser.close()
        return _parse_ar_recipe_page(html, url)
    except Exception as exc:
        logger.warning("Skipping %s — %s", url, exc)
        return None


def _get_listing_urls(limit: int) -> list[str]:
    """Load the 30-minute-meals listing page and return up to `limit` recipe URLs."""
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(user_agent=_AR_UA, viewport={"width": 1280, "height": 900})
        page.goto(_AR_30MIN_URL, wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_selector("a[href*='/recipe/']", timeout=8000)
        except PWTimeoutError:
            pass
        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "lxml")
    urls: list[str] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        if href.startswith("https://www.allrecipes.com/recipe/") and href not in seen:
            seen.add(href)
            urls.append(href)
            if len(urls) >= limit:
                break
    return urls


@router.get("/ar-detailed", response_model=list[ARDetailedRecipe])
def get_ar_detailed(
    limit: int = Query(default=12, ge=1, le=24, description="Max recipes to return (1-24)."),
    refresh: bool = Query(default=False, description="Force re-scrape even if cache is warm."),
):
    """
    Scrapes the allrecipes.com 30-minute-meals listing page, then fetches each
    recipe in parallel (up to 6 concurrent Chromium tabs).

    Results are cached for 1 hour — first call ~15 s, cached calls ~instant.
    Pass ?refresh=true to bypass the cache.
    """
    if not _SCRAPER_AVAILABLE:
        raise HTTPException(status_code=500, detail="playwright or beautifulsoup4 not installed.")

    # ── Serve from cache if available and fresh ──
    now = _time.time()
    cached = _AR_CACHE.get(limit)
    if cached and not refresh and (now - cached[0]) < _AR_CACHE_TTL:
        return cached[1]

    try:
        # ── Step 1: listing page (single browser, fast) ──
        recipe_urls = _get_listing_urls(limit)
        if not recipe_urls:
            raise HTTPException(status_code=404, detail="No recipe links found on listing page.")

        # ── Step 2: parallel recipe fetching ──
        # Each worker spawns its own Chromium process; keep workers ≤ 6 to
        # avoid saturating CPU/RAM on the server.
        results: list[ARDetailedRecipe] = []
        with _futures.ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(_fetch_single_recipe, url): url for url in recipe_urls}
            for future in _futures.as_completed(futures):
                recipe = future.result()
                if recipe is not None:
                    results.append(recipe)

        # Restore original listing-page order
        url_order = {url: i for i, url in enumerate(recipe_urls)}
        results.sort(key=lambda r: url_order.get(r.url, 999))

        _AR_CACHE[limit] = (_time.time(), results)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("ar-detailed scraper error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Scraper error: {exc}")

    return results


# ── Dinner category scraper ──────────────────────────────────────────────────
import re as _re
import uuid as _uuid

_DINNER_LISTING_URL = "https://www.allrecipes.com/recipes/17562/dinner/"


def _fetch_roundup_page(url: str) -> list[dict]:
    """Scrape one roundup/article page, return list of {recipe_url, slug, name}."""
    if not _SCRAPER_AVAILABLE:
        return []
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as _PWTimeout
        from bs4 import BeautifulSoup as _BS

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=_AR_UA,
                viewport={"width": 1280, "height": 900},
            )
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_selector("a[href*='/recipe/']", timeout=8000)
            except _PWTimeout:
                pass
            html = page.content()
            browser.close()

        soup = _BS(html, "html.parser")
        seen: set[str] = set()
        results: list[dict] = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not _re.match(r"https://www\.allrecipes\.com/recipe/\d+/", href):
                continue
            if href in seen:
                continue
            seen.add(href)
            parts = [p for p in href.rstrip("/").split("/") if p]
            if len(parts) < 2:
                continue
            id_part = parts[-2]
            name_part = parts[-1]
            slug = f"{id_part}-{name_part}"
            name = name_part.replace("-", " ").title()
            results.append({"recipe_url": href, "slug": slug, "name": name})
        return results
    except Exception:
        return []


def _scrape_category_url(url: str) -> list[dict]:
    """
    Scrape a single allrecipes /recipes/ category URL.
    Returns a list of {recipe_url, slug, name} dicts.
    Handles both direct (leaf) and roundup (top-level) pages automatically.
    """
    if not _SCRAPER_AVAILABLE:
        return []
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as _PWTimeout
        from bs4 import BeautifulSoup as _BS

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=_AR_UA,
                viewport={"width": 1280, "height": 900},
            )
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_selector("[data-doc-id]", timeout=8000)
            except _PWTimeout:
                pass
            page.wait_for_timeout(1500)
            for _ in range(5):
                page.evaluate("window.scrollBy(0, 1800)")
                page.wait_for_timeout(400)
            html = page.content()
            browser.close()

        soup = _BS(html, "html.parser")
        direct: list[dict] = []
        roundup_urls: list[str] = []
        seen: set[str] = set()
        for a in soup.find_all("a", attrs={"data-doc-id": True}, href=True):
            href = a["href"]
            if href in seen:
                continue
            seen.add(href)
            if _re.match(r"https://www\.allrecipes\.com/recipe/\d+/", href):
                parts = [p for p in href.rstrip("/").split("/") if p]
                if len(parts) >= 2:
                    slug = f"{parts[-2]}-{parts[-1]}"
                    name = parts[-1].replace("-", " ").title()
                    direct.append({"recipe_url": href, "slug": slug, "name": name})
            elif "/recipes/" not in href:
                roundup_urls.append(href)

        if direct:
            return direct

        # Roundup mode — parallel fetch
        results: list[dict] = []
        with _futures.ThreadPoolExecutor(max_workers=4) as pool:
            futs = {pool.submit(_fetch_roundup_page, u): u for u in roundup_urls}
            for fut in _futures.as_completed(futs):
                results.extend(fut.result())
        return results
    except Exception:
        return []


@router.post("/scrape-category")
def scrape_category_recipes(
    url: str = Query(default=_DINNER_LISTING_URL, description="Allrecipes category listing URL"),
    db: Session = Depends(get_db),
):
    """
    Scrape any allrecipes.com category or sitemap URL. Auto-detects page type:
      - Leaf subcategory: data-doc-id cards → /recipe/ URLs (single pass)
      - Top-level category: data-doc-id cards → roundup article URLs (two-pass)
      - Sitemap (e.g. /recipes-a-z-...): no recipe cards, only /recipes/ links —
        collects all category URLs then runs each through _scrape_category_url()
    New records written to recipes_db; existing slugs skipped.
    """
    if not _SCRAPER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Playwright not available")

    # ── Load the target page ──────────────────────────────────────────────────
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as _PWTimeout
        from bs4 import BeautifulSoup as _BS

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=_AR_UA,
                viewport={"width": 1280, "height": 900},
            )
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            try:
                page.wait_for_selector("[data-doc-id]", timeout=8000)
            except _PWTimeout:
                pass
            page.wait_for_timeout(1500)
            for _ in range(8):
                page.evaluate("window.scrollBy(0, 1800)")
                page.wait_for_timeout(600)
            html = page.content()
            browser.close()

        soup = _BS(html, "html.parser")
        direct_recipes: list[dict] = []
        roundup_urls: list[str] = []
        seen: set[str] = set()
        for a in soup.find_all("a", attrs={"data-doc-id": True}, href=True):
            href = a["href"]
            if href in seen:
                continue
            seen.add(href)
            if _re.match(r"https://www\.allrecipes\.com/recipe/\d+/", href):
                parts = [p for p in href.rstrip("/").split("/") if p]
                if len(parts) >= 2:
                    slug = f"{parts[-2]}-{parts[-1]}"
                    name = parts[-1].replace("-", " ").title()
                    direct_recipes.append({"recipe_url": href, "slug": slug, "name": name})
            elif "/recipes/" not in href:
                roundup_urls.append(href)

        # Sitemap detection — no recipe cards, collect /recipes/ category links
        if not direct_recipes and not roundup_urls:
            category_urls: list[str] = []
            seen_cat: set[str] = set()
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if (
                    href not in seen_cat
                    and _re.match(r"https://www\.allrecipes\.com/recipes/\d+/", href)
                ):
                    seen_cat.add(href)
                    category_urls.append(href)
            if not category_urls:
                raise HTTPException(
                    status_code=502,
                    detail="No recipes, roundup articles, or category links found on this page",
                )
            # Scrape each category (limited parallelism — each spawns Playwright)
            all_recipes: list[dict] = []
            with _futures.ThreadPoolExecutor(max_workers=2) as pool:
                futs = {pool.submit(_scrape_category_url, u): u for u in category_urls}
                for fut in _futures.as_completed(futs):
                    all_recipes.extend(fut.result())
            mode = "sitemap"
            categories_scraped = len(category_urls)
            roundup_count = 0
        else:
            mode = "direct" if direct_recipes else "roundup"
            categories_scraped = 1
            all_recipes = list(direct_recipes)
            roundup_count = len(roundup_urls)
            if roundup_urls:
                with _futures.ThreadPoolExecutor(max_workers=6) as pool:
                    futs = {pool.submit(_fetch_roundup_page, u): u for u in roundup_urls}
                    for fut in _futures.as_completed(futs):
                        all_recipes.extend(fut.result())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to scrape category page: {exc}")

    # ── Deduplicate by slug ───────────────────────────────────────────────────
    seen_slug: set[str] = set()
    unique_recipes: list[dict] = []
    for r in all_recipes:
        if r["slug"] not in seen_slug:
            seen_slug.add(r["slug"])
            unique_recipes.append(r)

    # ── Write to DB ───────────────────────────────────────────────────────────
    existing_slugs = {row.slug for row in db.query(RecipeDB.slug).all()}
    new_count = 0
    for r in unique_recipes:
        if r["slug"] in existing_slugs:
            continue
        db.add(RecipeDB(
            id=str(_uuid.uuid4()),
            slug=r["slug"],
            name=r["name"],
            image_url=None,
            recipe_url=r["recipe_url"],
            source_category_url=url,
            processed=False,
        ))
        new_count += 1

    db.commit()
    return {
        "mode": mode,
        "categories_scraped": categories_scraped,
        "roundup_pages_scraped": roundup_count,
        "unique_recipes_found": len(unique_recipes),
        "new_records_added": new_count,
        "already_known": len(unique_recipes) - new_count,
    }


# ── AR Fetch helpers ──────────────────────────────────────────────────────────

def _parse_minutes(s: Optional[str]) -> Optional[int]:
    """Convert a time string like '1 hr 30 mins' or '45 mins' to integer minutes."""
    if not s:
        return None
    s = s.strip().lower()
    total = 0
    hr_match = _re.search(r"(\d+)\s*hr", s)
    min_match = _re.search(r"(\d+)\s*min", s)
    if hr_match:
        total += int(hr_match.group(1)) * 60
    if min_match:
        total += int(min_match.group(1))
    return total if total > 0 else None


def _parse_nutrient_float(s: Optional[str]) -> Optional[float]:
    """Extract a float from a nutrient string like '61g' or '24.5g'."""
    if not s:
        return None
    m = _re.match(r"([\d.]+)", s.strip())
    return float(m.group(1)) if m else None


# Maps path segment keywords → tag_type
_MEAL_KEYWORDS = {
    "breakfast", "brunch", "lunch", "dinner", "dessert", "snack", "supper",
    "appetizer", "side-dish", "side", "salad", "soup", "drinks", "beverage",
}
_DIET_KEYWORDS = {
    "healthy", "vegetarian", "vegan", "gluten", "dairy-free", "low-carb",
    "low-fat", "low-sodium", "low-calorie", "diabetic", "paleo", "keto",
    "whole30", "diet",
}


def _tag_type_for_segment(segment: str, is_under_world_cuisine: bool) -> str:
    seg = segment.lower()
    if is_under_world_cuisine:
        return "cuisine"
    for kw in _MEAL_KEYWORDS:
        if kw in seg:
            return "meal"
    for kw in _DIET_KEYWORDS:
        if kw in seg:
            return "diet"
    return "feature"


def _derive_tags_from_url(category_url: str) -> list[tuple[str, str, str]]:
    """
    Parse an allrecipes category URL into a list of (slug, name, tag_type) tuples.
    E.g. https://www.allrecipes.com/recipes/710/world-cuisine/latin-american/caribbean/jamaican/
    → [('world-cuisine', 'World Cuisine', 'cuisine'),
       ('latin-american', 'Latin American', 'cuisine'),
       ('caribbean', 'Caribbean', 'cuisine'),
       ('jamaican', 'Jamaican', 'cuisine')]
    """
    if not category_url:
        return []
    try:
        # Strip domain and leading /recipes/NNN/
        path = category_url.rstrip("/")
        # Remove scheme+host
        path = _re.sub(r"^https?://[^/]+", "", path)
        # Remove /recipes/NNN prefix
        path = _re.sub(r"^/recipes/\d*/", "", path)
        segments = [s for s in path.split("/") if s]
        if not segments:
            return []
        world_cuisine = any("world-cuisine" in s.lower() for s in segments)
        result = []
        for seg in segments:
            name = seg.replace("-", " ").title()
            tag_type = _tag_type_for_segment(seg, world_cuisine)
            result.append((seg, name, tag_type))
        return result
    except Exception:
        return []


def _get_or_create_tag(db: Session, slug: str, name: str, tag_type: str) -> int:
    """Return id of existing tag or create one. Returns the integer tag id."""
    tag = db.query(ARTag).filter(ARTag.slug == slug).first()
    if tag:
        return tag.id
    tag = ARTag(slug=slug, name=name, tag_type=tag_type)
    db.add(tag)
    db.flush()
    return tag.id


# ── AR fetch batch endpoint ───────────────────────────────────────────────────

@router.get("/ar-fetch")
def ar_fetch_batch(
    batch: int = Query(default=100, ge=1, le=500, description="Number of unprocessed recipes to fetch"),
    db: Session = Depends(get_db),
):
    """
    Fetch and store a batch of unprocessed allrecipes.com recipes.

    Reads up to `batch` rows from `recipes_db` where processed=False,
    fetches full recipe detail from allrecipes.com via Playwright,
    and inserts into the normalized ar_* tables:
      - ar_recipes
      - ar_ingredients
      - ar_steps
      - ar_tags / ar_recipe_tags  (derived from source_category_url AND JSON-LD categories/cuisines)

    Sets processed=True and updates scraped_at on each processed recipes_db row.
    Returns a summary of what was inserted/skipped.
    """
    if not _SCRAPER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Playwright not available")

    # Select unprocessed batch
    pending = (
        db.query(RecipeDB)
        .filter(RecipeDB.processed == False)  # noqa: E712
        .limit(batch)
        .all()
    )
    if not pending:
        return {"message": "No unprocessed recipes found", "processed": 0, "skipped": 0}

    # Parallel fetch all recipe pages
    recipe_urls = [r.recipe_url for r in pending]
    results_map: dict[str, Optional[ARDetailedRecipe]] = {}
    with _futures.ThreadPoolExecutor(max_workers=6) as pool:
        fut_to_url = {pool.submit(_fetch_single_recipe, url): url for url in recipe_urls}
        for fut in _futures.as_completed(fut_to_url):
            url = fut_to_url[fut]
            results_map[url] = fut.result()

    from datetime import datetime as _dt

    processed_count = 0
    skipped_count = 0

    for row in pending:
        recipe_data = results_map.get(row.recipe_url)
        if recipe_data is None:
            skipped_count += 1
            continue

        # Skip if already stored (idempotent)
        if db.query(ARRecipe).filter(ARRecipe.recipe_db_id == row.id).first():
            row.processed = True
            processed_count += 1
            continue

        ar_id = str(_uuid.uuid4())

        # Parse times and nutrition
        prep_mins  = _parse_minutes(recipe_data.prep_time)
        cook_mins  = _parse_minutes(recipe_data.cook_time)
        total_mins = _parse_minutes(recipe_data.total_time)
        try:
            servings_int = int(recipe_data.servings.split()[0]) if recipe_data.servings else None
        except Exception:
            servings_int = None
        try:
            calories_int = int(recipe_data.nutrition.calories) if recipe_data.nutrition.calories else None
        except Exception:
            calories_int = None
        fat_f   = _parse_nutrient_float(recipe_data.nutrition.fat)
        carbs_f = _parse_nutrient_float(recipe_data.nutrition.carbs)
        prot_f  = _parse_nutrient_float(recipe_data.nutrition.protein)

        # Insert ar_recipe
        ar_recipe = ARRecipe(
            id=ar_id,
            recipe_db_id=row.id,
            name=recipe_data.name,
            description=recipe_data.description,
            image_url=recipe_data.image_url,
            prep_mins=prep_mins,
            cook_mins=cook_mins,
            total_mins=total_mins,
            servings=servings_int,
            calories=calories_int,
            fat_g=fat_f,
            carbs_g=carbs_f,
            protein_g=prot_f,
            fetched_at=_dt.utcnow(),
        )
        db.add(ar_recipe)
        db.flush()  # get ar_id into DB so FK inserts work

        # Insert ingredients
        for i, ing in enumerate(recipe_data.ingredients):
            db.add(ARIngredient(recipe_id=ar_id, sort_order=i, raw_text=ing[:500]))

        # Insert steps
        for i, step in enumerate(recipe_data.directions, start=1):
            db.add(ARStep(recipe_id=ar_id, step_number=i, instruction=step))

        # ── Tags ──────────────────────────────────────────────────────────────
        tag_tuples: list[tuple[str, str, str]] = []  # (slug, name, tag_type)

        # 1. Tags from source_category_url stored during scraping
        if row.source_category_url:
            tag_tuples.extend(_derive_tags_from_url(row.source_category_url))

        # 2. Tags from JSON-LD recipeCategory / recipeCuisine (most reliable)
        for cat in recipe_data.recipe_categories:
            slug = cat.lower().replace(" & ", "-and-").replace(" ", "-").replace("/", "-")
            tag_tuples.append((slug, cat, "meal"))
        for cuis in recipe_data.recipe_cuisines:
            slug = cuis.lower().replace(" & ", "-and-").replace(" ", "-").replace("/", "-")
            tag_tuples.append((slug, cuis, "cuisine"))

        # Deduplicate by slug and upsert tags
        seen_slugs: set[str] = set()
        tag_ids_added: set[int] = set()
        for slug, name, tag_type in tag_tuples:
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            tag_id = _get_or_create_tag(db, slug, name, tag_type)
            if tag_id not in tag_ids_added:
                tag_ids_added.add(tag_id)
                db.add(ARRecipeTag(recipe_id=ar_id, tag_id=tag_id))

        # Mark processed
        row.processed = True
        row.scraped_at = _dt.utcnow()
        processed_count += 1

        # Commit every 25 recipes to avoid holding a huge transaction
        if processed_count % 25 == 0:
            db.commit()

    db.commit()
    return {
        "batch_size": len(pending),
        "processed": processed_count,
        "skipped": skipped_count,
    }


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


