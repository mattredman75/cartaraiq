"""Retry the 7 failed favicon entries with alternative domains."""
import requests, subprocess, sys, time

MYSQL_USER = "cartaraiq_admin"
MYSQL_PASS = "c@rt@r@4dm1n!"
MYSQL_DB   = "cartaraiq"
HEADERS    = {"User-Agent": "CartaraIQ/1.0"}
GFAV       = "https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=256&url=https://{domain}"

BRANDS = {
    "kathmandu-summit-club":        ("kathmandu.com.au",           "#1B3A6B"),
    "kathmandu-summit-club-nz":     ("kathmandu.co.nz",            "#1B3A6B"),
    "flybuys-nz":                   ("flybuys.co.nz",              "#0072C6"),  # will try get instead
    "michael-hill-brilliance":      ("michaelhill.com.au",         "#1A1A1A"),
    "millers-rewards":              ("millersfashion.com.au",      "#8B1A2D"),
    "smiths-city-rewards-nz":       ("smithscity.co.nz",           "#003087"),
    "the-coffee-club-nz-rewards":   ("thecoffeeclub.com.au",       "#3E2010"),  # reuse AU domain
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
        # Use GET for the image check (HEAD is not reliable for this API)
        r = requests.get(url, headers=HEADERS, timeout=8, stream=True)
        ct = r.headers.get("Content-Type", "")
        ok = r.status_code == 200 and "image" in ct
        r.close()
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
        print(f"--  {r.status_code}/{ct[:20]}  ({domain})")
        skipped += 1
    time.sleep(0.15)

print(f"\nDone: {updated} updated, {skipped} skipped")
