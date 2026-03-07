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
    # 0. Create app_admin table for maintenance mode
    if not _table_exists(conn, "app_admin"):
        conn.execute(text("""
            CREATE TABLE app_admin (
                id        INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
                `key`     VARCHAR(255)  NOT NULL UNIQUE,
                value     TINYINT(1)    NOT NULL DEFAULT 0,
                message   TEXT          NULL,
                updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """))
        # Seed default maintenance_mode record
        conn.execute(text("""
            INSERT INTO app_admin (`key`, value, message)
            VALUES ('maintenance_mode', 0, 'We are currently performing scheduled maintenance. Please check back soon.')
        """))

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

    # 6. Biometric authentication columns on users
    if not _col_exists(conn, "users", "biometric_enabled"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN biometric_enabled TINYINT(1) NOT NULL DEFAULT 0
        """))

    if not _col_exists(conn, "users", "biometric_pin_hash"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN biometric_pin_hash VARCHAR(255) NULL
        """))

    if not _col_exists(conn, "users", "biometric_type"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN biometric_type VARCHAR(50) NULL
        """))

    # 7. Push tokens table for Expo push notifications
    if not _table_exists(conn, "push_tokens"):
        conn.execute(text("""
            CREATE TABLE push_tokens (
                id         VARCHAR(36)  NOT NULL PRIMARY KEY,
                user_id    VARCHAR(36)  NOT NULL,
                token      VARCHAR(255) NOT NULL UNIQUE,
                created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX ix_push_tokens_user_id (user_id),
                INDEX ix_push_tokens_token (token),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """))

    # 8. Role column on users (admin / user)
    if not _col_exists(conn, "users", "role"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'
        """))

    # 9. Social auth columns on users
    if not _col_exists(conn, "users", "auth_provider"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NULL
        """))

    if not _col_exists(conn, "users", "auth_provider_id"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN auth_provider_id VARCHAR(255) NULL
        """))
        conn.execute(text("""
            CREATE INDEX ix_users_auth_provider_id ON users(auth_provider_id)
        """))

    # 10. Make hashed_password nullable (social auth users have no password)
    conn.execute(text("""
        ALTER TABLE users MODIFY COLUMN hashed_password VARCHAR(255) NULL
    """))

    # 11. Refresh token columns on users (persistent sessions)
    if not _col_exists(conn, "users", "refresh_token"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN refresh_token VARCHAR(255) NULL
        """))
        conn.execute(text("""
            CREATE INDEX ix_users_refresh_token ON users(refresh_token)
        """))

    if not _col_exists(conn, "users", "refresh_token_expiry"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN refresh_token_expiry DATETIME NULL
        """))

    # 12. is_active flag for user blocking
    if not _col_exists(conn, "users", "is_active"):
        conn.execute(text("""
            ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1
        """))

    # 13. Audit logs table
    if not _table_exists(conn, "audit_logs"):
        conn.execute(text("""
            CREATE TABLE audit_logs (
                id         VARCHAR(36)  NOT NULL PRIMARY KEY,
                user_id    VARCHAR(36)  NULL,
                action     VARCHAR(100) NOT NULL,
                detail     TEXT         NULL,
                ip_address VARCHAR(45)  NULL,
                user_agent VARCHAR(500) NULL,
                status     VARCHAR(20)  NOT NULL DEFAULT 'success',
                created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX ix_audit_logs_user_id (user_id),
                INDEX ix_audit_logs_action (action),
                INDEX ix_audit_logs_created_at (created_at)
            )
        """))

    # 14. Test runs table (persisted test-suite results)
    if not _table_exists(conn, "test_runs"):
        conn.execute(text("""
            CREATE TABLE test_runs (
                id               VARCHAR(36)  NOT NULL PRIMARY KEY,
                suite            VARCHAR(20)  NOT NULL,
                status           VARCHAR(20)  NOT NULL DEFAULT 'running',
                passed           INT          NOT NULL DEFAULT 0,
                failed           INT          NOT NULL DEFAULT 0,
                skipped          INT          NOT NULL DEFAULT 0,
                errors           INT          NOT NULL DEFAULT 0,
                total            INT          NOT NULL DEFAULT 0,
                coverage         DOUBLE       NULL,
                duration         DOUBLE       NULL,
                output           LONGTEXT     NULL,
                stderr           LONGTEXT     NULL,
                error_message    TEXT         NULL,
                failed_tests_json TEXT        NULL,
                triggered_by     VARCHAR(36)  NULL,
                created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX ix_test_runs_suite (suite),
                INDEX ix_test_runs_created_at (created_at)
            )
        """))


