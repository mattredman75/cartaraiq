import { useCallback, useState, useRef, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getAppStatus } from "../lib/api";
import { syncMaintenanceToWidget } from "./useWidgetSync";

const POLL_INTERVAL_MS = 20_000; // Check every 20 seconds

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
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check app status from backend
  const checkStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await getAppStatus();
      const maintenanceFlag = response.data.maintenance;
      const maintenanceMessage = response.data.message || "";
      setStatus({
        maintenance: maintenanceFlag,
        message: maintenanceMessage,
      });
      // Sync maintenance status to the iOS widget
      syncMaintenanceToWidget(maintenanceFlag, maintenanceMessage);
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
      const result = await checkStatus();
      return result;
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
          // App came to foreground, check status and restart polling
          await checkStatus();
          startPolling();
        } else if (nextAppState === "background") {
          // Stop polling when app goes to background
          stopPolling();
        }
      }
    );
    appStateSubscription.current = subscription;
  }, [checkStatus]);

  // Start periodic polling
  const startPolling = useCallback(() => {
    stopPolling();
    pollInterval.current = setInterval(() => {
      checkStatus();
    }, POLL_INTERVAL_MS);
  }, [checkStatus]);

  // Stop periodic polling
  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  // Cleanup listener and polling
  const cleanup = useCallback(() => {
    if (appStateSubscription.current) {
      appStateSubscription.current.remove();
    }
    stopPolling();
  }, [stopPolling]);

  return {
    maintenance: status.maintenance,
    message: status.message,
    loading,
    error,
    checkStatus,
    refresh,
    setupAppStateListener,
    startPolling,
    cleanup,
  };
}
