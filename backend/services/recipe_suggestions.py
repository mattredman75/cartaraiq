"""
Recipe-pairing suggestions via TheMealDB (free tier, no API key required).

Strategy:
  1. Take the names of active (unchecked) items on the user's current list.
  2. For each item, ensure its ingredient pairings are cached in the DB
     (fetched from TheMealDB and stored in `ingredient_pairings`).
  3. Query the DB for all pairings where base_ingredient is one of the
     user's list items, filtering out anything already on the list.
  4. Rank by total co-occurrence count across list items, return top N.

Caching:
  - DB-backed with PAIRING_TTL_DAYS TTL (7 days).
  - Survives server restarts and is shared across workers.
  - Predictive pre-warming: `warm_ingredient_pairings(name)` is designed
    to be called as a FastAPI BackgroundTask when an item is added to a
    shopping list, so pairings are ready before the user opens suggestions.
"""

import logging
import random
import urllib.request
import urllib.parse
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.ingredient_pairing import IngredientPairing

logger = logging.getLogger(__name__)

PAIRING_TTL_DAYS = 7
MAX_RESULTS = 6
MAX_ITEMS_TO_QUERY = 5
MAX_RECIPES_PER_ITEM = 5

BASE_URL = "https://www.themealdb.com/api/json/v1/1"

PAIRING_PHRASES = [
    "Pairs well with",
    "Goes well with",
    "Used with",
    "Friends with",
    "Regularly used with",
    "Good mates with",
    "Compliments",
    "Complimented by",
    "Seen with",
    "Often paired with",
    "Combines with",
    "Blends with",
    "Tastes great with",
    "Great alongside",
    "Works well with",
]


def _get_random_pairing_phrase() -> str:
    """Return a random pairing phrase from the list."""
    return random.choice(PAIRING_PHRASES)


# ── TheMealDB HTTP helpers ────────────────────────────────────────────────────

def _fetch_json(url: str) -> Any:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.warning("TheMealDB request failed: %s — %s", url, exc)
        return None


def _get_recipes_for_ingredient(ingredient: str) -> list[str]:
    """Return up to MAX_RECIPES_PER_ITEM meal IDs that use `ingredient`."""
    encoded = urllib.parse.quote(ingredient)
    data = _fetch_json(f"{BASE_URL}/filter.php?i={encoded}")
    if not data or not data.get("meals"):
        return []
    return [m["idMeal"] for m in data["meals"][:MAX_RECIPES_PER_ITEM]]


def _get_meal_ingredients(meal_id: str) -> list[str]:
    """Return the ingredient names for a given meal ID."""
    data = _fetch_json(f"{BASE_URL}/lookup.php?i={meal_id}")
    if not data or not data.get("meals"):
        return []
    meal = data["meals"][0]
    ingredients = []
    for i in range(1, 21):
        name = (meal.get(f"strIngredient{i}") or "").strip()
        if name:
            ingredients.append(name)
    return ingredients


# ── DB cache layer ────────────────────────────────────────────────────────────

def _ensure_pairings_cached(ingredient: str, db: Session) -> None:
    """
    Ensure the DB has fresh pairings for `ingredient`.

    If a fresh row exists (fetched within PAIRING_TTL_DAYS) the function
    returns immediately. Otherwise it fetches from TheMealDB, deletes any
    stale rows for this ingredient, and inserts fresh ones.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=PAIRING_TTL_DAYS)

    fresh = (
        db.query(IngredientPairing)
        .filter(
            IngredientPairing.base_ingredient == ingredient,
            IngredientPairing.fetched_at >= cutoff,
        )
        .first()
    )
    if fresh:
        return  # cache hit

    # Fetch from TheMealDB
    meal_ids = _get_recipes_for_ingredient(ingredient)
    paired_counts: dict[str, int] = {}
    for meal_id in meal_ids:
        for ing in _get_meal_ingredients(meal_id):
            ing_lower = ing.lower().strip()
            if ing_lower and ing_lower != ingredient:
                paired_counts[ing_lower] = paired_counts.get(ing_lower, 0) + 1

    if not paired_counts:
        return  # TheMealDB returned nothing; skip storing (will retry next call)

    # Delete stale rows then insert fresh ones
    db.query(IngredientPairing).filter(
        IngredientPairing.base_ingredient == ingredient
    ).delete()

    now = datetime.now(timezone.utc)
    for paired_ing, count in paired_counts.items():
        db.add(IngredientPairing(
            base_ingredient=ingredient,
            paired_ingredient=paired_ing,
            co_occurrence_count=count,
            fetched_at=now,
        ))

    db.commit()


def warm_ingredient_pairings(name: str) -> None:
    """
    Pre-warm the DB cache for `name` in its own DB session.

    Intended to be called as a FastAPI BackgroundTask so pairings are
    ready before the user opens the suggestions panel.
    """
    ingredient = name.lower().strip()
    if not ingredient:
        return
    db = SessionLocal()
    try:
        _ensure_pairings_cached(ingredient, db)
    except Exception as exc:
        logger.warning("Background warm failed for '%s': %s", ingredient, exc)
    finally:
        db.close()


# ── Public API ────────────────────────────────────────────────────────────────

def get_recipe_suggestions(
    item_names: list[str],
    db: Session,
) -> list[dict]:
    """
    Return up to MAX_RESULTS recipe-pairing suggestions for the given list
    item names as [{"name": str, "reason": str}, ...].
    """
    if not item_names:
        return []

    normalised = sorted(set(n.lower().strip() for n in item_names if n.strip()))
    if not normalised:
        return []

    items_to_query = normalised[:MAX_ITEMS_TO_QUERY]
    list_names_set = set(normalised)
    cutoff = datetime.now(timezone.utc) - timedelta(days=PAIRING_TTL_DAYS)

    # Ensure all queried ingredients are cached (synchronous on first call;
    # subsequent calls are instant DB reads)
    for ingredient in items_to_query:
        _ensure_pairings_cached(ingredient, db)

    # Single DB query for all pairings
    rows = (
        db.query(IngredientPairing)
        .filter(
            IngredientPairing.base_ingredient.in_(items_to_query),
            IngredientPairing.fetched_at >= cutoff,
            IngredientPairing.paired_ingredient.notin_(list(list_names_set)),
        )
        .all()
    )

    if not rows:
        return []

    # Tally: paired_ingredient → {total_count, triggering_list_items}
    co_occurrence: dict[str, dict] = {}
    for row in rows:
        entry = co_occurrence.setdefault(
            row.paired_ingredient, {"count": 0, "triggers": []}
        )
        entry["count"] += row.co_occurrence_count
        if row.base_ingredient not in entry["triggers"]:
            entry["triggers"].append(row.base_ingredient)

    ranked = sorted(co_occurrence.items(), key=lambda kv: -kv[1]["count"])

    results: list[dict] = []
    for ing_name, data in ranked[:MAX_RESULTS]:
        triggers = data["triggers"]
        prefix = _get_random_pairing_phrase()
        trigger_titles = [t.title() for t in triggers[:3]]
        if len(trigger_titles) == 1:
            listed = trigger_titles[0]
        elif len(trigger_titles) == 2:
            listed = f"{trigger_titles[0]} and {trigger_titles[1]}"
        else:  # 3 items
            listed = ", ".join(trigger_titles[:-1]) + f" and {trigger_titles[-1]}"
        reason = f"{prefix} {listed}"
        results.append({"name": ing_name.title(), "reason": reason})

    return results
