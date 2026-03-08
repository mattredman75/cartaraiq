"""Use Google Favicon V2 for brands with no Wikipedia logo files."""
import requests, subprocess, sys, time

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"
HEADERS    = {"User-Agent": "CartaraIQ/1.0"}
GFAV       = "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=256&url=https://{domain}"

BRANDS = {
    # From discover_loyalty_logos.py — no Wikipedia logo files
    "bunnings-powerpass":           ("bunnings.com.au",          "#E31837"),
    "harvey-norman-rewards":        ("harveynorman.com.au",      "#D52B1E"),
    "bws-on-tap":                   ("bws.com.au",               "#47291C"),
    "cotton-on-perks":              ("cottonongroup.com",        "#1A1A1A"),
    "mitre-10-au":                  ("mitre10.com.au",           "#D52B1E"),
    "mitre-10-club-nz":             ("mitre10.co.nz",            "#D52B1E"),
    "kathmandu-summit-club":        ("kathmandu.com",            "#1B3A6B"),
    "kathmandu-summit-club-nz":     ("kathmandu.com",            "#1B3A6B"),
    "adairs-linen-lovers":          ("adairs.com.au",            "#8B1A2D"),
    "autobarn-autoclub":            ("autobarn.com.au",          "#D72027"),
    "camera-house-club":            ("camerahouse.com.au",       "#003087"),
    "city-beach-rewards":           ("citybeach.com.au",         "#1A1A1A"),
    "briscoes-rewards-nz":          ("briscoes.co.nz",           "#D52B1E"),
    "donut-king-royalty":           ("donutking.com.au",         "#D52B1E"),
    "fantastic-furniture-club":     ("fantasticfurniture.com.au","#FF6200"),
    "farmers-club-card-nz":         ("farmers.co.nz",            "#1A1A1A"),
    "flybuys-nz":                   ("flybuys.co.nz",            "#0072C6"),
    "michael-hill-brilliance":      ("michaelhill.com",          "#1A1A1A"),
    "millers-rewards":              ("millers.com.au",           "#8B1A2D"),
    "mimco-mimcollective":          ("mimco.com.au",             "#1A1A1A"),
    # From wiki_logos_batch2.py — no Wikipedia logo files
    "oporto-flame-rewards":         ("oporto.com.au",            "#FF6200"),
    "petbarn-friends-for-life":     ("petbarn.com.au",           "#1B3A6B"),
    "petstock-rewards":             ("petstock.com.au",          "#FF6200"),
    "priceline-sister-club":        ("priceline.com.au",         "#D52B1E"),
    "rebel-sport-nz-rewards":       ("rebelsport.com",           "#D52B1E"),
    "smiths-city-rewards-nz":       ("smithscity.co.nz",         "#003087"),
    "the-coffee-club-rewards":      ("thecoffeeclub.com.au",     "#3E2010"),
    "the-coffee-club-nz-rewards":   ("thecoffeeclub.co.nz",     "#3E2010"),
    "the-good-guys-concierge":      ("thegoodguys.com.au",       "#D52B1E"),
    "vintage-cellars-wine-club":    ("vintagecellars.com.au",    "#722F37"),
    "warehouse-stationery-bluebiz-nz": ("warehousestationery.co.nz", "#005DAA"),
    "amcal-rewards":                ("amcal.com.au",             "#005baa"),
}


def sql(stmt):
    subprocess.run(["mysql", "-u", MYSQL_USER, f"-p{MYSQL_PASS}", MYSQL_DB,
                    "-e", stmt], capture_output=True)


updated = skipped = 0
for slug, (domain, bg) in BRANDS.items():
    url = GFAV.format(domain=domain)
    sys.stdout.write(f"  {slug:<45s}  ")
    sys.stdout.flush()
    try:
        r = requests.head(url, headers=HEADERS, timeout=8, allow_redirects=True)
        ok = r.status_code == 200 and "image" in r.headers.get("Content-Type", "")
    except Exception as e:
        print(f"ERR {e}")
        skipped += 1
        time.sleep(0.2)
        continue
    if ok:
        safe = url.replace("'", "\\'")
        sql(f"UPDATE loyalty_programs SET logo_url='{safe}',logo_background='{bg}' WHERE slug='{slug}';")
        print(f"OK  {bg}  ({domain})")
        updated += 1
    else:
        print(f"--  {r.status_code}  ({domain})")
        skipped += 1
    time.sleep(0.15)

print(f"\nDone: {updated} updated, {skipped} skipped")
