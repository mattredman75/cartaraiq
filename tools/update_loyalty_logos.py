"""
Fetches official brand logos + colors for loyalty programs with NULL logo_url.
Source: Wikipedia page thumbnail API (no key required, high-quality results).
Updates DB via mysql CLI.
"""

import sys
import subprocess
import requests
import time

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"

HEADERS = {"User-Agent": "CartaraIQ/1.0 logo-fetcher (contact@cartaraiq.com)"}

# slug → (wikipedia_article_title, brand_bg_color)
BRAND_MAP = {
    # Australia
    "accor-live-limitless-all":        ("Accor",                                "#C9A96E"),
    "adairs-linen-lovers":             ("Adairs",                               "#8B1A2D"),
    "airasia-rewards":                 ("AirAsia",                              "#D52B1E"),
    "amcal-rewards":                   ("Amcal",                                "#005baa"),
    "autobarn-autoclub":               ("Autobarn",                             "#D72027"),
    "bakers-delight-dough-getters":    ("Bakers Delight",                       "#C41230"),
    "barbeques-galore-flame-rewards":  ("Barbeques Galore",                     "#D52B1E"),
    "bcf-club":                        ("BCF (store)",                          "#195593"),
    "boost-juice-vibe-club":           ("Boost Juice",                          "#C4007A"),
    "bp-rewards":                      ("BP",                                   "#007A33"),
    "bunnings-powerpass":              ("Bunnings Warehouse",                   "#E31837"),
    "bws-on-tap":                      ("BWS (liquor store)",                   "#47291C"),
    "camera-house-club":               ("Camera House",                         "#003087"),
    "chemist-warehouse-rewards":       ("Chemist Warehouse",                    "#E31837"),
    "city-beach-rewards":              ("City Beach (retailer)",                "#1A1A1A"),
    "costco-membership":               ("Costco",                               "#005DAA"),
    "cotton-on-perks":                 ("Cotton On",                            "#1A1A1A"),
    "dan-murphy-s-my-dan-s":           ("Dan Murphy's",                         "#1B1B4B"),
    "david-jones-rewards":             ("David Jones (department store)",       "#1A1A1A"),
    "domino-s-rewards":                ("Domino's Pizza",                       "#006491"),
    "donut-king-royalty":              ("Donut King",                           "#D52B1E"),
    "eb-games-level-up":               ("EB Games",                             "#FF6200"),
    "event-cinemas-cinebuzz":          ("Event Cinemas",                        "#D52B1E"),
    "fantastic-furniture-club":        ("Fantastic Furniture",                  "#FF6200"),
    "farmers-au-stores":               ("Farmers (Australia)",                  "#1A1A1A"),
    "flight-centre-rewards":           ("Flight Centre",                        "#FF6200"),
    "freedom-myfreedom":               ("Freedom Furniture",                    "#2D2D2D"),
    "gloria-jean-s-esipper-rewards":   ("Gloria Jean's Coffees",                "#8B1A2D"),
    "grill-d-relish":                  ("Grill'd",                              "#2A7E43"),
    "guzman-y-gomez-gomex":            ("Guzman y Gomez",                       "#FF6200"),
    "harvey-norman-rewards":           ("Harvey Norman",                        "#D52B1E"),
    "hoyts-rewards":                   ("Hoyts",                                "#D52B1E"),
    "hungry-jack-s-shake-win":         ("Hungry Jack's",                        "#D52B1E"),
    "ikea-family-au":                  ("IKEA",                                 "#0058A3"),
    "jb-hi-fi-perks":                  ("JB Hi-Fi",                             "#FFD70A"),
    "kathmandu-summit-club":           ("Kathmandu (retailers)",                "#1B3A6B"),
    "kfc-australia":                   ("KFC",                                  "#D52B1E"),
    "mcdonald-s-mymaccas":             ("McDonald's",                           "#DA291C"),
    "michael-hill-brilliance":         ("Michael Hill (company)",               "#1A1A1A"),
    "millers-rewards":                 ("Millers Retail",                       "#8B1A2D"),
    "mimco-mimcollective":             ("Mimco",                                "#1A1A1A"),
    "mitre-10-au":                     ("Mitre 10",                             "#D52B1E"),
    "muffin-break-loyalty":            ("Muffin Break",                         "#C41230"),
    "myer-one":                        ("Myer",                                 "#2D2D2D"),
    "nando-s-peri-perks":              ("Nando's",                              "#D52B1E"),
    "officeworks-perks":               ("Officeworks",                          "#D52B1E"),
    "oporto-flame-rewards":            ("Oporto",                               "#FF6200"),
    "petbarn-friends-for-life":        ("Petbarn",                              "#1B3A6B"),
    "petstock-rewards":                ("PETstock",                             "#FF6200"),
    "pizza-hut-rewards":               ("Pizza Hut",                            "#D52B1E"),
    "priceline-sister-club":           ("Priceline Pharmacy",                   "#D52B1E"),
    "qantas-frequent-flyer":           ("Qantas",                               "#D52B1E"),
    "red-rooster-red-royalty":         ("Red Rooster",                          "#D52B1E"),
    "repco-ignition":                  ("Repco",                                "#D52B1E"),
    "sephora-beauty-pass-au":          ("Sephora",                              "#1A1A1A"),
    "starbucks-rewards-au":            ("Starbucks",                            "#1E3932"),
    "supercheap-auto-club-plus":       ("Supercheap Auto",                      "#D52B1E"),
    "terrywhite-chemmart-rewards":     ("TerryWhite Chemmart",                  "#009B77"),
    "the-coffee-club-rewards":         ("The Coffee Club (restaurant chain)",   "#3E2010"),
    "the-good-guys-concierge":         ("The Good Guys",                        "#D52B1E"),
    "vintage-cellars-wine-club":       ("Vintage Cellars",                      "#722F37"),
    "virgin-australia-velocity":       ("Virgin Australia",                     "#D52B1E"),
    "zambrero-zam-points":             ("Zambrero",                             "#2A7E43"),
    "zarraffa-s-z-card":               ("Zarraffa's Coffee",                    "#3E2010"),
    # New Zealand
    "aa-smartfuel-aa-rewards-nz":      ("New Zealand Automobile Association",   "#FFD200"),
    "air-new-zealand-airpoints":       ("Air New Zealand",                      "#00529B"),
    "briscoes-rewards-nz":             ("Briscoes",                             "#D52B1E"),
    "countdown-onecard-nz":            ("Countdown (supermarket)",              "#D52B1E"),
    "farmers-club-card-nz":            ("Farmers (New Zealand)",                "#1A1A1A"),
    "flybuys-nz":                      ("Flybuys",                              "#0072C6"),
    "kathmandu-summit-club-nz":        ("Kathmandu (retailers)",                "#1B3A6B"),
    "mitre-10-club-nz":                ("Mitre 10",                             "#D52B1E"),
    "new-world-clubcard-nz":           ("New World (supermarket)",              "#D52B1E"),
    "noel-leeming-rewards-nz":         ("Noel Leeming",                         "#D52B1E"),
    "pita-pit-club-nz":                ("Pita Pit",                             "#1A6430"),
    "rebel-sport-nz-rewards":          ("Rebel Sport",                          "#D52B1E"),
    "smiths-city-rewards-nz":          ("Smith's City",                         "#003087"),
    "the-coffee-club-nz-rewards":      ("The Coffee Club (restaurant chain)",   "#3E2010"),
    "the-warehouse-marketclub-nz":     ("The Warehouse Group",                  "#D52B1E"),
    "warehouse-stationery-bluebiz-nz": ("Warehouse Stationery",                 "#005DAA"),
    "z-energy-pumped-nz":              ("Z Energy",                             "#FF6200"),
}

