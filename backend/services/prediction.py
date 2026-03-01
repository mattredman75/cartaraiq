"""
Predictive shopping list service.

Scoring:
  Per-user frequency score = times_added × (days_since / avg_cycle)
  Items overdue (score >1) rank highest.

Cross-user collaborative signal:
  Item co-occurrence: which items are commonly bought together across all users?
  Built from a single DB query and cached hourly. Blended 30% into the final score.

Suggestions are computed fresh on every request (cheap — pure Python arithmetic
plus one lightweight indexed DB query). The co-occurrence table is the only
cached artefact, rebuilt at most once per hour.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
import time
from sqlalchemy.orm import Session
from ..models.list_item import ListItem

logger = logging.getLogger(__name__)

# ── Cross-user co-occurrence cache ────────────────────────────────────────────

_cooccurrence: dict[str, dict[str, int]] = {}  # item_a -> {item_b: co-buy count}
_item_popularity: dict[str, int] = {}           # item -> number of users who bought it
_cooc_built_at: float = 0.0
_COOC_TTL = 3600        # rebuild at most once per hour
_COOC_WINDOW_DAYS = 60  # only include items bought within this many days
_MIN_COOC_ITEMS = 10    # need at least this many distinct items before using cross-user signal


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
    return item.times_added * (days_since / avg_cycle)  # >1 means overdue


def get_frequency_candidates(db: Session, user_id: str, limit: int = 15, list_id: str = None) -> list[ListItem]:
    """Return previously-bought items (checked off), sorted by how overdue they are.

    Excludes anything currently unchecked (already on the to-buy list).
    Deduplicates by name (case-insensitive), keeping the highest-scored entry.
    """
    query = db.query(ListItem).filter(
        ListItem.user_id == user_id,
        ListItem.times_added > 0,
        ListItem.checked == True,
    )
    if list_id:
        query = query.filter(ListItem.list_id == list_id)

    items = query.all()
    scored = sorted(items, key=score_item, reverse=True)

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
    Runs at most once per _COOC_TTL period. Only includes items bought >= 2 times
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

    user_items: dict[str, set[str]] = defaultdict(set)
    for user_id, name in rows:
        user_items[user_id].add(name.lower().strip())

    new_cooc: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    new_pop: dict[str, int] = defaultdict(int)

    for item_set in user_items.values():
        items = list(item_set)
        for name in items:
            new_pop[name] += 1
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                new_cooc[a][b] += 1
                new_cooc[b][a] += 1

    # Atomic swap
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
    key = item_name.lower().strip()
    cooc = _cooccurrence.get(key)
    if not cooc or not user_item_set:
        return 0.0
    pop = _item_popularity.get(key, 1)
    return sum(cooc.get(h, 0) for h in user_item_set) / pop


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


# ── Smart suggestions ─────────────────────────────────────────────────────────

def get_smart_suggestions(
    candidates: list[ListItem],
    user_id: str,
    list_id: str,
    db: Session,
) -> list[dict]:
    """
    Return the top 5 suggestions using a blend of per-user frequency scoring
    and cross-user co-occurrence signals. Runs fresh on every request — the
    computation is cheap (~5ms) so no per-user caching is needed.
    """
    if not candidates:
        return []

    _ensure_cooc_cache(db)

    use_cooc = len(_item_popularity) >= _MIN_COOC_ITEMS
    user_item_set = _get_user_item_set(db, user_id) if use_cooc else set()

    freq_scores = [score_item(item) for item in candidates]
    cooc_scores = [
        _cooccurrence_score(item.name, user_item_set) if use_cooc else 0.0
        for item in candidates
    ]

    freq_norm = _minmax(freq_scores)
    cooc_norm = _minmax(cooc_scores) if use_cooc else [0.0] * len(candidates)

    w_freq = 0.70 if use_cooc else 1.0
    w_cooc = 0.30 if use_cooc else 0.0

    scored = [
        (item, w_freq * fn + w_cooc * cn, cn)
        for item, fn, cn in zip(candidates, freq_norm, cooc_norm)
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    result = []
    for item, _, cooc_n in scored[:5]:
        avg_cycle = item.avg_days_between_adds or 7.0
        overdue_ratio = _days_since(item.last_added_at) / avg_cycle
        result.append({"name": item.name, "reason": _generate_reason(item, overdue_ratio, cooc_n)})

    logger.info(
        "Suggestions | user=%s | candidates=%d | use_cooc=%s | top=%s",
        user_id[:8],
        len(candidates),
        use_cooc,
        [r["name"] for r in result],
    )

    return result
