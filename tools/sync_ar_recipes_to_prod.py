#!/usr/bin/env python3
"""
sync_ar_recipes_to_prod.py
──────────────────────────
Copies the AR recipe tables from local DB to production:
  ar_recipes
  ar_tags
  ar_recipe_tags
  ar_ingredients
  ar_steps

PREFERRED METHOD — pipe mysqldump directly through SSH (no direct MySQL
access required from dev machine):

  mysqldump --no-tablespaces --no-create-info --skip-lock-tables --set-gtid-purged=OFF \\
    -u cartaraiq_admin -p'c@rt@r@4dm1n!' \\
    cartaraiq ar_recipes ar_tags ar_recipe_tags ar_ingredients ar_steps \\
    | ssh -p 1988 tcai "mysql -u tradecom_cartaraiq_admin -p'cartara_mysql_user-123QWE!' tradecom_cartaraiq"

Truncate prod tables first if needed:
  mysql -u tradecom_cartaraiq_admin -p'cartara_mysql_user-123QWE!' tradecom_cartaraiq \\
    -e "SET FOREIGN_KEY_CHECKS=0; TRUNCATE ar_recipe_tags; TRUNCATE ar_ingredients; TRUNCATE ar_steps; TRUNCATE ar_recipes; TRUNCATE ar_tags; SET FOREIGN_KEY_CHECKS=1;"

This Python script is a fallback if direct MySQL access from dev is available.
Run from the workspace root with the venv active:
  python3 tools/sync_ar_recipes_to_prod.py
"""

import os, sys, time
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import sqlalchemy as sa
from sqlalchemy import text

LOCAL_URL = os.environ["DATABASE_URL"]
PROD_URL  = "mysql+pymysql://tradecom_cartaraiq_admin:cartara_mysql_user-123QWE!@ssh.cartaraiq.app:3306/tradecom_cartaraiq"

local_engine = sa.create_engine(LOCAL_URL)
prod_engine  = sa.create_engine(PROD_URL, connect_args={"connect_timeout": 30})

CHUNK = 2_000

DDL = {
    "ar_recipes": """
        CREATE TABLE IF NOT EXISTS `ar_recipes` (
          `id` varchar(36) NOT NULL,
          `recipe_db_id` varchar(36) NOT NULL,
          `name` varchar(500) NOT NULL,
          `description` text,
          `image_url` text,
          `prep_mins` smallint DEFAULT NULL,
          `cook_mins` smallint DEFAULT NULL,
          `total_mins` smallint DEFAULT NULL,
          `servings` smallint DEFAULT NULL,
          `calories` smallint DEFAULT NULL,
          `fat_g` decimal(6,1) DEFAULT NULL,
          `carbs_g` decimal(6,1) DEFAULT NULL,
          `protein_g` decimal(6,1) DEFAULT NULL,
          `fetched_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `recipe_db_id` (`recipe_db_id`),
          KEY `ix_ar_recipes_recipe_db_id` (`recipe_db_id`),
          KEY `ix_ar_recipes_name` (`name`(250)),
          KEY `ix_ar_recipes_total_mins` (`total_mins`),
          KEY `ix_ar_recipes_calories` (`calories`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "ar_tags": """
        CREATE TABLE IF NOT EXISTS `ar_tags` (
          `id` int unsigned NOT NULL AUTO_INCREMENT,
          `slug` varchar(100) NOT NULL,
          `name` varchar(100) NOT NULL,
          `tag_type` varchar(20) NOT NULL DEFAULT 'other',
          PRIMARY KEY (`id`),
          UNIQUE KEY `slug` (`slug`),
          KEY `ix_ar_tags_slug` (`slug`),
          KEY `ix_ar_tags_tag_type` (`tag_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "ar_recipe_tags": """
        CREATE TABLE IF NOT EXISTS `ar_recipe_tags` (
          `recipe_id` varchar(36) NOT NULL,
          `tag_id` int unsigned NOT NULL,
          PRIMARY KEY (`recipe_id`, `tag_id`),
          KEY `ix_ar_recipe_tags_tag_id` (`tag_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "ar_ingredients": """
        CREATE TABLE IF NOT EXISTS `ar_ingredients` (
          `id` int unsigned NOT NULL AUTO_INCREMENT,
          `recipe_id` varchar(36) NOT NULL,
          `sort_order` tinyint NOT NULL DEFAULT '0',
          `raw_text` varchar(500) NOT NULL,
          PRIMARY KEY (`id`),
          KEY `ix_ar_ingredients_recipe_id` (`recipe_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    "ar_steps": """
        CREATE TABLE IF NOT EXISTS `ar_steps` (
          `id` int unsigned NOT NULL AUTO_INCREMENT,
          `recipe_id` varchar(36) NOT NULL,
          `step_number` tinyint NOT NULL,
          `instruction` text NOT NULL,
          PRIMARY KEY (`id`),
          KEY `ix_ar_steps_recipe_id` (`recipe_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
}

# Sync order matters: ar_recipes first (others reference its id)
TABLES = ["ar_recipes", "ar_tags", "ar_recipe_tags", "ar_ingredients", "ar_steps"]


def sync_table(table: str, local_conn, prod_conn):
    # Ensure table exists on prod
    prod_conn.execute(text(DDL[table]))
    prod_conn.commit()

    prod_count = prod_conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
    local_count = local_conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
    print(f"\n{table}: local={local_count:,}  prod={prod_count:,}")

    if prod_count >= local_count:
        print(f"  ✓ already up-to-date, skipping")
        return

    # Truncate and reload
    print(f"  truncating prod…")
    prod_conn.execute(text(f"SET FOREIGN_KEY_CHECKS=0"))
    prod_conn.execute(text(f"TRUNCATE TABLE {table}"))
    prod_conn.execute(text(f"SET FOREIGN_KEY_CHECKS=1"))
    prod_conn.commit()

    cols_result = local_conn.execute(text(f"SELECT * FROM {table} LIMIT 0"))
    cols = list(cols_result.keys())
    placeholders = ", ".join(f":{c}" for c in cols)
    insert_sql = text(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})")

    offset = 0
    total_inserted = 0
    t0 = time.time()

    while True:
        rows = local_conn.execute(
            text(f"SELECT * FROM {table} LIMIT {CHUNK} OFFSET {offset}")
        ).fetchall()
        if not rows:
            break

        batch = [dict(zip(cols, row)) for row in rows]
        prod_conn.execute(insert_sql, batch)
        prod_conn.commit()

        total_inserted += len(rows)
        elapsed = time.time() - t0
        print(f"  inserted {total_inserted:,}/{local_count:,}  ({elapsed:.1f}s)", end="\r")
        offset += CHUNK

    print(f"\n  ✓ done — {total_inserted:,} rows in {time.time()-t0:.1f}s")


def main():
    print("Connecting to local and prod databases…")
    with local_engine.connect() as lc, prod_engine.connect() as pc:
        for table in TABLES:
            sync_table(table, lc, pc)
    print("\nAll AR recipe tables synced to prod ✓")


if __name__ == "__main__":
    main()
