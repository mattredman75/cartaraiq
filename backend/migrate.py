"""
One-time migration script.

Adds the shopping_lists table and the list_id / sort_order columns to
list_items. On MySQL/MariaDB the checked column is already TINYINT(1)
which accepts 0/1/2 — no type change needed there.

Safe to run multiple times.

Usage (from the cartaraiq/ directory):
    python -m backend.migrate
"""

from sqlalchemy import text
from .database import engine


def _col_exists(conn, table: str, column: str) -> bool:
    return conn.execute(text("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name   = :tbl
          AND column_name  = :col
    """), {"tbl": table, "col": column}).scalar() > 0


def _index_exists(conn, table: str, index: str) -> bool:
    return conn.execute(text("""
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name   = :tbl
          AND index_name   = :idx
    """), {"tbl": table, "idx": index}).scalar() > 0


def _table_exists(conn, table: str) -> bool:
    return conn.execute(text("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name   = :tbl
    """), {"tbl": table}).scalar() > 0


def run() -> None:
    dialect = engine.dialect.name  # 'mysql' or 'postgresql'

    with engine.connect() as conn:
        if dialect == "mysql":
            _run_mysql(conn)
            _run_mysql_ingredient_pairings(conn)
        else:
            _run_postgresql(conn)
            _run_postgresql_ingredient_pairings(conn)

        conn.commit()

    print("Migration complete.")


# ── MySQL / MariaDB ───────────────────────────────────────────────────────────

def _run_mysql(conn) -> None:
    # 1. Create shopping_lists (MariaDB needs VARCHAR lengths + DATETIME)
    if not _table_exists(conn, "shopping_lists"):
        conn.execute(text("""
            CREATE TABLE shopping_lists (
                id         VARCHAR(36)  NOT NULL PRIMARY KEY,
                user_id    VARCHAR(36)  NOT NULL,
                name       VARCHAR(255) NOT NULL DEFAULT 'My List',
                created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))

    if not _index_exists(conn, "shopping_lists", "ix_shopping_lists_user_id"):
        conn.execute(text("""
            CREATE INDEX ix_shopping_lists_user_id ON shopping_lists(user_id)
        """))

    # 2. Add list_id FK column to list_items
    if not _col_exists(conn, "list_items", "list_id"):
        conn.execute(text("""
            ALTER TABLE list_items ADD COLUMN list_id VARCHAR(36)
        """))

    if not _index_exists(conn, "list_items", "ix_list_items_list_id"):
        conn.execute(text("""
            CREATE INDEX ix_list_items_list_id ON list_items(list_id)
        """))

    # 3. Add sort_order column
    if not _col_exists(conn, "list_items", "sort_order"):
        conn.execute(text("""
            ALTER TABLE list_items ADD COLUMN sort_order INTEGER
        """))

    # 4. checked column: MySQL/MariaDB BOOLEAN is TINYINT(1), which already
    #    stores 0/1/2 correctly. SQLAlchemy Integer reads TINYINT as an int.
    #    No column type change needed.

    # 5. Password reset columns on users
    if not _col_exists(conn, "users", "reset_token"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL
        """))

    if not _col_exists(conn, "users", "reset_token_expiry"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME NULL
        """))


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _run_postgresql(conn) -> None:
    # 1. Create shopping_lists
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS shopping_lists (
            id         VARCHAR     PRIMARY KEY,
            user_id    VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name       VARCHAR     NOT NULL DEFAULT 'My List',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_shopping_lists_user_id
            ON shopping_lists(user_id)
    """))

    # 2. Add list_id column
    conn.execute(text("""
        ALTER TABLE list_items
            ADD COLUMN IF NOT EXISTS list_id VARCHAR
                REFERENCES shopping_lists(id) ON DELETE SET NULL
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_list_items_list_id
            ON list_items(list_id)
    """))

    # 3. Add sort_order column
    conn.execute(text("""
        ALTER TABLE list_items
            ADD COLUMN IF NOT EXISTS sort_order INTEGER
    """))

    # 4. Password reset columns on users
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255) NULL
    """))
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ NULL
    """))

    # 5. Convert checked from Boolean to Integer if needed
    col_type = conn.execute(text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'list_items' AND column_name = 'checked'
    """)).scalar()
    if col_type and col_type.lower() == "boolean":
        conn.execute(text("""
            ALTER TABLE list_items
                ALTER COLUMN checked TYPE INTEGER
                USING CASE WHEN checked THEN 1 ELSE 0 END
        """))


def _run_mysql_ingredient_pairings(conn) -> None:
    if not _table_exists(conn, "ingredient_pairings"):
        conn.execute(text("""
            CREATE TABLE ingredient_pairings (
                base_ingredient   VARCHAR(100) NOT NULL,
                paired_ingredient VARCHAR(100) NOT NULL,
                co_occurrence_count INTEGER     NOT NULL DEFAULT 1,
                fetched_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (base_ingredient, paired_ingredient)
            )
        """))
    if not _index_exists(conn, "ingredient_pairings", "ix_ingredient_pairings_base"):
        conn.execute(text("""
            CREATE INDEX ix_ingredient_pairings_base
                ON ingredient_pairings(base_ingredient, fetched_at)
        """))


def _run_postgresql_ingredient_pairings(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ingredient_pairings (
            base_ingredient   VARCHAR(100) NOT NULL,
            paired_ingredient VARCHAR(100) NOT NULL,
            co_occurrence_count INTEGER    NOT NULL DEFAULT 1,
            fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (base_ingredient, paired_ingredient)
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_ingredient_pairings_base
            ON ingredient_pairings(base_ingredient, fetched_at)
    """))


if __name__ == "__main__":
    run()
