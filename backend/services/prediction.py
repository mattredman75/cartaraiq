"""
Predictive shopping list service.

Scoring:
  score = times_added × recency_weight
  recency_weight = 1 / (1 + days_since_last_add / avg_cycle)

Items with avg_days_between_adds whose cycle is approaching or past due score highest.
Claude then takes the top candidates and produces human-readable suggestions with reasons.

Suggestions are cached per (user_id, list_id) and invalidated whenever the user's
list items are mutated (add, update, delete). A 1-hour TTL acts as a fallback.
"""

from datetime import datetime, timezone
from typing import Optional
import time
import json
import anthropic
from sqlalchemy.orm import Session
from ..models.list_item import ListItem
from ..config import settings

# ── Suggestion cache ──────────────────────────────────────────────────────────

_suggestions_cache: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 3600  # 1 hour fallback TTL


def _cache_key(user_id: str, list_id: str) -> str:
    return f"{user_id}:{list_id}"


def invalidate_suggestions_cache(user_id: str, list_id: str) -> None:
    """Call this whenever list items are mutated so the next request regenerates."""
    _suggestions_cache.pop(_cache_key(user_id, list_id), None)


# ── Scoring ───────────────────────────────────────────────────────────────────

def _days_since(dt: Optional[datetime]) -> float:
    if dt is None:
        return 999
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    return delta.total_seconds() / 86400


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


# ── AI suggestions ────────────────────────────────────────────────────────────

def get_ai_suggestions(candidates: list[ListItem], user_id: str, list_id: str) -> list[dict]:
    """
    Return cached suggestions if fresh, otherwise call Claude Haiku and cache the result.
    Cache is invalidated by invalidate_suggestions_cache() on any item mutation.
    """
    if not candidates:
        return []

    key = _cache_key(user_id, list_id)
    cached = _suggestions_cache.get(key)
    if cached is not None:
        result, ts = cached
        if time.time() - ts < _CACHE_TTL:
            return result

    if not settings.claude_api_key:
        result = [
            {"name": item.name, "reason": f"You usually add this every ~{int(item.avg_days_between_adds or 7)} days"}
            for item in candidates[:5]
        ]
        _suggestions_cache[key] = (result, time.time())
        return result

    client = anthropic.Anthropic(api_key=settings.claude_api_key)

    item_lines = "\n".join(
        f"- {item.name}: added {item.times_added}x, last added {_days_since(item.last_added_at):.0f} days ago, avg cycle {item.avg_days_between_adds or 7:.0f} days"
        for item in candidates
    )

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": f"""You are a smart shopping assistant. Based on the user's shopping history, pick the top 5 items they most need to buy right now and explain why in a short, friendly phrase (max 8 words).

Shopping history:
{item_lines}

Respond with a JSON array only, no other text. Format:
[{{"name": "item name", "reason": "short reason"}}, ...]""",
                }
            ],
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
    except Exception:
        # Fallback to frequency scoring if Claude is unavailable (rate limit, billing, network)
        result = [
            {"name": item.name, "reason": f"You usually add this every ~{int(item.avg_days_between_adds or 7)} days"}
            for item in candidates[:5]
        ]

    _suggestions_cache[key] = (result, time.time())
    return result
