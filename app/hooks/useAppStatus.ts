import { useCallback, useState, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { getAppStatus } from "../lib/api";
import { syncMaintenanceToWidget } from "./useWidgetSync";

interface AppStatus {
  maintenance: boolean;
  message: string;
}

/**
 * App status hook — checks maintenance mode.
 *
 * Performs a single HTTP check on:
 *   - App launch
 *   - App returning to foreground
 *
 * Real-time updates are delivered via silent push notifications
 * (see usePushNotifications). No periodic polling.
 */
export function useAppStatus() {
  const [status, setStatus] = useState<AppStatus>({
    maintenance: false,
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appStateSubscription = useRef<any>(null);

  // Check app status from backend (single request)
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

  /**
   * Called by usePushNotifications when a maintenance_update push arrives.
   * Updates state immediately without making a network request.
   */
  const applyPushUpdate = useCallback(
    (maintenance: boolean, message: string) => {
      setStatus({ maintenance, message });
      syncMaintenanceToWidget(maintenance, message);
    },
    [],
  );

  // Listen for app foreground events — single check, no polling
  const setupAppStateListener = useCallback(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          // App came to foreground — single check
          await checkStatus();
        }
      },
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
    applyPushUpdate,
    setupAppStateListener,
    cleanup,
  };
}
