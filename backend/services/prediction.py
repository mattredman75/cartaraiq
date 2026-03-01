"""
Predictive shopping list service.

Scoring:
  Per-user frequency score = times_added × (days_since / avg_cycle)
  Items overdue (score >1) rank highest.

Cross-user collaborative signal:
  Item co-occurrence: which items are commonly bought together across all users?
  Built from a single DB query, cached hourly, blended 30% into the final score.

Suggestions are cached per (user_id, list_id) and invalidated whenever the user's
list items are mutated (add, update, delete). A 1-hour TTL acts as a fallback.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
import time
from sqlalchemy.orm import Session
from ..models.list_item import ListItem
from ..config import settings

logger = logging.getLogger(__name__)

# ── Suggestion cache ──────────────────────────────────────────────────────────

_suggestions_cache: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 3600  # 1 hour fallback TTL

# ── Cross-user co-occurrence cache ────────────────────────────────────────────

_cooccurrence: dict[str, dict[str, int]] = {}  # item_a -> {item_b: co-buy count}
_item_popularity: dict[str, int] = {}           # item -> number of users who bought it
_cooc_built_at: float = 0.0
_COOC_TTL = 3600          # rebuild at most once per hour
_COOC_WINDOW_DAYS = 60    # only include items bought within this many days
_MIN_COOC_ITEMS = 10      # need at least this many distinct items before using cross-user signal


# ── Cache key ─────────────────────────────────────────────────────────────────

def _cache_key(user_id: str, list_id: str) -> str:
    return f"{user_id}:{list_id}"


def invalidate_suggestions_cache(user_id: str, list_id: str) -> None:
    """Call this whenever list items are mutated so the next request regenerates."""
    _suggestions_cache.pop(_cache_key(user_id, list_id), None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _days_since(dt: Optional[datetime]) -> float:
    if dt is None:
        return 999
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    return delta.total_seconds() / 86400


def _minmax(values: list[float]) -> list[float]:
    """Min-max normalise a list to [0, 1]. Returns all 1.0 if values are identical."""
    lo, hi = min(values), max(values)
    if hi == lo:
        return [1.0] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


# ── Per-user frequency scoring ────────────────────────────────────────────────

def score_item(item: ListItem) -> float:
    days_since = _days_since(item.last_added_at)
    avg_cycle = item.avg_days_between_adds or 7.0  # default: weekly
    recency_weight = days_since / avg_cycle  # >1 means overdue
    return item.times_added * recency_weight


def get_frequency_candidates(db: Session, user_id: str, limit: int = 15, list_id: str = None) -> list[ListItem]:
    """Return previously-bought items (checked off), sorted by how overdue they are.

    Excludes anything currently unchecked (already on the to-buy list).
    Deduplicates by name (case-insensitive), keeping the highest-scored entry.
    """
    query = db.query(ListItem).filter(
        ListItem.user_id == user_id,
        ListItem.times_added > 0,
        ListItem.checked == True,  # only items that have been bought/ticked off
    )
    if list_id:
        query = query.filter(ListItem.list_id == list_id)

    items = query.all()
    scored = sorted(items, key=score_item, reverse=True)

    # Deduplicate by lower-cased name, keeping the highest-scored entry
    seen: set[str] = set()
    deduped: list[ListItem] = []
    for item in scored:
        key = item.name.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    return deduped[:limit]


# ── Cross-user co-occurrence ──────────────────────────────────────────────────

def _build_cooccurrence(db: Session) -> None:
    """
    Build the global co-occurrence table from all users' purchase history.
    Runs at most once per _COOC_TTL period. Uses only items bought >= 2 times
    within the past _COOC_WINDOW_DAYS days to filter out one-off purchases.
    """
    global _cooccurrence, _item_popularity, _cooc_built_at

    cutoff = datetime.now(timezone.utc) - timedelta(days=_COOC_WINDOW_DAYS)

    try:
        rows = (
            db.query(ListItem.user_id, ListItem.name)
            .filter(
                ListItem.times_added >= 2,
                ListItem.last_added_at >= cutoff,
            )
            .all()
        )
    except Exception:
        logger.exception("Failed to build co-occurrence table; keeping stale cache")
        return

    # Group by user → set of normalised item names
    user_items: dict[str, set[str]] = defaultdict(set)
    for user_id, name in rows:
        user_items[user_id].add(name.lower().strip())

    # Build co-occurrence and popularity counts
    new_cooc: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    new_pop: dict[str, int] = defaultdict(int)

    for item_set in user_items.values():
        items = list(item_set)
        for name in items:
            new_pop[name] += 1
        # Bidirectional pairwise co-occurrence
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                new_cooc[a][b] += 1
                new_cooc[b][a] += 1

    # Atomic swap — requests always see either old or new, never partial
    _cooccurrence = {k: dict(v) for k, v in new_cooc.items()}
    _item_popularity = dict(new_pop)
    _cooc_built_at = time.time()

    logger.info(
        "Co-occurrence cache built | %d users | %d distinct items | %d pairs",
        len(user_items),
        len(_item_popularity),
        sum(len(v) for v in _cooccurrence.values()) // 2,
    )


def _ensure_cooc_cache(db: Session) -> None:
    if time.time() - _cooc_built_at < _COOC_TTL:
        return
    _build_cooccurrence(db)


def _get_user_item_set(db: Session, user_id: str) -> set[str]:
    """Return the normalised set of all item names this user has ever bought."""
    rows = (
        db.query(ListItem.name)
        .filter(
            ListItem.user_id == user_id,
            ListItem.checked == True,
            ListItem.times_added >= 1,
        )
        .all()
    )
    return {row[0].lower().strip() for row in rows}


def _cooccurrence_score(item_name: str, user_item_set: set[str]) -> float:
    """
    How strongly does the broader user population associate item_name with
    what this user has bought? Normalised by item popularity so common items
    (milk, bread) don't dominate merely because they co-occur with everything.
    """
    key = item_name.lower().strip()
    cooc = _cooccurrence.get(key)
    if not cooc or not user_item_set:
        return 0.0
    pop = _item_popularity.get(key, 1)
    score = 0.0
    for history_item in user_item_set:
        score += cooc.get(history_item, 0)
    return score / pop


# ── Reason template engine ────────────────────────────────────────────────────

def _generate_reason(item: ListItem, overdue_ratio: float, cooc_score_norm: float) -> str:
    days_since = int(_days_since(item.last_added_at))
    cycle = int(item.avg_days_between_adds or 7)
    times = item.times_added

    if overdue_ratio > 1.5 and times >= 10:
        return f"Overdue \u2014 you buy this every {cycle} days"
    if overdue_ratio > 1.5:
        return f"Last bought {days_since} days ago"
    if overdue_ratio > 1.0 and cycle <= 7:
        return "About time to restock"
    if overdue_ratio > 1.0:
        return f"Due every {cycle} days"
    if overdue_ratio > 0.7 and times >= 5:
        return f"You buy this regularly every {cycle} days"
    if overdue_ratio > 0.7:
        return "Getting close to restock time"
    if cooc_score_norm > 0.5:
        return "Often bought together with your other items"
    if times >= 8:
        return f"A regular \u2014 bought {times} times"
    return f"Added {times} time{'s' if times != 1 else ''} before"


# ── Smart suggestions (replaces Claude) ──────────────────────────────────────

def get_smart_suggestions(
    candidates: list[ListItem],
    user_id: str,
    list_id: str,
    db: Session,
) -> list[dict]:
    """
    Return the top 5 suggestions using a blend of per-user frequency scoring
    and cross-user co-occurrence signals. Results are cached per user/list and
    invalidated on any item mutation.
    """
    if not candidates:
        return []

    key = _cache_key(user_id, list_id)
    cached = _suggestions_cache.get(key)
    if cached is not None:
        result, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return result

    # Ensure the cross-user co-occurrence table is warm
    _ensure_cooc_cache(db)

    use_cooc = len(_item_popularity) >= _MIN_COOC_ITEMS
    user_item_set = _get_user_item_set(db, user_id) if use_cooc else set()

    # Raw scores
    freq_scores = [score_item(item) for item in candidates]
    cooc_scores = [
        _cooccurrence_score(item.name, user_item_set) if use_cooc else 0.0
        for item in candidates
    ]

    # Normalise each dimension independently across the candidate set
    freq_norm = _minmax(freq_scores)
    cooc_norm = _minmax(cooc_scores) if use_cooc else [0.0] * len(candidates)

    w_freq = 0.70 if use_cooc else 1.0
    w_cooc = 0.30 if use_cooc else 0.0

    # Zip everything together for sorting
    scored = [
        (item, w_freq * fn + w_cooc * cn, fs, cn)
        for item, fn, cn, fs in zip(candidates, freq_norm, cooc_norm, freq_scores)
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    result = []
    for item, blended, raw_freq, cooc_n in scored[:5]:
        avg_cycle = item.avg_days_between_adds or 7.0
        days_since = _days_since(item.last_added_at)
        overdue_ratio = days_since / avg_cycle
        reason = _generate_reason(item, overdue_ratio, cooc_n)
        result.append({"name": item.name, "reason": reason})

    logger.info(
        "Suggestions | user=%s | candidates=%d | use_cooc=%s | top=%s",
        user_id[:8],
        len(candidates),
        use_cooc,
        [r["name"] for r in result],
    )

    _suggestions_cache[key] = (result, time.time())
    return result
