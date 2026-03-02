"""
Natural language shopping list parser via Groq.

Converts free-form text like "2 dozen eggs, a litre of milk and sourdough"
into a structured list of items with name, quantity, and unit.

Falls back to a single raw-text item on any error so the add flow never breaks.
"""

import json
import logging
import traceback
from groq import Groq

logger = logging.getLogger(__name__)
print("[nl_parser] module loaded — Groq import OK")

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

    print(f"[nl_parser] parse_shopping_input called | text={text!r} | key_set={bool(api_key)}")

    if not api_key:
        print("[nl_parser] GROQ_API_KEY is empty — falling back to raw text")
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
        print(f"[nl_parser] Groq raw response: {raw!r}")
        parsed = json.loads(raw)

        if not isinstance(parsed, list) or not parsed:
            print("[nl_parser] Groq returned empty/non-list — falling back")
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

        print(f"[nl_parser] parsed {len(result)} items: {[r['name'] for r in result]}")
        return result if result else fallback

    except Exception:
        print(f"[nl_parser] Exception during Groq call:\n{traceback.format_exc()}")
        return fallback
