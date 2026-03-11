export const COLORS = {
  tealDark: "#0D4F5C",
  teal: "#1B6B7A",
  tealMid: "#2A8A9A",
  tealLight: "#4FB8C8",
  cyan: "#00C2CB",
  amber: "#F5C842",
  ink: "#1A1A2E",
  surface: "#F5F9FA",
  card: "#FFFFFF",
  border: "#E8F0F2",
  muted: "#8A9BA2",
  danger: "#EF4444",
  success: "#10B981",
  mutedSemiTransparent: "rgba(100, 116, 139, 0.5)",
};

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://api.cartaraiq.app";

/**
 * Fixes avatar_url values that were incorrectly stored with the app's custom
 * URL scheme (cartaraiq://uploads/...) instead of an http URL. This happened
 * when APP_BASE_URL was set to the deep-link scheme in local dev.
 */
export function sanitizeAvatarUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  // Fix URLs stored with the deep-link scheme instead of http
  if (url.startsWith("cartaraiq://uploads/")) {
    return url.replace("cartaraiq:/", API_URL);
  }
  // Fix URLs stored with localhost — replace with the app's configured API base
  // so the URL works on physical devices / simulators where localhost is the device
  if (url.startsWith("http://localhost:")) {
    const withoutOrigin = url.replace(/^http:\/\/localhost:\d+/, "");
    return `${API_URL}${withoutOrigin}`;
  }
  return url;
}
