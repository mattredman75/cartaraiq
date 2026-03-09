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
    with engine.connect() as conn:
        _run_mysql(conn)
        _run_mysql_ingredient_pairings(conn)
        _run_mysql_loyalty_programs(conn)
        _run_mysql_list_shares(conn)
        _run_mysql_recipes_db(conn)
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

    # Test runs table: add coverage metrics columns (if not already present)
    if _table_exists(conn, "test_runs"):
        if not _col_exists(conn, "test_runs", "coverage_statements"):
            conn.execute(text("ALTER TABLE test_runs ADD COLUMN coverage_statements DOUBLE NULL"))
        if not _col_exists(conn, "test_runs", "coverage_branches"):
            conn.execute(text("ALTER TABLE test_runs ADD COLUMN coverage_branches DOUBLE NULL"))
        if not _col_exists(conn, "test_runs", "coverage_functions"):
            conn.execute(text("ALTER TABLE test_runs ADD COLUMN coverage_functions DOUBLE NULL"))
        if not _col_exists(conn, "test_runs", "coverage_lines"):
            conn.execute(text("ALTER TABLE test_runs ADD COLUMN coverage_lines DOUBLE NULL"))

    # 15. Performance indexes
    # list_items: composite (user_id, checked) — covers every list view, suggestion,
    #             and add-item dedup query that filters on both columns together.
    if not _index_exists(conn, "list_items", "ix_list_items_user_checked"):
        conn.execute(text("""
            CREATE INDEX ix_list_items_user_checked ON list_items(user_id, checked)
        """))

    # list_items: last_added_at — unblocks co-occurrence hourly rebuild from full scan
    if not _index_exists(conn, "list_items", "ix_list_items_last_added_at"):
        conn.execute(text("""
            CREATE INDEX ix_list_items_last_added_at ON list_items(last_added_at)
        """))

    # list_items: times_added — used alongside last_added_at in prediction queries
    if not _index_exists(conn, "list_items", "ix_list_items_times_added"):
        conn.execute(text("""
            CREATE INDEX ix_list_items_times_added ON list_items(times_added)
        """))

    # users: created_at — admin dashboard fires 6+ range scans per load
    if not _index_exists(conn, "users", "ix_users_created_at"):
        conn.execute(text("""
            CREATE INDEX ix_users_created_at ON users(created_at)
        """))

    # users: is_active — used on most write paths and all dashboard aggregates
    if not _index_exists(conn, "users", "ix_users_is_active"):
        conn.execute(text("""
            CREATE INDEX ix_users_is_active ON users(is_active)
        """))

    # users: auth_provider — social login compound lookup with auth_provider_id
    if not _index_exists(conn, "users", "ix_users_auth_provider"):
        conn.execute(text("""
            CREATE INDEX ix_users_auth_provider ON users(auth_provider)
        """))

    # audit_logs: status — security dashboard and audit log browser filter by status;
    #             audit_logs grows unboundedly so this is performance-critical.
    if not _index_exists(conn, "audit_logs", "ix_audit_logs_status"):
        conn.execute(text("""
            CREATE INDEX ix_audit_logs_status ON audit_logs(status)
        """))


# ── Loyalty Programs ──────────────────────────────────────────────────────────

