#!/usr/bin/env python3
"""
build_cooccurrence.py
─────────────────────
Reads recipe_canonical_ingredients and builds an ingredient_cooccurrence
table — every pair of canonical ingredients that appear together in at
least one recipe, with a count of how many recipes contain both.

Schema created / replaced:
  ingredient_cooccurrence (
      ingredient_a    INT NOT NULL,
      ingredient_b    INT NOT NULL,  -- always ingredient_a < ingredient_b
      recipe_count    INT NOT NULL,
      PRIMARY KEY (ingredient_a, ingredient_b),
      INDEX idx_a_count (ingredient_a, recipe_count DESC),
      INDEX idx_b_count (ingredient_b, recipe_count DESC)
  )

Run:
  python3 tools/build_cooccurrence.py [--dry-run]

  --dry-run   print stats only, do not write to DB
"""

import os
import sys
import argparse
import time
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv()

import sqlalchemy as sa
from sqlalchemy import text

# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true", help="Print stats only, do not write")
args = parser.parse_args()

# ── DB connection ─────────────────────────────────────────────────────────────

engine = sa.create_engine(os.environ["DATABASE_URL"])

# ── Step 1: load all recipe→ingredient mappings ───────────────────────────────

print("Loading recipe_canonical_ingredients …", flush=True)
t0 = time.time()

with engine.connect() as conn:
    rows = conn.execute(
        text("SELECT recipe_id, ingredient_id FROM recipe_canonical_ingredients")
    ).fetchall()

recipe_to_ingredients: dict[str, list[int]] = defaultdict(list)
for recipe_id, ingredient_id in rows:
    recipe_to_ingredients[recipe_id].append(ingredient_id)

print(f"  {len(rows):,} rows across {len(recipe_to_ingredients):,} recipes  ({time.time()-t0:.1f}s)")

# ── Step 2: generate all co-occurring pairs ────────────────────────────────────
# For each recipe, emit every (min_id, max_id) pair of its ingredient list.
# Recipes with only 1 ingredient produce no pairs (nothing to co-occur with).

print("Building co-occurrence counts …", flush=True)
t1 = time.time()

pair_counts: dict[tuple[int, int], int] = defaultdict(int)
skipped_single = 0

for recipe_id, ingredient_ids in recipe_to_ingredients.items():
    # De-duplicate within the recipe (shouldn't happen but be safe)
    unique_ids = sorted(set(ingredient_ids))
    n = len(unique_ids)
    if n < 2:
        skipped_single += 1
        continue
    for i in range(n):
        for j in range(i + 1, n):
            pair_counts[(unique_ids[i], unique_ids[j])] += 1

total_pairs = len(pair_counts)
print(f"  {total_pairs:,} unique pairs  "
      f"(skipped {skipped_single:,} single-ingredient recipes)  "
      f"({time.time()-t1:.1f}s)")

# ── Step 3: print distribution stats ─────────────────────────────────────────

counts = sorted(pair_counts.values(), reverse=True)
if counts:
    p50 = counts[len(counts) // 2]
    p90 = counts[len(counts) // 10]
    p99 = counts[min(len(counts) - 1, len(counts) // 100)]
    print(f"  recipe_count  max={counts[0]}  p90={p90}  p50={p50}  p99-ish={p99}")
    for threshold in [2, 5, 10, 20]:
        above = sum(1 for c in counts if c >= threshold)
        print(f"  pairs with recipe_count >= {threshold:2d}: {above:,}")

if args.dry_run:
    print("\n-- dry-run: stopping before DB write --")
    sys.exit(0)

# ── Step 4: create / replace the table and insert ─────────────────────────────

print("\nCreating ingredient_cooccurrence table …", flush=True)
t2 = time.time()

DDL = """
CREATE TABLE IF NOT EXISTS ingredient_cooccurrence (
    ingredient_a  INT NOT NULL,
    ingredient_b  INT NOT NULL,
    recipe_count  INT NOT NULL,
    PRIMARY KEY (ingredient_a, ingredient_b),
    INDEX idx_a_count (ingredient_a, recipe_count DESC),
    INDEX idx_b_count (ingredient_b, recipe_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

with engine.begin() as conn:
    conn.execute(text(DDL))
    conn.execute(text("TRUNCATE TABLE ingredient_cooccurrence"))

print(f"  Table ready  ({time.time()-t2:.1f}s)")

# ── Step 5: bulk-insert in chunks of 10,000 ───────────────────────────────────

CHUNK = 10_000
print(f"Inserting {total_pairs:,} pairs …", flush=True)
t3 = time.time()

pairs_list = [
    {"ingredient_a": a, "ingredient_b": b, "recipe_count": c}
    for (a, b), c in pair_counts.items()
]

inserted = 0
with engine.begin() as conn:
    for offset in range(0, len(pairs_list), CHUNK):
        batch = pairs_list[offset : offset + CHUNK]
        conn.execute(
            text(
                "INSERT INTO ingredient_cooccurrence "
                "(ingredient_a, ingredient_b, recipe_count) "
                "VALUES (:ingredient_a, :ingredient_b, :recipe_count)"
            ),
            batch,
        )
        inserted += len(batch)
        if inserted % 50_000 == 0 or inserted == total_pairs:
            print(f"  {inserted:,} / {total_pairs:,} …", flush=True)

print(f"Done — {inserted:,} rows written  ({time.time()-t3:.1f}s total insert)")
print(f"Total elapsed: {time.time()-t0:.1f}s")
