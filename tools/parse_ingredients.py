#!/usr/bin/env python3
"""
parse_ingredients.py
────────────────────
Reads all raw ingredient strings from ar_ingredients, extracts a clean
canonical name for each, deduplicates, and writes two tables:

  canonical_ingredients          (id, name, recipe_count)
  recipe_canonical_ingredients   (recipe_id, ingredient_id)

Run:
  python3 tools/parse_ingredients.py [--dry-run] [--limit N]

  --dry-run   print sample output, do not write to DB
  --limit N   process only N raw rows (default: all)
"""

import os, re, sys, argparse, unicodedata
from collections import defaultdict
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
import sqlalchemy as sa
from sqlalchemy import text

# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--limit",   type=int, default=0)
args = parser.parse_args()

# ── Parsing pipeline ──────────────────────────────────────────────────────────

# Unicode fraction map — convert before any regex so patterns stay simple
UNICODE_FRACS = {
    "¼": "1/4", "½": "1/2", "¾": "3/4",
    "⅓": "1/3", "⅔": "2/3",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
}

def _norm_fractions(s: str) -> str:
    for uc, asc in UNICODE_FRACS.items():
        s = s.replace(uc, asc)
    # Collapse any multi-spaces that result
    return re.sub(r"  +", " ", s).strip()