# ── PostgreSQL ────────────────────────────────────────────────────────────────

def _run_postgresql(conn) -> None:
    # 0. Create app_admin table for maintenance mode
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS app_admin (
            id        SERIAL PRIMARY KEY,
            key       VARCHAR(255) NOT NULL UNIQUE,
            value     BOOLEAN      NOT NULL DEFAULT FALSE,
            message   TEXT         NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    # Seed default maintenance_mode record if not exists
    conn.execute(text("""
        INSERT INTO app_admin (key, value, message)
        VALUES ('maintenance_mode', FALSE, 'We are currently performing scheduled maintenance. Please check back soon.')
        ON CONFLICT (key) DO NOTHING
    """))

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

    # 5. Biometric authentication columns on users
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE
    """))
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS biometric_pin_hash VARCHAR(255) NULL
    """))
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS biometric_type VARCHAR(50) NULL
    """))

    # 6. Push tokens table for Expo push notifications
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            id         VARCHAR(36)  NOT NULL PRIMARY KEY,
            user_id    VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token      VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_push_tokens_user_id ON push_tokens(user_id)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_push_tokens_token ON push_tokens(token)
    """))

    # 7. Role column on users (admin / user)
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    """))

    # 8. Social auth columns on users
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NULL
    """))
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS auth_provider_id VARCHAR(255) NULL
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_users_auth_provider_id ON users(auth_provider_id)
    """))
    conn.execute(text("""
        ALTER TABLE users
            ALTER COLUMN hashed_password DROP NOT NULL
    """))

    # 9. Refresh token columns on users (persistent sessions)
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255) NULL
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_users_refresh_token ON users(refresh_token)
    """))
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS refresh_token_expiry TIMESTAMPTZ NULL
    """))

    # 7. Convert checked from Boolean to Integer if needed
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

    # 10. is_active flag for user blocking
    conn.execute(text("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
    """))

    # 11. Audit logs table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id         VARCHAR(36)  NOT NULL PRIMARY KEY,
            user_id    VARCHAR(36)  NULL,
            action     VARCHAR(100) NOT NULL,
            detail     TEXT         NULL,
            ip_address VARCHAR(45)  NULL,
            user_agent VARCHAR(500) NULL,
            status     VARCHAR(20)  NOT NULL DEFAULT 'success',
            created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at)
    """))

    # 12. Test runs table (persisted test-suite results)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS test_runs (
            id               VARCHAR(36)  NOT NULL PRIMARY KEY,
            suite            VARCHAR(20)  NOT NULL,
            status           VARCHAR(20)  NOT NULL DEFAULT 'running',
            passed           INT          NOT NULL DEFAULT 0,
            failed           INT          NOT NULL DEFAULT 0,
            skipped          INT          NOT NULL DEFAULT 0,
            errors           INT          NOT NULL DEFAULT 0,
            total            INT          NOT NULL DEFAULT 0,
            coverage         DOUBLE PRECISION NULL,
            duration         DOUBLE PRECISION NULL,
            output           TEXT         NULL,
            stderr           TEXT         NULL,
            error_message    TEXT         NULL,
            failed_tests_json TEXT        NULL,
            triggered_by     VARCHAR(36)  NULL,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_test_runs_suite ON test_runs(suite)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_test_runs_created_at ON test_runs(created_at)
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
