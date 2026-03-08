"""
Second-pass fix for loyalty program logos.
1. Corrects entries that got store/aircraft photos instead of logos.
2. Fills in remaining NULL entries via Wikipedia imageinfo API.
Runs DB updates via mysql CLI.
"""

import sys
import subprocess
import requests
import time

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"
HEADERS    = {"User-Agent": "CartaraIQ/1.0 logo-fetcher"}
WIKI_API   = "https://en.wikipedia.org/w/api.php"

# --------------------------------------------------------------------------
# Direct confirmed URLs (from prior Wikipedia imageinfo lookups).
# These bypass the API entirely.
# --------------------------------------------------------------------------
DIRECT_URLS = {
    # Corrections: previous run fetched photos instead of logos
    "qantas-frequent-flyer":       ("https://upload.wikimedia.org/wikipedia/en/thumb/0/02/Qantas_Airways_logo_2016.svg/500px-Qantas_Airways_logo_2016.svg.png",     "#D52B1E"),
    "virgin-australia-velocity":   ("https://upload.wikimedia.org/wikipedia/en/thumb/0/06/Virgin_Australia_Logo_2022.svg/500px-Virgin_Australia_Logo_2022.svg.png",  "#D52B1E"),
    "myer-one":                    ("https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Myer_Logo.svg/500px-Myer_Logo.svg.png",                               "#2D2D2D"),
    "nando-s-peri-perks":          ("https://upload.wikimedia.org/wikipedia/en/thumb/c/c5/Nandos_logo.svg/500px-Nandos_logo.svg.png",                               "#D52B1E"),
    "officeworks-perks":           ("https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Officeworkslogo.png/500px-Officeworkslogo.png",                            "#D52B1E"),
    "costco-membership":           ("https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Costco_Wholesale_logo_2010-10-26.svg/500px-Costco_Wholesale_logo_2010-10-26.svg.png", "#005DAA"),
    "repco-ignition":              ("https://upload.wikimedia.org/wikipedia/en/e/ed/Repco_logo.jpg",                                                                 "#D52B1E"),
    "sephora-beauty-pass-au":      ("https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Sephora_logo.svg/500px-Sephora_logo.svg.png",                        "#1A1A1A"),
    "ikea-family-au":              ("https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Ikea_logo.svg/500px-Ikea_logo.svg.png",                              "#0058A3"),
    "air-new-zealand-airpoints":   ("https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Air_New_Zealand_logo.svg/500px-Air_New_Zealand_logo.svg.png",         "#00529B"),
    "mitre-10-au":                 ("https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/Mitre10_logo.svg/500px-Mitre10_logo.svg.png",                              "#D52B1E"),
    "mitre-10-club-nz":            ("https://upload.wikimedia.org/wikipedia/en/thumb/b/bc/Mitre10_logo.svg/500px-Mitre10_logo.svg.png",                              "#D52B1E"),
    "starbucks-rewards-au":        ("https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/500px-Starbucks_Corporation_Logo_2011.svg.png", "#1E3932"),
    "supercheap-auto-club-plus":   ("https://upload.wikimedia.org/wikipedia/en/thumb/7/7e/Supercheap_Auto_logo.png/500px-Supercheap_Auto_logo.png",                 "#D52B1E"),
    "terrywhite-chemmart-rewards": ("https://upload.wikimedia.org/wikipedia/en/thumb/1/1e/TerryWhite_Chemmart_logo.png/500px-TerryWhite_Chemmart_logo.png",         "#009B77"),
    "vintage-cellars-wine-club":   ("https://upload.wikimedia.org/wikipedia/en/4/4a/Vintage_Cellars_logo.png",                                                      "#722F37"),
    "bunnings-powerpass":          ("https://upload.wikimedia.org/wikipedia/en/thumb/0/0f/Bunnings_Warehouse_logo.svg/500px-Bunnings_Warehouse_logo.svg.png",        "#E31837"),
    "harvey-norman-rewards":       ("https://upload.wikimedia.org/wikipedia/en/thumb/2/2d/Harvey_Norman_logo.png/500px-Harvey_Norman_logo.png",                     "#D52B1E"),
    "cotton-on-perks":             ("https://upload.wikimedia.org/wikipedia/en/4/4f/Cotton_On_logo.svg",                                                            "#1A1A1A"),
    "the-good-guys-concierge":     ("https://upload.wikimedia.org/wikipedia/en/thumb/4/4d/The_Good_Guys_logo.png/500px-The_Good_Guys_logo.png",                    "#D52B1E"),
    "the-coffee-club-rewards":     ("https://upload.wikimedia.org/wikipedia/en/thumb/7/7f/The_Coffee_Club_logo.png/500px-The_Coffee_Club_logo.png",                 "#3E2010"),
    "the-coffee-club-nz-rewards":  ("https://upload.wikimedia.org/wikipedia/en/thumb/7/7f/The_Coffee_Club_logo.png/500px-The_Coffee_Club_logo.png",                 "#3E2010"),
    "kathmandu-summit-club":       ("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Kathmandu_logo.svg/500px-Kathmandu_logo.svg.png",                    "#1B3A6B"),
    "kathmandu-summit-club-nz":    ("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Kathmandu_logo.svg/500px-Kathmandu_logo.svg.png",                    "#1B3A6B"),
    "rebel-sport-nz-rewards":      ("https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Rebel_Sport_logo.svg/500px-Rebel_Sport_logo.svg.png",               "#D52B1E"),
    "flybuys-nz":                  ("https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Flybuys_logo.svg/500px-Flybuys_logo.svg.png",                        "#0072C6"),
    "priceline-sister-club":       ("https://upload.wikimedia.org/wikipedia/en/thumb/9/9d/Priceline_Pharmacy_logo.png/500px-Priceline_Pharmacy_logo.png",           "#D52B1E"),
    "david-jones-rewards":         ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/David_Jones_logo.png/500px-David_Jones_logo.png",                         "#1A1A1A"),
    "new-world-clubcard-nz":       ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/New_World_logo.png/500px-New_World_logo.png",                             "#D52B1E"),
    "noel-leeming-rewards-nz":     ("https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Noel_Leeming_logo.png/500px-Noel_Leeming_logo.png",                      "#D52B1E"),
    "bws-on-tap":                  ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3d/BWS_logo.png/500px-BWS_logo.png",                                         "#47291C"),
    "countdown-onecard-nz":        ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3d/Countdown_logo.png/500px-Countdown_logo.png",                             "#D52B1E"),
    "amcal-rewards":               ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3a/Amcal_logo.png/500px-Amcal_logo.png",                                     "#005baa"),
    "petbarn-friends-for-life":    ("https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Petbarn_logo.png/500px-Petbarn_logo.png",                                 "#1B3A6B"),
    "petstock-rewards":            ("https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Petstock_logo.png/500px-Petstock_logo.png",                               "#FF6200"),
    "event-cinemas-cinebuzz":      ("https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/Event_Cinemas_logo.png/500px-Event_Cinemas_logo.png",                     "#D52B1E"),
    "oporto-flame-rewards":        ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3d/Oporto_logo.png/500px-Oporto_logo.png",                                   "#FF6200"),
    "eb-games-level-up":           ("https://upload.wikimedia.org/wikipedia/en/thumb/0/0d/EB_Games_logo.png/500px-EB_Games_logo.png",                               "#FF6200"),
    "donut-king-royalty":          ("https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/Donut_King_logo.png/500px-Donut_King_logo.png",                           "#D52B1E"),
    "camera-house-club":           ("https://upload.wikimedia.org/wikipedia/en/thumb/8/8d/Camera_House_logo.png/500px-Camera_House_logo.png",                       "#003087"),
    "city-beach-rewards":          ("https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/City_Beach_logo.png/500px-City_Beach_logo.png",                           "#1A1A1A"),
    "adairs-linen-lovers":         ("https://upload.wikimedia.org/wikipedia/en/5/5e/Adairs_logo.png",                                                               "#8B1A2D"),
    "autobarn-autoclub":           ("https://upload.wikimedia.org/wikipedia/en/5/5d/Autobarn_logo.png",                                                             "#D72027"),
    "michael-hill-brilliance":     ("https://upload.wikimedia.org/wikipedia/en/3/3e/Michael_Hill_logo.png",                                                         "#1A1A1A"),
    "millers-rewards":             ("https://upload.wikimedia.org/wikipedia/en/7/7a/Millers_logo.png",                                                              "#8B1A2D"),
    "mimco-mimcollective":         ("https://upload.wikimedia.org/wikipedia/en/4/4d/Mimco_logo.png",                                                                "#1A1A1A"),
    "briscoes-rewards-nz":         ("https://upload.wikimedia.org/wikipedia/en/4/4f/Briscoes_logo.png",                                                             "#D52B1E"),
    "farmers-club-card-nz":        ("https://upload.wikimedia.org/wikipedia/en/8/8e/Farmers_logo.png",                                                              "#1A1A1A"),
    "smiths-city-rewards-nz":      ("https://upload.wikimedia.org/wikipedia/en/6/6c/Smiths_City_logo.png",                                                          "#003087"),
    "warehouse-stationery-bluebiz-nz": ("https://upload.wikimedia.org/wikipedia/en/6/6e/Warehouse_Stationery_logo.png",                                             "#005DAA"),
    "zambrero-zam-points":         ("https://upload.wikimedia.org/wikipedia/en/2/2d/Zambrero_logo.png",                                                             "#2A7E43"),
    "fantastic-furniture-club":    ("https://upload.wikimedia.org/wikipedia/en/4/4d/Fantastic_Furniture_logo.png",                                                  "#FF6200"),
    "farmers-au-stores":           ("https://upload.wikimedia.org/wikipedia/en/5/5d/Farmers_AU_logo.png",                                                           "#1A1A1A"),
    "bakers-delight-dough-getters": ("https://upload.wikimedia.org/wikipedia/en/1/1d/Bakers_Delight_logo.png",                                                     "#C41230"),
    "freedom-myfreedom":           ("https://upload.wikimedia.org/wikipedia/en/2/2e/Freedom_Australia_logo.png",                                                    "#2D2D2D"),
    "gloria-jean-s-esipper-rewards": ("https://upload.wikimedia.org/wikipedia/en/4/4a/Gloria_Jean%27s_Coffees_logo.png",                                           "#8B1A2D"),
}

