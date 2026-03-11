import "../global.css";
import { useEffect, useState, useCallback, useRef } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { Linking } from "react-native";
import { getItem, setItem, deleteItem } from "../lib/storage";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore, useListStore } from "../lib/store";
import { useAppStatus } from "../hooks/useAppStatus";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useLoyaltyPrograms } from "../hooks/useLoyaltyPrograms";
import { LoyaltyProgramsProvider } from "../contexts/LoyaltyProgramsContext";
import { MaintenanceScreen } from "../components/MaintenanceScreen";

/** Extract a share token from deep-link URLs.
 *  Handles both:
 *    cartaraiq://share/<token>
 *    https://cartaraiq.app/share/<token>
 */
function extractShareToken(url: string): string | null {
  try {
    // cartaraiq://share/<token>
    const nativeMatch = url.match(/^cartaraiq:\/\/share\/([^/?#]+)/i);
    if (nativeMatch) return nativeMatch[1];
    // https://cartaraiq.app/share/<token>
    const webMatch = url.match(/cartaraiq\.app\/share\/([^/?#]+)/i);
    if (webMatch) return webMatch[1];
  } catch {}
  return null;
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

function AuthGate() {
  const { token, setAuth } = useAuthStore();
  const { setCurrentList } = useListStore();
  const qc = useQueryClient();
  const segments = useSegments();
  const router = useRouter();
  const {
    maintenance,
    message,
    refresh,
    checkStatus,
    applyPushUpdate,
    setupAppStateListener,
    cleanup,
  } = useAppStatus();
  const [statusChecked, setStatusChecked] = useState(false);
  const [pendingShare, setPendingShare] = useState<string | null>(null);
  const pendingInviteProcessed = useRef(false);
  const handledShareUrl = useRef<string | null>(null);
  // Stable ref so the deep-link effect never re-runs due to router identity change
  const handleShareUrlRef = useRef<(url: string | null) => Promise<void>>(() =>
    Promise.resolve(),
  );

  // Handle maintenance updates from silent push
  const onMaintenanceUpdate = useCallback(
    (m: boolean, msg: string) => {
      applyPushUpdate(m, msg);
    },
    [applyPushUpdate],
  );

  // Prime loyalty programs cache at startup
  const { refresh: refreshLoyaltyPrograms } = useLoyaltyPrograms();

  const { register: registerPush, unregister: unregisterPush } =
    usePushNotifications({
      onMaintenanceUpdate,
      onLoyaltyProgramsUpdated: refreshLoyaltyPrograms,
    });

  // Initial status check (single request, no polling)
  useEffect(() => {
    (async () => {
      await checkStatus();
      setStatusChecked(true);
    })();
  }, []);

  // Register push token once user is authenticated
  useEffect(() => {
    if (token) {
      registerPush();
    }
  }, [token, registerPush]);

  useEffect(() => {
    // Setup app foreground listener to re-check maintenance status
    setupAppStateListener();
    return cleanup;
  }, [setupAppStateListener, cleanup]);

  useEffect(() => {
    (async () => {
      const storedToken = await getItem("auth_token");
      const storedUser = await getItem("auth_user");
      if (storedToken && storedUser) {
        setAuth(storedToken, JSON.parse(storedUser));
      }
    })();
  }, []);

  /** After login, navigate to the share screen so the user can Accept/Decline. */
  const processPendingInvite = useCallback(async () => {
    if (pendingInviteProcessed.current) return;
    const pendingToken = await getItem("pending_invite_token");
    if (!pendingToken) return;
    pendingInviteProcessed.current = true;
    await deleteItem("pending_invite_token");
    // Queue via state — the pendingShare effect pushes once on the app screen
    setPendingShare(pendingToken);
  }, []);

  /** Handle an incoming share URL (deep link or initial URL). */
  const handleShareUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    const shareToken = extractShareToken(url);
    if (!shareToken) return;
    // Prevent double-fire: getInitialURL + addEventListener both fire on cold-start
    if (handledShareUrl.current === shareToken) return;
    handledShareUrl.current = shareToken;
    const currentToken = useAuthStore.getState().token;
    if (!currentToken) {
      // Not authenticated — stash for after login
      await setItem("pending_invite_token", shareToken);
    } else {
      // Authenticated — queue via state; the pendingShare effect pushes once
      // the app is on the list screen, avoiding races with router.replace
      setPendingShare(shareToken);
    }
  }, []);

  // Keep the ref in sync with the latest version of the callback
  handleShareUrlRef.current = handleShareUrl;

  // Capture cold-start deep links ONLY — Expo Router handles foreground/background
  // taps automatically via file-based routing. We only need getInitialURL for the
  // case where the nav guard (router.replace "/(app)/list") wipes the initial route.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleShareUrlRef.current(url);
    });
    // No addEventListener — that would double-fire: Expo Router already navigates
    // to share/[token] for foreground/background deep links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user becomes authenticated, process any pending invite.
  // When user logs out, wipe cache and selected list so the next user
  // never sees stale data from the previous session.
  useEffect(() => {
    if (token) {
      processPendingInvite();
    } else {
      // Reset so it can be processed again on next login
      pendingInviteProcessed.current = false;
      // Clear all cached query data and the selected list
      qc.clear();
      setCurrentList(null);
    }
  }, [token, processPendingInvite]);

  // Push queued share invite once the app is on the main list screen.
  // This prevents the race where router.replace("/(app)/list") wipes a
  // router.push("/share/token") that fired during cold-start.
  useEffect(() => {
    if (!pendingShare) return;
    const onAppScreen = segments[0] === "(app)";
    if (!onAppScreen) return;
    const shareToken = pendingShare;
    setPendingShare(null);
    handledShareUrl.current = null; // allow future taps of the same link
    router.push(`/share/${shareToken}`);
  }, [pendingShare, segments, router]);

  // Navigation effect — must be declared before any conditional returns
  useEffect(() => {
    if (statusChecked && maintenance) return; // skip navigation when in maintenance
    const inAuthGroup = segments[0] === "(auth)";

    if (!token && !inAuthGroup) {
      router.replace("/(auth)/welcome");
    } else if (token && inAuthGroup) {
      router.replace("/(app)/list");
    }
  }, [token, segments, statusChecked, maintenance]);

  // If app is in maintenance mode, show maintenance screen and block all navigation
  if (statusChecked && maintenance) {
    return (
      <MaintenanceScreen
        message={message}
        onRefresh={async () => {
          const result = await refresh();
          // After refresh, if maintenance is over, let navigation flow resume
          if (result && !result.maintenance) {
            // Navigation will automatically update when maintenance becomes false
          }
        }}
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen
        name="share/[token]"
        options={{
          presentation: "transparentModal",
          animation: "slide_from_bottom",
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LoyaltyProgramsProvider>
            <AuthGate />
          </LoyaltyProgramsProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
