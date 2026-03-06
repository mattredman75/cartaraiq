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

  const googleRedirectUri = AuthSession.makeRedirectUri({
    scheme: "cartaraiq",
    path: "redirect",
  });

  const [googleRequest, , googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleClientId,
      scopes: ["openid", "profile", "email"],
      redirectUri: googleRedirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
    },
    googleDiscovery
  );

  // ── Facebook ──
  const facebookRedirectUri = AuthSession.makeRedirectUri({
    scheme: "cartaraiq",
    path: "redirect",
  });

  const [facebookRequest, , facebookPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: FACEBOOK_APP_ID,
      scopes: ["public_profile", "email"],
      redirectUri: facebookRedirectUri,
      responseType: AuthSession.ResponseType.Token,
      extraParams: { display: "popup" },
    },
    {
      authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenEndpoint: "https://graph.facebook.com/v19.0/oauth/access_token",
    }
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
      if (result.type !== "success" || !result.params?.id_token) {
        if (result.type === "dismiss" || result.type === "cancel") return;
        throw new Error("Google sign in failed.");
      }
      await finishLogin({
        provider: "google",
        id_token: result.params.id_token,
      });
    } catch (e: any) {
      if (e.message?.includes("cancelled")) return;
      Alert.alert("Google Sign In", e.message ?? "Something went wrong.");
    }
  };

  const loginWithFacebook = async () => {
    try {
      const result = await facebookPromptAsync();
      if (result.type !== "success" || !result.params?.access_token) {
        if (result.type === "dismiss" || result.type === "cancel") return;
        throw new Error("Facebook sign in failed.");
      }
      await finishLogin({
        provider: "facebook",
        id_token: result.params.access_token,
      });
    } catch (e: any) {
      if (e.message?.includes("cancelled")) return;
      Alert.alert("Facebook Sign In", e.message ?? "Something went wrong.");
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
    facebookReady: !!facebookRequest,
  };
}