def _run_mysql_loyalty_programs(conn) -> None:
    """Create loyalty_programs table and seed with known AU/NZ programs."""
    import json as _json

    if not _table_exists(conn, "loyalty_programs"):
        conn.execute(text("""
            CREATE TABLE loyalty_programs (
                id               VARCHAR(36)   NOT NULL PRIMARY KEY,
                slug             VARCHAR(255)  NOT NULL UNIQUE,
                name             VARCHAR(255)  NOT NULL,
                logo_url         VARCHAR(1000) NULL,
                logo_background  VARCHAR(20)   NULL,
                detection_rules  TEXT          NOT NULL,
                is_active        TINYINT(1)    NOT NULL DEFAULT 1,
                sort_order       INT           NOT NULL DEFAULT 0,
                created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX ix_loyalty_programs_slug (slug),
                INDEX ix_loyalty_programs_is_active (is_active)
            )
        """))

        # Seed all known programs — detection_rules can be refined via admin
        programs = [
            # AU programs
            ("7-eleven-my-7-eleven",           "7-Eleven My 7-Eleven",            [], 0),
            ("accor-live-limitless-all",        "Accor Live Limitless (ALL)",       [], 0),
            ("adairs-linen-lovers",             "Adairs Linen Lovers",             [], 0),
            ("airasia-rewards",                 "AirAsia Rewards",                 [], 0),
            ("amcal-rewards",                   "Amcal Rewards",                   [], 0),
            ("anaconda-adventure-club",         "Anaconda Adventure Club",         [], 0),
            ("autobarn-autoclub",               "Autobarn AutoClub",               [], 0),
            ("bakers-delight-dough-getters",    "Bakers Delight Dough Getters",    [], 0),
            ("barbeques-galore-flame-rewards",  "Barbeques Galore Flame Rewards",  [], 0),
            ("bcf-club",                        "BCF Club",                        [], 0),
            ("big-w-everyday-rewards",          "Big W (Everyday Rewards)",        ["9400", "94009", "940090"], 0),
            ("boost-juice-vibe-club",           "Boost Juice Vibe Club",           [], 0),
            ("bp-rewards",                      "BP Rewards",                      [], 0),
            ("bunnings-powerpass",              "Bunnings PowerPass",              [], 0),
            ("bws-on-tap",                      "BWS On Tap",                      [], 0),
            ("camera-house-club",               "Camera House Club",               [], 0),
            ("chemist-warehouse-rewards",       "Chemist Warehouse Rewards",       [], 0),
            ("city-beach-rewards",              "City Beach Rewards",              [], 0),
            ("coles-flybuys",                   "Coles (Flybuys)",                 ["6014", "601435", "601436"], 0),
            ("costco-membership",               "Costco Membership",               [], 0),
            ("cotton-on-perks",                 "Cotton On Perks",                 [], 0),
            ("dan-murphy-s-my-dan-s",           "Dan Murphy's My Dan's",           [], 0),
            ("david-jones-rewards",             "David Jones Rewards",             [], 0),
            ("domino-s-rewards",                "Domino's Rewards",                [], 0),
            ("donut-king-royalty",              "Donut King Royalty",              [], 0),
            ("eb-games-level-up",               "EB Games Level Up",               [], 0),
            ("everyday-rewards-woolworths",     "Everyday Rewards (Woolworths)",   ["9400", "94009", "940090"], 0),
            ("event-cinemas-cinebuzz",          "Event Cinemas Cinebuzz",          [], 0),
            ("fantastic-furniture-club",        "Fantastic Furniture Club",        [], 0),
            ("farmers-au-stores",               "Farmers (AU stores)",             [], 0),
            ("first-choice-liquor-flybuys",     "First Choice Liquor (Flybuys)",   ["6014", "601435", "601436"], 0),
            ("flight-centre-rewards",           "Flight Centre Rewards",           [], 0),
            ("flybuys",                         "Flybuys",                         ["6014", "601435", "601436"], [16], ["code128"], "https://www.mycar.com.au/media/wysiwyg/flybuys-Card.png", "#E4002B", 0),
            ("freedom-myfreedom",               "Freedom MyFreedom",               [], 0),
            ("gloria-jean-s-esipper-rewards",   "Gloria Jean's eSipper Rewards",   [], 0),
            ("grill-d-relish",                  "Grill'd Relish",                  [], 0),
            ("guzman-y-gomez-gomex",            "Guzman y Gomez GOMEX",            [], 0),
            ("harvey-norman-rewards",           "Harvey Norman Rewards",           [], 0),
            ("hoyts-rewards",                   "Hoyts Rewards",                   [], 0),
            ("hungry-jack-s-shake-win",         "Hungry Jack's Shake & Win",       [], 0),
            ("ikea-family-au",                  "IKEA Family (AU)",                [], 0),
            ("jb-hi-fi-perks",                  "JB Hi-Fi Perks",                  [], 0),
            ("kathmandu-summit-club",           "Kathmandu Summit Club",           [], 0),
            ("kfc-australia",                   "KFC Australia",                   [], 0),
            ("kmart-flybuys",                   "Kmart (Flybuys)",                 ["6014", "601435", "601436"], 0),
            ("liquorland-flybuys",              "Liquorland (Flybuys)",            ["6014", "601435", "601436"], 0),
            ("mcdonald-s-mymaccas",             "McDonald's MyMaccas",             [], 0),
            ("michael-hill-brilliance",         "Michael Hill Brilliance",         [], 0),
            ("millers-rewards",                 "Millers Rewards",                 [], 0),
            ("mimco-mimcollective",             "Mimco MIMCollective",             [], 0),
            ("mitre-10-au",                     "Mitre 10 (AU)",                   [], 0),
            ("muffin-break-loyalty",            "Muffin Break Loyalty",            [], 0),
            ("myer-one",                        "Myer One",                        ["7083", "708310"], 0),
            ("nando-s-peri-perks",              "Nando's PERi-Perks",              [], 0),
            ("officeworks-perks",               "Officeworks Perks",               [], 0),
            ("oporto-flame-rewards",            "Oporto Flame Rewards",            [], 0),
            ("petbarn-friends-for-life",        "Petbarn Friends for Life",        [], 0),
            ("petstock-rewards",                "Petstock Rewards",                [], 0),
            ("pizza-hut-rewards",               "Pizza Hut Rewards",               [], 0),
            ("priceline-sister-club",           "Priceline Sister Club",           [], 0),
            ("qantas-frequent-flyer",           "Qantas Frequent Flyer",           [], 0),
            ("red-rooster-red-royalty",         "Red Rooster Red Royalty",         [], 0),
            ("repco-ignition",                  "Repco Ignition",                  [], 0),
            ("sephora-beauty-pass-au",          "Sephora Beauty Pass (AU)",        [], 0),
            ("shell-coles-express-flybuys",     "Shell Coles Express (Flybuys)",   ["6014", "601435", "601436"], 0),
            ("starbucks-rewards-au",            "Starbucks Rewards (AU)",          [], 0),
            ("supercheap-auto-club-plus",       "Supercheap Auto Club Plus",       [], 0),
            ("target-flybuys",                  "Target (Flybuys)",                ["6014", "601435", "601436"], 0),
            ("terrywhite-chemmart-rewards",     "TerryWhite Chemmart Rewards",     [], 0),
            ("the-coffee-club-rewards",         "The Coffee Club Rewards",         [], 0),
            ("the-good-guys-concierge",         "The Good Guys Concierge",         [], 0),
            ("vintage-cellars-wine-club",       "Vintage Cellars Wine Club",       [], 0),
            ("virgin-australia-velocity",       "Virgin Australia Velocity",       [], 0),
            ("woolworths-everyday-rewards",     "Woolworths (Everyday Rewards)",   ["9400", "94009", "940090"], 0),
            ("zambrero-zam-points",             "Zambrero Zam Points",             [], 0),
            ("zarraffa-s-z-card",               "Zarraffa's Z Card",               [], 0),
            # NZ programs
            ("aa-smartfuel-aa-rewards-nz",      "AA Smartfuel / AA Rewards (NZ)",  [], 1),
            ("air-new-zealand-airpoints",       "Air New Zealand Airpoints",       [], 1),
            ("briscoes-rewards-nz",             "Briscoes Rewards (NZ)",           [], 1),
            ("countdown-onecard-nz",            "Countdown Onecard (NZ)",          [], 1),
            ("farmers-club-card-nz",            "Farmers Club Card (NZ)",          [], 1),
            ("flybuys-nz",                      "Flybuys (NZ)",                    [], 1),
            ("kathmandu-summit-club-nz",        "Kathmandu Summit Club (NZ)",      [], 1),
            ("mitre-10-club-nz",                "Mitre 10 Club (NZ)",              [], 1),
            ("new-world-clubcard-nz",           "New World Clubcard (NZ)",         [], 1),
            ("noel-leeming-rewards-nz",         "Noel Leeming Rewards (NZ)",       [], 1),
            ("pita-pit-club-nz",                "Pita Pit Club (NZ)",              [], 1),
            ("rebel-sport-nz-rewards",          "Rebel Sport (NZ) Rewards",        [], 1),
            ("smiths-city-rewards-nz",          "Smiths City Rewards (NZ)",        [], 1),
            ("the-coffee-club-nz-rewards",      "The Coffee Club NZ Rewards",      [], 1),
            ("the-warehouse-marketclub-nz",     "The Warehouse MarketClub (NZ)",   [], 1),
            ("warehouse-stationery-bluebiz-nz", "Warehouse Stationery BlueBiz (NZ)", [], 1),
            ("z-energy-pumped-nz",              "Z Energy Pumped (NZ)",            [], 1),
        ]
        import uuid as _uuid
        for entry in programs:
            # Support both short (slug, name, prefixes, sort_order) and
            # extended (slug, name, prefixes, lengths, symbology, logo_url, logo_background, sort_order) tuples
            if len(entry) == 4:
                slug, name, prefixes, sort_order = entry
                lengths, symbology, logo_url, logo_background = [], [], None, None
            else:
                slug, name, prefixes, lengths, symbology, logo_url, logo_background, sort_order = entry
            rules = _json.dumps({"prefixes": prefixes, "lengths": lengths, "symbology": symbology})
            conn.execute(text("""
                INSERT INTO loyalty_programs (id, slug, name, detection_rules, logo_url, logo_background, sort_order)
                VALUES (:id, :slug, :name, :rules, :logo_url, :logo_bg, :sort)
            """), {"id": str(_uuid.uuid4()), "slug": slug, "name": name, "rules": rules, "logo_url": logo_url, "logo_bg": logo_background, "sort": sort_order})



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