WIKI_API = "https://en.wikipedia.org/w/api.php"


def wiki_logo(article):
    params = {
        "action": "query",
        "titles": article,
        "prop": "pageimages",
        "piprop": "thumbnail|name",
        "pithumbsize": 500,
        "pilicense": "any",
        "format": "json",
    }
    try:
        r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=10)
        pages = r.json().get("query", {}).get("pages", {})
        for page in pages.values():
            thumb = page.get("thumbnail", {}).get("source")
            if thumb:
                return thumb
    except Exception as e:
        print(f"(wiki error: {e})", end="")
    return None


def mysql_fetch(sql):
    r = subprocess.run(
        ["mysql", "-u", MYSQL_USER, f"-p{MYSQL_PASS}", MYSQL_DB, "-sN", "-e", sql],
        capture_output=True, text=True
    )
    return r.stdout.strip()


def mysql_exec(sql):
    subprocess.run(
        ["mysql", "-u", MYSQL_USER, f"-p{MYSQL_PASS}", MYSQL_DB, "-e", sql],
        capture_output=True
    )


def main():
    raw = mysql_fetch(
        "SELECT slug, name FROM loyalty_programs WHERE logo_url IS NULL ORDER BY slug;"
    )
    if not raw:
        print("All programs already have logo_url — nothing to do.")
        return

    missing = [line.split("\t", 1) for line in raw.splitlines() if "\t" in line]
    print(f"Found {len(missing)} programs with no logo_url\n")

    updated = skipped = 0
    for slug, name in missing:
        slug = slug.strip()
        name = name.strip()

        if slug not in BRAND_MAP:
            print(f"  SKIP  {name}")
            skipped += 1
            continue

        article, bg = BRAND_MAP[slug]
        sys.stdout.write(f"  {name:<45s}  ")
        sys.stdout.flush()

        logo_url = wiki_logo(article)

        if logo_url:
            safe_url = logo_url.replace("'", "\\'")
            safe_bg  = bg.replace("'", "\\'")
            mysql_exec(
                f"UPDATE loyalty_programs "
                f"SET logo_url='{safe_url}', logo_background='{safe_bg}' "
                f"WHERE slug='{slug}';"
            )
            print(f"OK  {bg}  {logo_url[:80]}")
            updated += 1
        else:
            print(f"--  no thumbnail for '{article}'")
            skipped += 1

        time.sleep(0.2)

    print(f"\nDone — updated: {updated}  |  skipped/unmapped: {skipped}")


if __name__ == "__main__":
    main()
