/**
 * Loyalty program types — data is fetched dynamically from the API via
 * useLoyaltyPrograms(). Nothing is hardcoded here any more.
 */

export interface DetectionRules {
  prefixes: string[];
  lengths: number[];
  symbology: string[];
}

export interface LoyaltyProgram {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  logo_background: string | null;
  detection_rules: DetectionRules;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
}


/**
 * Try to identify which loyalty program a barcode belongs to.
 * Matches by known prefix from detection_rules. Returns null if unknown.
 * Pure function — pass programs from useLoyaltyPrograms().
 */
export function detectProgram(
  barcode: string,
  programs: LoyaltyProgram[]
): LoyaltyProgram | null {
  const digits = barcode.replace(/\D/g, "");
  let best: LoyaltyProgram | null = null;
  let bestLen = 0;
  for (const prog of programs) {
    for (const prefix of prog.detection_rules.prefixes) {
      if (digits.startsWith(prefix) && prefix.length > bestLen) {
        best = prog;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