def _run_mysql_list_shares(conn) -> None:
    if not _table_exists(conn, "list_shares"):
        conn.execute(text("""
            CREATE TABLE list_shares (
                id             VARCHAR(36)  NOT NULL PRIMARY KEY,
                list_id        VARCHAR(36)  NOT NULL,
                owner_id       VARCHAR(36)  NOT NULL,
                shared_with_id VARCHAR(36)  NULL,
                invite_token   VARCHAR(36)  NOT NULL UNIQUE,
                status         VARCHAR(16)  NOT NULL DEFAULT 'pending',
                created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (list_id)        REFERENCES shopping_lists(id) ON DELETE CASCADE,
                FOREIGN KEY (owner_id)       REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """))
    if not _index_exists(conn, "list_shares", "ix_list_shares_list_id"):
        conn.execute(text("CREATE INDEX ix_list_shares_list_id ON list_shares(list_id)"))
    if not _index_exists(conn, "list_shares", "ix_list_shares_shared_with_id"):
        conn.execute(text("CREATE INDEX ix_list_shares_shared_with_id ON list_shares(shared_with_id)"))


def _run_mysql_recipes_db(conn) -> None:
    if not _table_exists(conn, "recipes_db"):
        conn.execute(text("""
            CREATE TABLE recipes_db (
                id          VARCHAR(36)  NOT NULL PRIMARY KEY,
                slug        VARCHAR(255) NOT NULL UNIQUE,
                name        VARCHAR(500) NOT NULL,
                image_url   TEXT         NULL,
                recipe_url  TEXT         NOT NULL,
                processed   TINYINT(1)   NOT NULL DEFAULT 0,
                scraped_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
    if not _index_exists(conn, "recipes_db", "ix_recipes_db_slug"):
        conn.execute(text("CREATE INDEX ix_recipes_db_slug ON recipes_db(slug)"))
    if not _index_exists(conn, "recipes_db", "ix_recipes_db_processed"):
        conn.execute(text("CREATE INDEX ix_recipes_db_processed ON recipes_db(processed)"))


if __name__ == "__main__":
    run()
