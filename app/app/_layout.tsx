import '../global.css';
import { useEffect, useState, useCallback } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { getItem } from '../lib/storage';
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../lib/store';
import { useAppStatus } from '../hooks/useAppStatus';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useLoyaltyPrograms } from '../hooks/useLoyaltyPrograms';
import { LoyaltyProgramsProvider } from '../contexts/LoyaltyProgramsContext';
import { MaintenanceScreen } from '../components/MaintenanceScreen';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate() {
  const { token, setAuth } = useAuthStore();
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
    usePushNotifications({ onMaintenanceUpdate, onLoyaltyProgramsUpdated: refreshLoyaltyPrograms });

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
      const storedToken = await getItem('auth_token');
      const storedUser = await getItem('auth_user');
      if (storedToken && storedUser) {
        setAuth(storedToken, JSON.parse(storedUser));
      }
    })();
  }, []);

  // Navigation effect — must be declared before any conditional returns
  useEffect(() => {
    if (statusChecked && maintenance) return; // skip navigation when in maintenance
    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (token && inAuthGroup) {
      router.replace('/(app)/list');
    }
  }, [token, segments, statusChecked, maintenance]);

  // If app is in maintenance mode, show maintenance screen and block all navigation
  if (statusChecked && maintenance) {
    return <MaintenanceScreen message={message} onRefresh={async () => {
      const result = await refresh();
      // After refresh, if maintenance is over, let navigation flow resume
      if (result && !result.maintenance) {
        // Navigation will automatically update when maintenance becomes false
      }
    }} />;
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
