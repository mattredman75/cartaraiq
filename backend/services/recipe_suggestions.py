"""
Recipe-pairing suggestions.

Two complementary strategies are provided:

1. Canonical co-occurrence  (get_canonical_suggestions)
   Uses our own 22k-recipe / 15k-ingredient database.  The
   ingredient_cooccurrence table records how many recipes contain each
   pair of canonical ingredients.  A pool of the top-40 co-occurring
   ingredients (filtered to recipe_count >= 5) is weighted-randomly
   sampled to produce 8 varied, high-quality suggestions.

2. TheMealDB live pairing  (get_recipe_suggestions)
   Free external API, cached in ingredient_pairings table (7-day TTL).
   Used as a fallback / supplement when canonical data yields nothing.

Predictive pre-warming:
  warm_ingredient_pairings(name) is a FastAPI BackgroundTask called when
  an item is added to a list, so TheMealDB pairings are ready in advance.
"""

import logging
import math
import random
import urllib.request
import urllib.parse
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import SessionLocal
from ..models.ingredient_pairing import IngredientPairing
from .ingredient_parser import parse_ingredient

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


# ── Canonical co-occurrence suggestions ───────────────────────────────────────

CANONICAL_POOL_SIZE = 40       # how many top candidates to consider
CANONICAL_SAMPLE_SIZE = 8      # how many to return
CANONICAL_MIN_RECIPE_COUNT = 5 # noise floor — ignore pairs below this

CANONICAL_PAIRING_PHRASES = [
    "Goes great with",
    "Often cooked with",
    "Pairs well with",
    "Frequently used with",
    "Complements",
    "Popular alongside",
    "A classic with",
    "Works well with",
    "Combines nicely with",
    "Seen a lot with",
]


def _get_random_canonical_phrase() -> str:
    return random.choice(CANONICAL_PAIRING_PHRASES)


