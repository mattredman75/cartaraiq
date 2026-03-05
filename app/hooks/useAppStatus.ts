import { useCallback, useState, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getAppStatus } from "../lib/api";

interface AppStatus {
  maintenance: boolean;
  message: string;
}

export function useAppStatus() {
  const [status, setStatus] = useState<AppStatus>({
    maintenance: false,
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appStateSubscription = useRef<any>(null);

  // Check app status from backend
  const checkStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await getAppStatus();
      setStatus({
        maintenance: response.data.maintenance,
        message: response.data.message || "",
      });
      return response.data;
    } catch (err: any) {
      console.error("Failed to check app status:", err);
      setError(err.message);
      // On network errors, assume app is operational (fail open)
      setStatus({ maintenance: false, message: "" });
      return null;
    }
  }, []);

  // Manual refresh with loading state
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await checkStatus();
    } finally {
      setLoading(false);
    }
  }, [checkStatus]);

  // Listen for app foreground events
  const setupAppStateListener = useCallback(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          // App came to foreground, check status
          await checkStatus();
        }
      }
    );
    appStateSubscription.current = subscription;
  }, [checkStatus]);

  // Cleanup listener
  const cleanup = useCallback(() => {
    if (appStateSubscription.current) {
      appStateSubscription.current.remove();
    }
  }, []);

  return {
    maintenance: status.maintenance,
    message: status.message,
    loading,
    error,
    checkStatus,
    refresh,
    setupAppStateListener,
    cleanup,
  };
}
