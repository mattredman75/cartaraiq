"""Discover actual Wikipedia logo file URLs for remaining brands."""
import requests
import time
import json
import sys
import subprocess

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"
HEADERS    = {"User-Agent": "CartaraIQ/1.0"}
WIKI_API   = "https://en.wikipedia.org/w/api.php"

# Brand colors for all remaining entries
BRAND_COLORS = {
    "bunnings-powerpass":           "#E31837",
    "harvey-norman-rewards":        "#D52B1E",
    "bws-on-tap":                   "#47291C",
    "cotton-on-perks":              "#1A1A1A",
    "mitre-10-au":                  "#D52B1E",
    "mitre-10-club-nz":             "#D52B1E",
    "kathmandu-summit-club":        "#1B3A6B",
    "kathmandu-summit-club-nz":     "#1B3A6B",
    "adairs-linen-lovers":          "#8B1A2D",
    "autobarn-autoclub":            "#D72027",
    "camera-house-club":            "#003087",
    "city-beach-rewards":           "#1A1A1A",
    "briscoes-rewards-nz":          "#D52B1E",
    "countdown-onecard-nz":         "#D52B1E",
    "david-jones-rewards":          "#1A1A1A",
    "donut-king-royalty":           "#D52B1E",
    "eb-games-level-up":            "#FF6200",
    "event-cinemas-cinebuzz":       "#D52B1E",
    "fantastic-furniture-club":     "#FF6200",
    "farmers-au-stores":            "#1A1A1A",
    "farmers-club-card-nz":         "#1A1A1A",
    "flybuys-nz":                   "#0072C6",
    "freedom-myfreedom":            "#2D2D2D",
    "gloria-jean-s-esipper-rewards":"#8B1A2D",
    "michael-hill-brilliance":      "#1A1A1A",
    "millers-rewards":              "#8B1A2D",
    "mimco-mimcollective":          "#1A1A1A",
    "new-world-clubcard-nz":        "#D52B1E",
    "noel-leeming-rewards-nz":      "#D52B1E",
    "oporto-flame-rewards":         "#FF6200",
    "petbarn-friends-for-life":     "#1B3A6B",
    "petstock-rewards":             "#FF6200",
    "priceline-sister-club":        "#D52B1E",
    "rebel-sport-nz-rewards":       "#D52B1E",
    "repco-ignition":               "#D52B1E",
    "smiths-city-rewards-nz":       "#003087",
    "supercheap-auto-club-plus":    "#D52B1E",
    "terrywhite-chemmart-rewards":  "#009B77",
    "the-coffee-club-rewards":      "#3E2010",
    "the-coffee-club-nz-rewards":   "#3E2010",
    "the-good-guys-concierge":      "#D52B1E",
    "vintage-cellars-wine-club":    "#722F37",
    "warehouse-stationery-bluebiz-nz": "#005DAA",
    "zambrero-zam-points":          "#2A7E43",
    "amcal-rewards":                "#005baa",
    "bakers-delight-dough-getters": "#C41230",
    "air-new-zealand-airpoints":    "#00529B",
    "costco-membership":            "#005DAA",
    "grill-d-relish":               "#2A7E43",
}

