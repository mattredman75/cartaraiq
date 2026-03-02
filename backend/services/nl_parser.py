"""
Natural language shopping list parser via Groq.

Converts free-form text like "2 dozen eggs, a litre of milk and sourdough"
into a structured list of items with name, quantity, and unit.

Falls back to a single raw-text item on any error so the add flow never breaks.
"""

import json
import logging
from groq import Groq

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a shopping list parser. Parse the user's input into a JSON array of grocery items.

Rules:
- "name": lowercase grocery item name, no articles (a/an/the), no leading/trailing whitespace
- "quantity": integer, default 1 if not specified
- "unit": one of [g, kg, ml, l, lb, oz, cup, bunch, pack, bottle, can, bag, box, dozen] or null
- Expand "a dozen" to quantity 12 with unit null (e.g. "a dozen eggs" → {"name":"eggs","quantity":12,"unit":null})
- "2 litres of milk" → {"name":"milk","quantity":2,"unit":"l"}
- "some bread" → {"name":"bread","quantity":1,"unit":null}
- Split compound inputs into separate items ("eggs and milk" → two items)
- Respond ONLY with a valid JSON array. No explanation, no markdown."""


def parse_shopping_input(text: str, api_key: str) -> list[dict]:
    """
    Parse free-form shopping input into a list of structured items.

    Returns a list of dicts: [{"name": str, "quantity": int, "unit": str | None}]
    Falls back to [{"name": text, "quantity": 1, "unit": None}] on any failure.
    """
    fallback = [{"name": text.strip(), "quantity": 1, "unit": None}]

    if not api_key:
        return fallback

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0,
            max_tokens=256,
        )

        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)

        if not isinstance(parsed, list) or not parsed:
            return fallback

        result = []
        for item in parsed:
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            result.append({
                "name": name,
                "quantity": int(item.get("quantity") or 1),
                "unit": item.get("unit") or None,
            })

        return result if result else fallback

    except Exception:
        logger.warning("Groq NL parse failed for input %r, using fallback", text, exc_info=True)
        return fallback