# Units to strip
UNITS = (
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

# Full leading-quantity-unit strip (after unicode fracs are ASCII-ified)
# Handles: "1 cup", "2 tablespoons", "1 (16 ounce) can", "1/2 teaspoon", "1 1/4 pounds"
LEADING_QTY = re.compile(
    r"^"
    r"(?:about\s+)?"                                     # optional "about"
    r"(?:\d+\s+)?(?:\d+\s*/\s*\d+\s*)?"                 # qty: int, fraction, or combo
    r"(?:\d+(?:\.\d+)?(?:\s*[-–]\s*\d+)?\s*)?"          # decimal / range fallback
    r"(?:\(\s*[\d.]+\s+(?:ounce|oz|g|gram|pound|lb)[s]?\s*\)\s*)?"  # (16 ounce)
    r"(?:" + UNITS + r"\s+)?"                            # unit word
    r"(?:of\s+)?"                                        # "of"
    r"(?:a\s+|an\s+)?",                                  # article
    re.IGNORECASE,
)

# Prep words that justify truncating at a preceding comma or hyphen
PREP_VERBS = (
    r"chopped|sliced|diced|minced|grated|peeled|divided|cut|rinsed|drained"
    r"|thawed|softened|melted|beaten|shredded|crushed|halved|trimmed"
    r"|separated|sifted|toasted|roasted|mashed|coarsely|finely|thinly|roughly"
    r"|boiled|cubed|quartered|cored|seeded|julienned|crumbled|squeezed"
    r"|scrubbed|blanched|patted|pounded|scored|deveined|butterflied|plumped"
    r"|flaked|soaked|heated|cooled|frozen|dried|fresh|optional|rinsed|washed"
)

# Leading prep adjectives to strip from result (e.g. "chopped fresh parsley")
LEADING_PREP = re.compile(
    r"^(?:(?:finely|coarsely|thinly|roughly|freshly|lightly|heavily)\s+)?"
    r"(?:chopped|diced|sliced|minced|grated|shredded|mashed|crushed|toasted"
    r"|roasted|softened|melted|beaten|divided|drained|thawed|peeled)\s+",
    re.IGNORECASE,
)


def parse_ingredient(raw: str) -> Optional[str]:
    """
    Extract a clean canonical ingredient name from a raw string.
    Returns None if result is too short / clearly not useful.
    """
    s = raw.strip()

    # 0. Normalise unicode fractions to ASCII before regex
    s = _norm_fractions(s)

    # 1. Strip leading quantity + unit
    s = LEADING_QTY.sub("", s).strip()

    # 2. Strip everything from " - " onward (prep suffix like " - cut into pieces")
    s = re.split(r"\s+-\s+", s)[0].strip()

    # 3. Strip parentheticals completely (repeat for nested)
    for _ in range(3):
        prev = s
        s = re.sub(r"\([^()]*\)", "", s).strip()
        if s == prev:
            break

    # 4. Strip " or [anything]" (allrecipes substitution suggestions)
    s = re.split(r",?\s+or\s+", s, flags=re.IGNORECASE)[0].strip()

    # 5. Truncate at comma followed by a prep verb
    m = re.search(r",\s*(?=" + PREP_VERBS + r")", s, re.IGNORECASE)
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

    # 7. Strip leading prep adjectives that survived (e.g. "chopped fresh parsley")
    s = LEADING_PREP.sub("", s).strip()

    # 8. Lowercase
    s = s.lower().strip()

    # 9. Reject rubbish
    if len(s) < 3:
        return None
    if re.fullmatch(r"[\d\s/.,%-]+", s):
        return None

    return s


# ── DB setup ──────────────────────────────────────────────────────────────────

engine = sa.create_engine(os.environ["DATABASE_URL"])

CREATE_CANONICAL = """
CREATE TABLE IF NOT EXISTS canonical_ingredients (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(300) NOT NULL UNIQUE,
    recipe_count INT NOT NULL DEFAULT 0,
    INDEX idx_name (name),
    INDEX idx_recipe_count (recipe_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

CREATE_BRIDGE = """
CREATE TABLE IF NOT EXISTS recipe_canonical_ingredients (
    recipe_id     VARCHAR(50) NOT NULL,
    ingredient_id INT         NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id),
    INDEX idx_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    limit_clause = f"LIMIT {args.limit}" if args.limit else ""
    print(f"Loading raw ingredients ({limit_clause or 'all'})…")

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"SELECT id, recipe_id, raw_text FROM ar_ingredients {limit_clause}")
        ).fetchall()

    print(f"  {len(rows):,} raw rows loaded")

    # Parse
    # recipe_id → set of canonical names
    recipe_to_names: dict[str, set[str]] = defaultdict(set)
    skipped = 0
    for _, recipe_id, raw in rows:
        name = parse_ingredient(raw)
        if name:
            recipe_to_names[recipe_id].add(name)
        else:
            skipped += 1

    # Collect all unique canonical names + count recipes
    name_recipe_count: dict[str, int] = defaultdict(int)
    for names in recipe_to_names.values():
        for n in names:
            name_recipe_count[n] += 1

    print(f"  {len(name_recipe_count):,} unique canonical names")
    print(f"  {skipped:,} rows skipped (unparseable)")

    if args.dry_run:
        print("\n── DRY RUN: top 50 canonical names by recipe count ──")
        for name, cnt in sorted(name_recipe_count.items(), key=lambda x: -x[1])[:50]:
            print(f"  {cnt:5d}  {name}")

        print("\n── DRY RUN: 30 random transformation examples ──")
        import random
        sample = random.sample(rows, min(30, len(rows)))
        for _, _, raw in sample:
            canonical = parse_ingredient(raw)
            print(f"  RAW:  {raw[:90]}")
            print(f"  → {canonical!r}")
            print()
        return

    # Write to DB
    print("\nWriting canonical_ingredients…")
    with engine.begin() as conn:
        conn.execute(text(CREATE_CANONICAL))
        conn.execute(text(CREATE_BRIDGE))

        # Upsert canonical names
        for name, count in name_recipe_count.items():
            conn.execute(text(
                "INSERT INTO canonical_ingredients (name, recipe_count) VALUES (:n, :c) "
                "ON DUPLICATE KEY UPDATE recipe_count = :c"
            ), {"n": name, "c": count})

        # Fetch name→id map
        id_rows = conn.execute(text("SELECT id, name FROM canonical_ingredients")).fetchall()
        name_to_id = {name: id_ for id_, name in id_rows}

        # Write bridge table
        conn.execute(text("TRUNCATE TABLE recipe_canonical_ingredients"))
        batch = []
        for recipe_id, names in recipe_to_names.items():
            for name in names:
                ing_id = name_to_id.get(name)
                if ing_id:
                    batch.append({"r": recipe_id, "i": ing_id})

        # Insert in chunks
        CHUNK = 5000
        for i in range(0, len(batch), CHUNK):
            conn.execute(
                text("INSERT IGNORE INTO recipe_canonical_ingredients (recipe_id, ingredient_id) "
                     "VALUES (:r, :i)"),
                batch[i: i + CHUNK],
            )

    print(f"Done. {len(name_recipe_count):,} canonical ingredients, "
          f"{sum(len(v) for v in recipe_to_names.values()):,} recipe-ingredient links.")


if __name__ == "__main__":
    main()
