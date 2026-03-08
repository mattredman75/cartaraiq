"""Batch 2 — remaining Wikipedia brands not yet processed."""
import requests, time, sys, subprocess

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"
HEADERS    = {"User-Agent": "CartaraIQ/1.0"}
WIKI_API   = "https://en.wikipedia.org/w/api.php"
SKIP       = ["commons-logo", "foodlogo", "oneworld logo", "alliance logo",
              "star alliance", "skyteam", "oneworld_logo"]

ARTICLES = {
    "oporto-flame-rewards":            ("Oporto",                    "#FF6200"),
    "petbarn-friends-for-life":        ("Petbarn",                   "#1B3A6B"),
    "petstock-rewards":                ("PETstock",                  "#FF6200"),
    "priceline-sister-club":           ("Priceline Pharmacy",        "#D52B1E"),
    "rebel-sport-nz-rewards":          ("Rebel Sport",               "#D52B1E"),
    "repco-ignition":                  ("Repco",                     "#D52B1E"),
    "smiths-city-rewards-nz":          ("Smith's City",              "#003087"),
    "supercheap-auto-club-plus":       ("Supercheap Auto",           "#D52B1E"),
    "terrywhite-chemmart-rewards":     ("TerryWhite Chemmart",       "#009B77"),
    "the-coffee-club-rewards":         ("The Coffee Club (restaurant chain)", "#3E2010"),
    "the-coffee-club-nz-rewards":      ("The Coffee Club (restaurant chain)", "#3E2010"),
    "the-good-guys-concierge":         ("The Good Guys",             "#D52B1E"),
    "vintage-cellars-wine-club":       ("Vintage Cellars",           "#722F37"),
    "warehouse-stationery-bluebiz-nz": ("Warehouse Stationery",      "#005DAA"),
    "zambrero-zam-points":             ("Zambrero",                  "#2A7E43"),
    "amcal-rewards":                   ("Amcal",                     "#005baa"),
    "bakers-delight-dough-getters":    ("Bakers Delight",            "#C41230"),
    "air-new-zealand-airpoints":       ("Air New Zealand",           "#00529B"),
    "costco-membership":               ("Costco",                    "#005DAA"),
    "grill-d-relish":                  ("Grill'd",                   "#2A7E43"),
}


def get_logo_url(article):
    r = requests.get(WIKI_API, headers=HEADERS, timeout=12, params={
        "action": "query", "titles": article,
        "prop": "images", "imlimit": 50, "format": "json"
    })
    pages = r.json().get("query", {}).get("pages", {})
    imgs = []
    for p in pages.values():
        imgs = p.get("images", [])
    logos = [i["title"] for i in imgs
             if "logo" in i["title"].lower()
             and not any(s in i["title"].lower() for s in SKIP)]
    if not logos:
        return None
    time.sleep(0.08)
    r2 = requests.get(WIKI_API, headers=HEADERS, timeout=12, params={
        "action": "query", "titles": logos[0],
        "prop": "imageinfo", "iiprop": "url",
        "iiurlwidth": 500, "format": "json"
    })
    pages2 = r2.json().get("query", {}).get("pages", {})
    for p in pages2.values():
        info = p.get("imageinfo", [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if url:
            return url
    return None


def sql(stmt):
    subprocess.run(["mysql", "-u", MYSQL_USER, f"-p{MYSQL_PASS}", MYSQL_DB,
                    "-e", stmt], capture_output=True)


updated = skipped = 0
for slug, (article, bg) in ARTICLES.items():
    sys.stdout.write(f"  {slug:<45s}  ")
    sys.stdout.flush()
    try:
        url = get_logo_url(article)
    except Exception as e:
        print(f"ERR {e}")
        skipped += 1
        time.sleep(0.3)
        continue
    if url:
        safe = url.replace("'", "\\'")
        sql(f"UPDATE loyalty_programs SET logo_url='{safe}',logo_background='{bg}' WHERE slug='{slug}';")
        print(f"OK  {bg}")
        updated += 1
    else:
        print(f"--  no logo in Wikipedia")
        skipped += 1
    time.sleep(0.2)

print(f"\nDone: {updated} updated, {skipped} skipped")
