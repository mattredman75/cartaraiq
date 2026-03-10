#!/usr/bin/env python3
"""
sync_canonical_to_prod.py
─────────────────────────
Copies three tables from the local DB to the production DB:
  canonical_ingredients
  recipe_canonical_ingredients
  ingredient_cooccurrence

Run from the workspace root with the venv active:
  python3 tools/sync_canonical_to_prod.py
"""

import os, sys, time
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import sqlalchemy as sa
from sqlalchemy import text

LOCAL_URL  = os.environ["DATABASE_URL"]
PROD_URL   = "mysql+pymysql://tradecom_cartaraiq_admin:cartara_mysql_user-123QWE!@ssh.cartaraiq.app:3306/tradecom_cartaraiq"

local_engine = sa.create_engine(LOCAL_URL)
prod_engine  = sa.create_engine(PROD_URL)

CHUNK = 5_000

DDL = {
    "canonical_ingredients": """
        CREATE TABLE IF NOT EXISTS canonical_ingredients (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            name         VARCHAR(300) NOT NULL UNIQUE,
            recipe_count INT NOT NULL DEFAULT 0,
            INDEX idx_name (name),
            INDEX idx_recipe_count (recipe_count DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "recipe_canonical_ingredients": """
        CREATE TABLE IF NOT EXISTS recipe_canonical_ingredients (
            recipe_id     VARCHAR(50) NOT NULL,
            ingredient_id INT         NOT NULL,
            PRIMARY KEY (recipe_id, ingredient_id),
            INDEX idx_ingredient (ingredient_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "ingredient_cooccurrence": """
        CREATE TABLE IF NOT EXISTS ingredient_cooccurrence (
            ingredient_a  INT NOT NULL,
            ingredient_b  INT NOT NULL,
            recipe_count  INT NOT NULL,
            PRIMARY KEY (ingredient_a, ingredient_b),
            INDEX idx_a_count (ingredient_a, recipe_count DESC),
            INDEX idx_b_count (ingredient_b, recipe_count DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
}


def sync_table(table: str, select_sql: str, insert_sql: str, prod_conn):
    print(f"\n── {table} ──")
    t0 = time.time()

    with local_engine.connect() as lc:
        rows = lc.execute(text(select_sql)).fetchall()

    print(f"  {len(rows):,} rows from local")

    prod_conn.execute(text(DDL[table]))
    prod_conn.execute(text(f"TRUNCATE TABLE {table}"))

    for offset in range(0, len(rows), CHUNK):
        batch = rows[offset : offset + CHUNK]
        prod_conn.execute(text(insert_sql), [dict(r._mapping) for r in batch])
        if (offset + CHUNK) % 50_000 == 0 or offset + CHUNK >= len(rows):
            print(f"  {min(offset+CHUNK, len(rows)):,} / {len(rows):,} …")

    print(f"  Done  ({time.time()-t0:.1f}s)")


with prod_engine.begin() as pc:
    sync_table(
        "canonical_ingredients",
        "SELECT id, name, recipe_count FROM canonical_ingredients",
        "INSERT INTO canonical_ingredients (id, name, recipe_count) VALUES (:id, :name, :recipe_count)",
        pc,
    )

    sync_table(
        "recipe_canonical_ingredients",
        "SELECT recipe_id, ingredient_id FROM recipe_canonical_ingredients",
        "INSERT IGNORE INTO recipe_canonical_ingredients (recipe_id, ingredient_id) VALUES (:recipe_id, :ingredient_id)",
        pc,
    )

    sync_table(
        "ingredient_cooccurrence",
        "SELECT ingredient_a, ingredient_b, recipe_count FROM ingredient_cooccurrence",
        "INSERT INTO ingredient_cooccurrence (ingredient_a, ingredient_b, recipe_count) VALUES (:ingredient_a, :ingredient_b, :recipe_count)",
        pc,
    )

print("\nAll three tables synced to production.")