ARTICLES = {
    "bunnings-powerpass":           "Bunnings Warehouse",
    "harvey-norman-rewards":        "Harvey Norman",
    "bws-on-tap":                   "BWS (liquor store)",
    "cotton-on-perks":              "Cotton On",
    "mitre-10-au":                  "Mitre 10",
    "mitre-10-club-nz":             "Mitre 10",
    "kathmandu-summit-club":        "Kathmandu (retailers)",
    "kathmandu-summit-club-nz":     "Kathmandu (retailers)",
    "adairs-linen-lovers":          "Adairs",
    "autobarn-autoclub":            "Autobarn",
    "camera-house-club":            "Camera House",
    "city-beach-rewards":           "City Beach (retailer)",
    "briscoes-rewards-nz":          "Briscoes",
    "countdown-onecard-nz":         "Countdown (supermarket)",
    "david-jones-rewards":          "David Jones (department store)",
    "donut-king-royalty":           "Donut King",
    "eb-games-level-up":            "EB Games",
    "event-cinemas-cinebuzz":       "Event Cinemas",
    "fantastic-furniture-club":     "Fantastic Furniture",
    "farmers-au-stores":            "Farmers (Australia)",
    "farmers-club-card-nz":         "Farmers (New Zealand)",
    "flybuys-nz":                   "Flybuys",
    "freedom-myfreedom":            "Freedom Furniture",
    "gloria-jean-s-esipper-rewards":"Gloria Jean's Coffees",
    "michael-hill-brilliance":      "Michael Hill (company)",
    "millers-rewards":              "Millers Retail",
    "mimco-mimcollective":          "Mimco",
    "new-world-clubcard-nz":        "New World (supermarket)",
    "noel-leeming-rewards-nz":      "Noel Leeming",
    "oporto-flame-rewards":         "Oporto",
    "petbarn-friends-for-life":     "Petbarn",
    "petstock-rewards":             "PETstock",
    "priceline-sister-club":        "Priceline Pharmacy",
    "rebel-sport-nz-rewards":       "Rebel Sport",
    "repco-ignition":               "Repco",
    "smiths-city-rewards-nz":       "Smith's City",
    "supercheap-auto-club-plus":    "Supercheap Auto",
    "terrywhite-chemmart-rewards":  "TerryWhite Chemmart",
    "the-coffee-club-rewards":      "The Coffee Club (restaurant chain)",
    "the-coffee-club-nz-rewards":   "The Coffee Club (restaurant chain)",
    "the-good-guys-concierge":      "The Good Guys",
    "vintage-cellars-wine-club":    "Vintage Cellars",
    "warehouse-stationery-bluebiz-nz": "Warehouse Stationery",
    "zambrero-zam-points":          "Zambrero",
    "amcal-rewards":                "Amcal",
    "bakers-delight-dough-getters": "Bakers Delight",
    "air-new-zealand-airpoints":    "Air New Zealand",
    "costco-membership":            "Costco",
    "grill-d-relish":               "Grill'd",
}

SKIP_PHRASES = ["commons-logo", "foodlogo", "oneworld logo", "alliance logo",
                "star alliance", "skyteam", "oneworld_logo"]


def get_logo_file_url(article):
    r = requests.get(WIKI_API, headers=HEADERS, timeout=10, params={
        "action": "query", "titles": article,
        "prop": "images", "imlimit": 50, "format": "json"
    })
    pages = r.json().get("query", {}).get("pages", {})
    imgs = []
    for p in pages.values():
        imgs = p.get("images", [])
    logos = [i["title"] for i in imgs
             if "logo" in i["title"].lower()
             and not any(s in i["title"].lower() for s in SKIP_PHRASES)]
    if not logos:
        return None, None
    time.sleep(0.1)
    r2 = requests.get(WIKI_API, headers=HEADERS, timeout=10, params={
        "action": "query", "titles": logos[0],
        "prop": "imageinfo", "iiprop": "url",
        "iiurlwidth": 500, "format": "json"
    })
    pages2 = r2.json().get("query", {}).get("pages", {})
    for p in pages2.values():
        info = p.get("imageinfo", [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if url:
            return logos[0], url
    return logos[0], None


def mysql_exec(sql):
    subprocess.run(
        ["mysql", "-u", MYSQL_USER, f"-p{MYSQL_PASS}", MYSQL_DB, "-e", sql],
        capture_output=True
    )


def main():
    updated = skipped = 0
    for slug, article in ARTICLES.items():
        sys.stdout.write(f"  {slug:<45s}  ")
        sys.stdout.flush()
        try:
            fname, url = get_logo_file_url(article)
        except Exception as e:
            print(f"ERROR: {e}")
            skipped += 1
            time.sleep(0.3)
            continue

        if url:
            bg = BRAND_COLORS.get(slug, "#1A1A1A")
            safe_url = url.replace("'", "\\'")
            mysql_exec(
                f"UPDATE loyalty_programs "
                f"SET logo_url='{safe_url}', logo_background='{bg}' "
                f"WHERE slug='{slug}';"
            )
            print(f"OK  {bg}   {fname[:40] if fname else ''}")
            updated += 1
        else:
            print(f"--  no logo file in '{article}'")
            skipped += 1

        time.sleep(0.25)

    print(f"\nDone — updated: {updated}  |  no logo found: {skipped}")


if __name__ == "__main__":
    main()
