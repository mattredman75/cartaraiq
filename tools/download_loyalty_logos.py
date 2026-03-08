#!/usr/bin/env python3
"""
Download loyalty program logos and generate loyaltyPrograms.ts

Reads brand_assetts/loyalty_cards/programs.csv (pipe-delimited),
downloads each logo as a 120px PNG from Wikipedia's thumbnail API,
saves to app/assets/loyalty-logos/, and generates app/lib/loyaltyPrograms.ts.

Usage:
    python tools/download_loyalty_logos.py
"""

import csv
import json
import os
import re
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
CSV_PATH = ROOT / "brand_assetts" / "loyalty_cards" / "programs.csv"
LOGOS_DIR = ROOT / "app" / "assets" / "loyalty-logos"
TS_OUT = ROOT / "app" / "lib" / "loyaltyPrograms.ts"

LOGOS_DIR.mkdir(parents=True, exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────────────────────
def slugify(name: str) -> str:
    """Convert program name to a safe filename slug."""
    name = name.lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    return name

def wiki_thumb_url(original_url: str, width: int = 120) -> str:
    """
    Convert a Wikimedia upload URL to its thumbnail PNG URL.

    Handles both:
      https://upload.wikimedia.org/wikipedia/en/4/4f/Logo.svg
        → https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/Logo.svg/120px-Logo.svg.png
      https://upload.wikimedia.org/wikipedia/commons/4/4d/Logo.png
        → https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Logo.png/120px-Logo.png
    """
    # Match: .../wikipedia/(project)/H/HH/Filename.ext
    m = re.match(
        r"(https://upload\.wikimedia\.org/wikipedia/[^/]+)/([0-9a-f]/[0-9a-f]{2})/(.+)$",
        original_url,
    )
    if not m:
        return original_url  # return as-is if pattern doesn't match

    base, hash_path, filename = m.groups()
    filename_stripped = filename.split("?")[0]

    if filename_stripped.lower().endswith(".svg"):
        thumb = f"{base}/thumb/{hash_path}/{filename_stripped}/{width}px-{filename_stripped}.png"
    else:
        thumb = f"{base}/thumb/{hash_path}/{filename_stripped}/{width}px-{filename_stripped}"

    return thumb

UA = "CartaraIQ/1.0 (https://github.com/mattredman75/cartaraiq; loyalty-logo-downloader)"

def wiki_api_thumb_url(original_url: str, width: int = 120) -> Optional[str]:
    """
    Use the Wikimedia API to get a proper thumb URL.
    Falls back to direct thumb URL construction if API fails.
    """
    # Extract the filename from the URL
    m = re.search(r"/([^/]+)$", original_url)
    if not m:
        return None
    filename = m.group(1).split("?")[0]

    try:
        api_url = (
            "https://en.wikipedia.org/w/api.php"
            f"?action=query&titles=File:{urllib.parse.quote(filename)}"
            f"&prop=imageinfo&iiprop=url&iiurlwidth={width}&format=json"
        )
        req = urllib.request.Request(api_url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            infos = page.get("imageinfo", [])
            if infos:
                return infos[0].get("thumburl")
    except Exception:
        pass

    # Fall back to direct URL construction
    return wiki_thumb_url(original_url, width)

def download(url: str, dest: Path) -> bool:
    """Download URL to dest. Returns True on success."""
    if dest.exists():
        print(f"  ✓ cached  {dest.name}")
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        if len(data) < 100:
            print(f"  ✗ TINY response ({len(data)} bytes) for {dest.name}")
            return False
        dest.write_bytes(data)
        print(f"  ✓ downloaded  {dest.name}  ({len(data):,} bytes)")
        return True
    except Exception as e:
        print(f"  ✗ FAILED  {dest.name}  — {e}")
        return False

# ── Parse CSV ─────────────────────────────────────────────────────────────────
print(f"Reading {CSV_PATH} …")
programs = []
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter="|")
    for row in reader:
        name = row.get("Program", "").strip()
        prefix_raw = row.get("Prefix", "").strip()
        logo_url = row.get("card art", "").strip()

        if not name:
            continue

        # Parse prefixes — comma-separated digits only
        prefixes = []
        if prefix_raw and prefix_raw not in ("N/A", "Unknown", "Similar to AU"):
            for p in prefix_raw.split(","):
                p = p.strip()
                if p and re.match(r"^\d+$", p):
                    prefixes.append(p)

        slug = slugify(name)
        programs.append({
            "name": name,
            "slug": slug,
            "prefixes": prefixes,
            "logo_url": logo_url if logo_url and logo_url != "N/A" else None,
        })

print(f"Found {len(programs)} programs.\n")

# ── Download logos ────────────────────────────────────────────────────────────
print("Downloading logos …")
downloaded = {}
for prog in programs:
    slug = prog["slug"]
    dest = LOGOS_DIR / f"{slug}.png"
    url = prog["logo_url"]

    if url:
        thumb = wiki_api_thumb_url(url)
        if thumb:
            ok = download(thumb, dest)
        else:
            ok = False
        if ok:
            downloaded[slug] = dest
    else:
        print(f"  – no URL     {slug}")

    time.sleep(1.5)  # Wikimedia rate limit — be polite

print(f"\n{len(downloaded)}/{len(programs)} logos downloaded.\n")

# ── Generate loyaltyPrograms.ts ───────────────────────────────────────────────
print(f"Generating {TS_OUT} …")

lines = []
lines.append("// AUTO-GENERATED by tools/download_loyalty_logos.py — do not edit by hand")
lines.append("")
lines.append("export interface LoyaltyProgram {")
lines.append("  id: string;")
lines.append("  name: string;")
lines.append("  /** Known barcode prefixes that identify this program */")
lines.append("  prefixes: string[];")
lines.append("  /** Bundled logo image (require()) or null if unavailable */")
lines.append("  logo: any | null;")
lines.append("}")
lines.append("")

# Static require map — Metro needs these to be resolvable at build time
lines.append("const LOGO_MAP: Record<string, any> = {")
for prog in programs:
    slug = prog["slug"]
    if slug in downloaded:
        lines.append(f'  "{slug}": require("../assets/loyalty-logos/{slug}.png"),')
    else:
        lines.append(f'  "{slug}": null,')
lines.append("};")
lines.append("")

# Program list
lines.append("export const LOYALTY_PROGRAMS: LoyaltyProgram[] = [")
for prog in programs:
    slug = prog["slug"]
    prefixes_ts = "[" + ", ".join(f'"{p}"' for p in prog["prefixes"]) + "]"
    escaped_name = prog["name"].replace('"', '\\"')
    lines.append(f'  {{ id: "{slug}", name: "{escaped_name}", prefixes: {prefixes_ts}, logo: LOGO_MAP["{slug}"] }},')
lines.append("];")
lines.append("")

# Detection function
lines.append("/**")
lines.append(" * Try to identify which loyalty program a barcode belongs to.")
lines.append(" * Matches by known BIN/prefix. Returns null if unknown.")
lines.append(" */")
lines.append("export function detectProgram(barcode: string): LoyaltyProgram | null {")
lines.append("  const digits = barcode.replace(/\\D/g, \"\");")
lines.append("  // Prefer longer (more specific) prefix matches")
lines.append("  let best: LoyaltyProgram | null = null;")
lines.append("  let bestLen = 0;")
lines.append("  for (const prog of LOYALTY_PROGRAMS) {")
lines.append("    for (const prefix of prog.prefixes) {")
lines.append("      if (digits.startsWith(prefix) && prefix.length > bestLen) {")
lines.append("        best = prog;")
lines.append("        bestLen = prefix.length;")
lines.append("      }")
lines.append("    }")
lines.append("  }")
lines.append("  return best;")
lines.append("}")

TS_OUT.write_text("\n".join(lines) + "\n")
print(f"✓ Written {TS_OUT}")
print("\nDone! Next steps:")
print("  1. Run: cd app && npx expo start --clear")
print("  2. Metro will bundle the new logo assets automatically.")
