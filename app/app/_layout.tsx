import "../global.css";
import { useEffect, useState, useCallback, useRef } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
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
import { acceptListInvite } from "../lib/api";

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

const queryClient = new QueryClient();

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
  const pendingInviteProcessed = useRef(false);

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

  /** Accept a pending invite token after authentication. */
  const processPendingInvite = useCallback(async () => {
    if (pendingInviteProcessed.current) return;
    const pendingToken = await getItem("pending_invite_token");
    if (!pendingToken) return;
    pendingInviteProcessed.current = true;
    await deleteItem("pending_invite_token");
    try {
      await acceptListInvite(pendingToken);
    } catch {
      // silently ignore — user may already be a member or token may be stale
    }
  }, []);

  /** Handle an incoming share URL (deep link or initial URL). */
  const handleShareUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    const shareToken = extractShareToken(url);
    if (!shareToken) return;
    const currentToken = useAuthStore.getState().token;
    if (currentToken) {
      // Already authenticated — accept inline
      try {
        await acceptListInvite(shareToken);
      } catch {
        // ignore — already a member or token stale
      }
    } else {
      // Not authenticated — stash for after login
      await setItem("pending_invite_token", shareToken);
    }
  }, []);

  // Capture cold-start deep links
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleShareUrl(url);
    });

    const sub = Linking.addEventListener("url", (e) => handleShareUrl(e.url));
    return () => sub.remove();
  }, [handleShareUrl]);

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

  // Navigation effect — must be declared before any conditional returns
  useEffect(() => {
    if (statusChecked && maintenance) return; // skip navigation when in maintenance
    const inAuthGroup = segments[0] === "(auth)";
    // Allow the share accept screen to handle its own auth logic
    const inShareRoute = segments[0] === "share";

    if (!token && !inAuthGroup && !inShareRoute) {
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

  return <Slot />;
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
