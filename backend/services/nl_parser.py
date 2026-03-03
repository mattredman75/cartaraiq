"""
Natural language shopping list parser via Groq.

Converts free-form text like "2 dozen eggs, a litre of milk and sourdough"
into a structured list of items with name, quantity, and unit.

Falls back to a single raw-text item on any error so the add flow never breaks.
"""

import json

_SYSTEM_PROMPT = """\
You are a shopping list parser. Parse the user's input into a JSON array of grocery items.

Rules:
- "name": lowercase grocery item name; remove only grammatical articles (a/an/the) but keep ALL other words including descriptors, styles, and adjectives; e.g. "Thai style chicken broth" → "thai style chicken broth", "free range eggs" → "free range eggs", "extra virgin olive oil" → "extra virgin olive oil"
- "quantity": integer, default 1 if not specified
- "unit": one of [g, kg, ml, l, lb, oz, cup, bunch, pack, packet, bottle, can, bag, box, dozen, loaf, loaves, roll, rolls, slice, slices, sheet, sheets, bar, bars, jar, jars, tub, tubs, punnet, punnets, sachet, sachets, piece, pieces] or null
- Normalise plural units to singular (e.g. "loaves" → "loaf", "rolls" → "roll", "bars" → "bar")
- Expand "a dozen" to quantity 12 with unit null (e.g. "a dozen eggs" → {"name":"eggs","quantity":12,"unit":null})
- "2 litres of milk" → {"name":"milk","quantity":2,"unit":"l"}
- "some bread" → {"name":"bread","quantity":1,"unit":null}
- "2 loaves of bread" → {"name":"bread","quantity":2,"unit":"loaf"}
- Split compound inputs into separate items ONLY when they are clearly distinct grocery items joined by "and" or commas (e.g. "eggs and milk" → two items, "bread, butter and cheese" → three items)
- Do NOT split dish or recipe names — keep them as a single item (e.g. "garlic chicken pasta" → one item, "beef stir fry" → one item, "chicken tikka masala" → one item)
- Correct obvious spelling mistakes in item names (e.g. "chikne" → "chicken", "bere" → "beer", "tmoatoes" → "tomatoes", "farlic" → "garlic")
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
        from groq import Groq
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
        return fallback
