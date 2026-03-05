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
import { MaintenanceScreen } from '../components/MaintenanceScreen';
import AnimatedSplash from '../components/AnimatedSplash';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate() {
  const { token, setAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const { maintenance, message, refresh, checkStatus, setupAppStateListener, cleanup } = useAppStatus();
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    (async () => {
      // Check maintenance status on app start
      await checkStatus();
      setStatusChecked(true);
    })();
  }, []);

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

  // Otherwise, continue with normal auth-based navigation
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (token && inAuthGroup) {
      router.replace('/(app)/list');
    }
  }, [token, segments]);

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  useEffect(() => {
    // Hide the native splash as soon as possible — our animated one is
    // already rendering on top so the user sees a seamless transition
    // from native splash → animated splash (same bg + logo, then rings start).
    SplashScreen.hideAsync();
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  // Show the animated splash even while fonts are loading — this prevents
  // any white flash between native splash and our animated version.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {fontsLoaded ? (
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthGate />
          </QueryClientProvider>
        </SafeAreaProvider>
      ) : null}
      {showAnimatedSplash && <AnimatedSplash onFinish={handleSplashFinish} />}
    </GestureHandlerRootView>
  );
}
