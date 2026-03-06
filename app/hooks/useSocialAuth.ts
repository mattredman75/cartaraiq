import { Platform, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { authSocial } from "../lib/api";
import { setItem } from "../lib/storage";
import { useAuthStore } from "../lib/store";

// Required for Google auth session on web/Android
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? "";

// ─── Apple (standalone, no hooks needed) ─────────────────
async function signInWithApple(): Promise<{
  provider: string;
  id_token: string;
  name?: string;
}> {
  const nonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Crypto.getRandomBytes(32).toString()
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce,
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In failed — no identity token returned.");
  }

  // Apple only gives name on the FIRST sign-in
  const name =
    credential.fullName?.givenName && credential.fullName?.familyName
      ? `${credential.fullName.givenName} ${credential.fullName.familyName}`
      : undefined;

  return { provider: "apple", id_token: credential.identityToken, name };
}

// ─── Main hook ───────────────────────────────────────────
export function useSocialAuth() {
  const setAuth = useAuthStore((s) => s.setAuth);

  // ── Google (hooks must be at top level of this hook) ──
  const googleDiscovery = AuthSession.useAutoDiscovery(
    "https://accounts.google.com"
  );

  const googleClientId =
    Platform.OS === "ios" ? GOOGLE_IOS_CLIENT_ID : GOOGLE_WEB_CLIENT_ID;

  // iOS: Google requires the reversed client ID as the redirect URI scheme
  const googleRedirectUri =
    Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID
      ? `${GOOGLE_IOS_CLIENT_ID.split(".").reverse().join(".")}:/oauthredirect`
      : AuthSession.makeRedirectUri({ scheme: "cartaraiq", path: "redirect" });

  const [googleRequest, , googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId,
      scopes: ["openid", "profile", "email"],
      redirectUri: googleRedirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    googleDiscovery
  );

  // ── Shared login finisher ──
  const finishLogin = async (payload: {
    provider: string;
    id_token: string;
    name?: string;
  }) => {
    const res = await authSocial(
      payload.provider,
      payload.id_token,
      payload.name
    );
    const { access_token, user } = res.data;
    await setItem("auth_token", access_token);
    await setItem("auth_user", JSON.stringify(user));
    setAuth(access_token, user);
  };

  // ── Facebook ──
  // Facebook rejects custom-scheme redirect URIs, so we use an HTTPS bridge
  // page + WebBrowser.openAuthSessionAsync which handles the cartaraiq://
  // deep-link return properly on iOS.
  const facebookRedirectUri = "https://api.cartaraiq.app/auth/callback.html";

  const loginWithFacebook = async () => {
    try {
      const state = Math.random().toString(36).substring(2);
      const authUrl =
        `https://www.facebook.com/v19.0/dialog/oauth` +
        `?client_id=${FACEBOOK_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(facebookRedirectUri)}` +
        `&response_type=token` +
        `&scope=public_profile,email` +
        `&state=${state}` +
        `&display=popup`;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        "cartaraiq://redirect"
      );

      if (result.type !== "success" || !result.url) {
        if (result.type === "cancel" || result.type === "dismiss") return;
        throw new Error("Facebook sign in failed.");
      }

      // Parse access_token from the returned URL
      // The callback page redirects to: cartaraiq://redirect?access_token=...&...
      const url = new URL(result.url);
      const accessToken =
        url.searchParams.get("access_token") ||
        // Some browsers may keep it as a hash fragment
        new URLSearchParams(url.hash.substring(1)).get("access_token");

      if (!accessToken) {
        throw new Error("No access token received from Facebook.");
      }

      await finishLogin({ provider: "facebook", id_token: accessToken });
    } catch (e: any) {
      if (e.message?.includes("cancelled")) return;
      Alert.alert("Facebook Sign In", e.message ?? "Something went wrong.");
    }
  };

  // ── Provider sign-in functions ──
  const loginWithApple = async () => {
    try {
      const payload = await signInWithApple();
      await finishLogin(payload);
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED") return;
      Alert.alert("Apple Sign In", e.message ?? "Something went wrong.");
    }
  };

  const loginWithGoogle = async () => {
    try {
      const result = await googlePromptAsync();
      if (result.type !== "success" || !result.params?.code) {
        if (result.type === "dismiss" || result.type === "cancel") return;
        throw new Error("Google sign in failed.");
      }

      // Exchange auth code for tokens
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: result.params.code,
          client_id: googleClientId,
          redirect_uri: googleRedirectUri,
          grant_type: "authorization_code",
          code_verifier: googleRequest?.codeVerifier ?? "",
        }).toString(),
      });

      const tokenData = await tokenResp.json();
      if (!tokenData.id_token) {
        throw new Error("Failed to exchange Google auth code for ID token.");
      }

      await finishLogin({
        provider: "google",
        id_token: tokenData.id_token,
      });
    } catch (e: any) {
      if (e.message?.includes("cancelled")) return;
      Alert.alert("Google Sign In", e.message ?? "Something went wrong.");
    }
  };

  return {
    loginWithApple,
    loginWithGoogle,
    loginWithFacebook,
    // Availability flags
    appleAvailable: Platform.OS === "ios",
    googleAvailable: !!GOOGLE_IOS_CLIENT_ID || !!GOOGLE_WEB_CLIENT_ID,
    facebookAvailable: !!FACEBOOK_APP_ID,
    googleReady: !!googleRequest,
    facebookReady: true,
  };
}
