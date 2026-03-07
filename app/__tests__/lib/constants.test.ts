import { COLORS, API_URL } from "../../lib/constants";

describe("lib/constants", () => {
  describe("COLORS", () => {
    it("should export a COLORS object with all required keys", () => {
      const requiredKeys = [
        "tealDark",
        "teal",
        "tealMid",
        "tealLight",
        "cyan",
        "amber",
        "ink",
        "surface",
        "card",
        "border",
        "muted",
        "danger",
        "success",
      ];
      requiredKeys.forEach((key) => {
        expect(COLORS).toHaveProperty(key);
      });
    });

    it("should have valid hex color values", () => {
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      Object.entries(COLORS).forEach(([key, value]) => {
        expect(value).toMatch(hexPattern);
      });
    });

    it("should have distinct values for contrasting colors", () => {
      // Surface vs ink must be different for readability
      expect(COLORS.surface).not.toBe(COLORS.ink);
      // Card vs danger must be different for visibility
      expect(COLORS.card).not.toBe(COLORS.danger);
    });
  });

  describe("API_URL", () => {
    it("should be a string", () => {
      expect(typeof API_URL).toBe("string");
    });
  });
});