def get_canonical_suggestions(
    item_names: list[str],
    db: Session,
    *,
    pool_size: int = CANONICAL_POOL_SIZE,
    sample_size: int = CANONICAL_SAMPLE_SIZE,
    min_recipe_count: int = CANONICAL_MIN_RECIPE_COUNT,
) -> list[dict]:
    """
    Return up to `sample_size` recipe-cooccurrence-based ingredient suggestions.

    Algorithm:
      1. Parse each item name to a canonical form.
      2. Look up their IDs in canonical_ingredients.
      3. Query ingredient_cooccurrence for all co-occurring ingredients,
         summing recipe_count across all input items.
      4. Filter out items already on the list and pairs below min_recipe_count.
      5. Take the top `pool_size` by total recipe_count.
      6. Weighted-random sample `sample_size` using log(1 + recipe_count)
         weights so high-count items are preferred but not guaranteed.
      7. Return as [{"name": str, "reason": str}].
    """
    if not item_names:
        return []

    # Step 1 — parse item names to canonical form
    canonical_inputs: list[str] = []
    for raw in item_names:
        parsed = parse_ingredient(raw)
        if parsed:
            canonical_inputs.append(parsed)
        else:
            # Fall back to simple lowercase strip if parser returns nothing
            fb = raw.lower().strip()
            if fb:
                canonical_inputs.append(fb)

    if not canonical_inputs:
        return []

    canonical_inputs = list(set(canonical_inputs))
    on_list_set = set(canonical_inputs)

    # Step 2 — look up canonical IDs
    try:
        id_rows = db.execute(
            text(
                "SELECT id, name FROM canonical_ingredients "
                "WHERE name IN :names"
            ),
            {"names": tuple(canonical_inputs)},
        ).fetchall()
    except Exception as exc:
        logger.warning("canonical_suggestions: ID lookup failed: %s", exc)
        return []

    if not id_rows:
        return []

    ingredient_ids = [r[0] for r in id_rows]
    # Map id → name for building trigger labels
    id_to_name: dict[int, str] = {r[0]: r[1] for r in id_rows}

    # Step 3 — query cooccurrence table
    # We want all candidate ingredient IDs that co-occur with our list items,
    # scanning both (ingredient_a, ingredient_b) directions.
    try:
        cooc_rows = db.execute(
            text(
                """
                SELECT
                    CASE WHEN ingredient_a IN :ids THEN ingredient_b ELSE ingredient_a END AS candidate_id,
                    CASE WHEN ingredient_a IN :ids THEN ingredient_a ELSE ingredient_b END AS trigger_id,
                    recipe_count
                FROM ingredient_cooccurrence
                WHERE (ingredient_a IN :ids OR ingredient_b IN :ids)
                  AND recipe_count >= :min_count
                """
            ),
            {
                "ids": tuple(ingredient_ids),
                "min_count": min_recipe_count,
            },
        ).fetchall()
    except Exception as exc:
        logger.warning("canonical_suggestions: cooccurrence query failed: %s", exc)
        return []

    if not cooc_rows:
        return []

    # Step 4 — aggregate, filter out items already on list
    # Look up candidate name → filter excludes
    candidate_ids = list({row[0] for row in cooc_rows})

    try:
        cand_name_rows = db.execute(
            text(
                "SELECT id, name FROM canonical_ingredients WHERE id IN :ids"
            ),
            {"ids": tuple(candidate_ids)},
        ).fetchall()
    except Exception as exc:
        logger.warning("canonical_suggestions: candidate name lookup failed: %s", exc)
        return []

    cand_id_to_name: dict[int, str] = {r[0]: r[1] for r in cand_name_rows}

    # Aggregate: candidate_id → {total_count, trigger_names}
    aggregated: dict[int, dict] = {}
    for candidate_id, trigger_id, recipe_count in cooc_rows:
        # Skip if candidate is one of the user's own list items
        cand_name = cand_id_to_name.get(candidate_id, "")
        if not cand_name or cand_name in on_list_set:
            continue
        # Skip if candidate_id == trigger_id (shouldn't happen, but guard)
        if candidate_id == trigger_id:
            continue

        entry = aggregated.setdefault(candidate_id, {"total": 0, "triggers": set()})
        entry["total"] += recipe_count
        trigger_name = id_to_name.get(trigger_id, "")
        if trigger_name:
            entry["triggers"].add(trigger_name)

    if not aggregated:
        return []

    # Step 5 — rank and take top pool_size
    ranked = sorted(aggregated.items(), key=lambda kv: -kv[1]["total"])
    pool = ranked[:pool_size]

    # Step 6 — weighted-random sample without replacement
    pool_ids = [item[0] for item in pool]
    pool_data = [item[1] for item in pool]
    weights = [math.log(1 + d["total"]) for d in pool_data]

    chosen_indices: list[int] = []
    available = list(range(len(pool_ids)))
    avail_weights = list(weights)

    for _ in range(min(sample_size, len(pool_ids))):
        total_w = sum(avail_weights)
        if total_w <= 0:
            break
        r = random.uniform(0, total_w)
        cumulative = 0.0
        chosen = 0
        for idx, w in enumerate(avail_weights):
            cumulative += w
            if cumulative >= r:
                chosen = idx
                break
        chosen_indices.append(available[chosen])
        available.pop(chosen)
        avail_weights.pop(chosen)

    # Step 7 — format results
    results: list[dict] = []
    for pool_idx in chosen_indices:
        cand_id = pool_ids[pool_idx]
        data = pool_data[pool_idx]
        cand_name = cand_id_to_name.get(cand_id, "")
        if not cand_name:
            continue
        triggers = sorted(data["triggers"])[:3]
        prefix = _get_random_canonical_phrase()
        trigger_titles = [t.title() for t in triggers]
        if len(trigger_titles) == 0:
            reason = prefix + " items on your list"
        elif len(trigger_titles) == 1:
            reason = f"{prefix} {trigger_titles[0]}"
        elif len(trigger_titles) == 2:
            reason = f"{prefix} {trigger_titles[0]} and {trigger_titles[1]}"
        else:
            reason = f"{prefix} {', '.join(trigger_titles[:-1])} and {trigger_titles[-1]}"
        results.append({"name": cand_name.title(), "reason": reason})

    return results