# File-based lookups via Wikipedia imageinfo API (for entries not in DIRECT_URLS)
FILE_LOOKUPS = {
    "domino-s-rewards": ("File:Domino's pizza logo.svg", "#006491"),
}


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


def url_ok(url):
    try:
        r = requests.head(url, headers=HEADERS, timeout=8, allow_redirects=True)
        return r.status_code == 200
    except Exception:
        return False


def wiki_file_url(filename):
    params = {
        "action": "query", "titles": filename,
        "prop": "imageinfo", "iiprop": "url",
        "iiurlwidth": 500, "format": "json",
    }
    try:
        r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=10)
        pages = r.json().get("query", {}).get("pages", {})
        for p in pages.values():
            info = p.get("imageinfo", [{}])[0]
            return info.get("thumburl") or info.get("url")
    except Exception as e:
        print(f"(wiki error: {e})", end="")
    return None


def upsert(slug, logo_url, bg):
    safe_url = logo_url.replace("'", "\\'")
    safe_bg  = bg.replace("'", "\\'")
    mysql_exec(
        f"UPDATE loyalty_programs "
        f"SET logo_url='{safe_url}', logo_background='{safe_bg}' "
        f"WHERE slug='{slug}';"
    )


def main():
    all_entries = {**DIRECT_URLS}

    # Resolve file-based lookups
    for slug, (filename, bg) in FILE_LOOKUPS.items():
        url = wiki_file_url(filename)
        if url:
            all_entries[slug] = (url, bg)
        time.sleep(0.15)

    print(f"Processing {len(all_entries)} entries...\n")
    ok_count = fail_count = skip_count = 0

    for slug, (logo_url, bg) in all_entries.items():
        sys.stdout.write(f"  {slug:<45s}  ")
        sys.stdout.flush()

        if url_ok(logo_url):
            upsert(slug, logo_url, bg)
            print(f"OK  {bg}")
            ok_count += 1
        else:
            print(f"FAIL  ({logo_url[:60]})")
            fail_count += 1

        time.sleep(0.05)

    print(f"\nDone — OK: {ok_count}  |  failed: {fail_count}  |  skipped: {skip_count}")


if __name__ == "__main__":
    main()
