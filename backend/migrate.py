"""
One-time migration script.

Adds the shopping_lists table and the list_id FK column to list_items.
Safe to run multiple times (all operations use IF NOT EXISTS / IF EXISTS checks).

Usage (from the cartaraiq/ directory):
    python -m backend.migrate
"""

from sqlalchemy import text
from .database import engine


def run() -> None:
    with engine.connect() as conn:
        # 1. Create shopping_lists table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shopping_lists (
                id       VARCHAR PRIMARY KEY,
                user_id  VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name     VARCHAR NOT NULL DEFAULT 'My List',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_shopping_lists_user_id
                ON shopping_lists(user_id)
        """))

        # 2. Add list_id column to list_items (no-op if already present)
        conn.execute(text("""
            ALTER TABLE list_items
                ADD COLUMN IF NOT EXISTS list_id VARCHAR
                    REFERENCES shopping_lists(id) ON DELETE SET NULL
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_list_items_list_id
                ON list_items(list_id)
        """))

        # 3. Add sort_order column to list_items (no-op if already present)
        conn.execute(text("""
            ALTER TABLE list_items
                ADD COLUMN IF NOT EXISTS sort_order INTEGER
        """))

        # 4. Convert checked from Boolean to Integer (no-op if already integer)
        col_type = conn.execute(text("""
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'list_items' AND column_name = 'checked'
        """)).scalar()
        if col_type and col_type.lower() == 'boolean':
            conn.execute(text("""
                ALTER TABLE list_items
                    ALTER COLUMN checked TYPE INTEGER
                    USING CASE WHEN checked THEN 1 ELSE 0 END
            """))

        conn.commit()

    print("Migration complete.")


if __name__ == "__main__":
    run()
