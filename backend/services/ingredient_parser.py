"""
ingredient_parser.py
────────────────────
Shared parsing pipeline that extracts a canonical ingredient name from a
raw string (e.g. a shopping-list item or an AllRecipes ingredient line).

Used by:
  • tools/build_cooccurrence.py  (populates canonical_ingredients)
  • backend/services/recipe_suggestions.py  (normalises live list items)
"""

import re
from typing import Optional

# ── Unicode fraction map ──────────────────────────────────────────────────────
# Convert before any regex so ASCII quantity patterns stay simple.

UNICODE_FRACS = {
    "¼": "1/4", "½": "1/2", "¾": "3/4",
    "⅓": "1/3", "⅔": "2/3",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
}


def _norm_fractions(s: str) -> str:
    for uc, asc in UNICODE_FRACS.items():
        s = s.replace(uc, asc)
    return re.sub(r"  +", " ", s).strip()


# ── Units to strip ────────────────────────────────────────────────────────────

_UNITS = (
    r"(?:"
    r"cups?|c\b|tablespoons?|tbsp?s?|teaspoons?|tsp?s?|"
    r"pounds?|lbs?|ounces?|oz|grams?|g\b|kilograms?|kg|"
    r"liters?|litres?|milliliters?|ml|"
    r"cans?|packages?|pkgs?|jars?|bottles?|bags?|"
    r"bunches?|bundles?|heads?|stalks?|sprigs?|"
    r"cloves?|slices?|pieces?|strips?|"
    r"pinch(?:es)?|dash(?:es)?|"
    r"large|medium|small|extra-large|xl|"
    r"quarts?|pints?|gallons?|fl\s*oz"
    r")"
)

# Strips:  "1 cup", "2 tablespoons", "1 (16 ounce) can", "1/2 tsp", "1 1/4 lbs"
LEADING_QTY = re.compile(
    r"^"
    r"(?:about\s+)?"
    r"(?:\d+\s+)?(?:\d+\s*/\s*\d+\s*)?"
    r"(?:\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?\s*)?"
    r"(?:\(\s*[\d.]+\s+(?:ounce|oz|g|gram|pound|lb)[s]?\s*\)\s*)?"
    r"(?:" + _UNITS + r"\s+)?"
    r"(?:of\s+)?"
    r"(?:a\s+|an\s+)?",
    re.IGNORECASE,
)

# ── Prep verbs ────────────────────────────────────────────────────────────────

_PREP_VERBS = (
    r"chopped|sliced|diced|minced|grated|peeled|divided|cut|rinsed|drained"
    r"|thawed|softened|melted|beaten|shredded|crushed|halved|trimmed"
    r"|separated|sifted|toasted|roasted|mashed|coarsely|finely|thinly|roughly"
    r"|boiled|cubed|quartered|cored|seeded|julienned|crumbled|squeezed"
    r"|scrubbed|blanched|patted|pounded|scored|deveined|butterflied|plumped"
    r"|flaked|soaked|heated|cooled|frozen|dried|fresh|optional|rinsed|washed"
)

LEADING_PREP = re.compile(
    r"^(?:(?:finely|coarsely|thinly|roughly|freshly|lightly|heavily)\s+)?"
    r"(?:chopped|diced|sliced|minced|grated|shredded|mashed|crushed|toasted"
    r"|roasted|softened|melted|beaten|divided|drained|thawed|peeled)\s+",
    re.IGNORECASE,
)

# ── Public API ────────────────────────────────────────────────────────────────


def parse_ingredient(raw: str) -> Optional[str]:
    """
    Extract a clean canonical ingredient name from a raw string.
    Returns None if the result is too short or clearly not useful.
    """
    s = raw.strip()
    if not s:
        return None

    # 0. Normalise unicode fractions to ASCII
    s = _norm_fractions(s)

    # 1. Strip leading quantity + unit
    s = LEADING_QTY.sub("", s).strip()

    # 2. Strip everything from " - " onward (e.g. " - cut into pieces")
    s = re.split(r"\s+-\s+", s)[0].strip()

    # 3. Strip parentheticals (repeat for nested)
    for _ in range(3):
        prev = s
        s = re.sub(r"\([^()]*\)", "", s).strip()
        if s == prev:
            break

    # 4. Strip " or [substitution]"
    s = re.split(r",?\s+or\s+", s, flags=re.IGNORECASE)[0].strip()

    # 5. Truncate at comma followed by a prep verb
    m = re.search(r",\s*(?=" + _PREP_VERBS + r")", s, re.IGNORECASE)
    if m:
        s = s[: m.start()].strip()

    # 6. Strip trailing punctuation artefacts
    s = s.rstrip(" ,-;.")

    # 6b. Strip trailing qualifier phrases
    s = re.sub(
        r",?\s*(?:to taste|as needed|or more to taste|or to taste|"
        r"if desired|optional|more as needed|as desired)\s*$",
        "", s, flags=re.IGNORECASE,
    ).strip()

    # 7. Strip leading prep adjectives (e.g. "chopped fresh parsley" → "fresh parsley")
    s = LEADING_PREP.sub("", s).strip()

    # 8. Lowercase
    s = s.lower().strip()

    # 9. Reject rubbish
    if len(s) < 3:
        return None
    if re.fullmatch(r"[\d\s/.,%-]+", s):
        return None

    return s
