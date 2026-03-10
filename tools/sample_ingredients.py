#!/usr/bin/env python3
"""Sample ingredient strings from the DB and catalogue noise patterns."""
import os, re
from dotenv import load_dotenv
load_dotenv()
import sqlalchemy as sa

engine = sa.create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    rows = conn.execute(
        sa.text("SELECT raw_text FROM ar_ingredients ORDER BY RAND() LIMIT 1000")
    ).fetchall()

texts = [r[0] for r in rows]

patterns = {
    "parenthetical":   sum(1 for t in texts if "(" in t),
    "comma_prep":      sum(1 for t in texts if re.search(
        r",\s*(chopped|sliced|diced|minced|grated|peeled|divided|cut|rinsed|"
        r"drained|thawed|softened|melted|beaten|shredded|crushed|halved|trimmed|"
        r"separated|sifted|toasted|roasted|coarsely|finely|thinly|roughly)", t, re.I)),
    "OR_alternatives": sum(1 for t in texts if " or " in t.lower()),
    "brand_product":   sum(1 for t in texts if re.search(
        r"®|™|\bCampbell|\bNewman|\bSwanson|\bCrosse|\bMacLaren|\bHeinz|\bKraft", t)),
    "starts_with_qty": sum(1 for t in texts if re.match(r"^\d", t)),
    "unicode_fraction":sum(1 for t in texts if re.match(r"^[¼½¾⅓⅔⅛⅜⅝⅞]", t)),
    "slash_fraction":  sum(1 for t in texts if re.match(r"^\d+\s*/\s*\d+", t)),
    "paren_with_about":sum(1 for t in texts if re.search(r"\(about", t, re.I)),
    "temp_instructions":sum(1 for t in texts if re.search(
        r"degree|heated to|\bF\b|\bC\b|°F|°C|150 F|deactivate", t)),
    "such_as":         sum(1 for t in texts if re.search(r"\(such as|\bsuch as\b", t, re.I)),
    "len_over_80":     sum(1 for t in texts if len(t) > 80),
    "len_30_to_80":    sum(1 for t in texts if 30 <= len(t) <= 80),
    "len_under_30":    sum(1 for t in texts if len(t) < 30),
}

print("NOISE PATTERNS (out of 1000 samples):")
for k, v in sorted(patterns.items(), key=lambda x: -x[1]):
    print(f"  {k:<26} {v:>5}  ({v/10:.1f}%)")

print()
print("=== LONGEST 25 ===")
for t in sorted(texts, key=len, reverse=True)[:25]:
    print(f"  [{len(t):3d}]  {t[:130]}")

print()
print("=== OR-ALTERNATIVES SAMPLE (15) ===")
or_examples = [t for t in texts if " or " in t.lower()][:15]
for t in or_examples:
    print(f"  {t[:130]}")

print()
print("=== COMMA-PREP SAMPLE (15) ===")
cp_examples = [t for t in texts if re.search(
    r",\s*(chopped|sliced|diced|minced|grated|peeled|divided|cut)", t, re.I)][:15]
for t in cp_examples:
    print(f"  {t[:130]}")

print()
print("=== CLEAN SHORT SAMPLE (20) ===")
clean = [t for t in texts if len(t) < 30 and "(" not in t and re.match(r"^\d", t)]
for t in sorted(set(clean))[:20]:
    print(f"  {t}")
