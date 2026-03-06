import { useEffect, useRef, useCallback } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerPushToken, unregisterPushToken } from "../lib/api";

// Lazy-load native modules so the app doesn't crash before a rebuild
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");

  // Configure notification handler — silent pushes don't show an alert
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
} catch {
  console.warn(
    "expo-notifications native module not available — push disabled until next native rebuild",
  );
}

interface UsePushNotificationsOptions {
  /** Called when a maintenance update push arrives */
  onMaintenanceUpdate?: (maintenance: boolean, message: string) => void;
}

export function usePushNotifications({
  onMaintenanceUpdate,
}: UsePushNotificationsOptions = {}) {
  const tokenRef = useRef<string | null>(null);
  const notificationListener = useRef<any>(null);

  /** Register for push and send token to backend */
  const register = useCallback(async () => {
    if (!Notifications || !Device) return;
    try {
      // Only request on physical devices
      if (!Device.isDevice) return;

      // Request permissions
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return;

      // Get Expo push token
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const token = pushToken.data;
      tokenRef.current = token;

      // Register with backend
      await registerPushToken(token);

      // Android notification channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
    } catch (err) {
      console.error("Failed to register push token:", err);
    }
  }, []);

  /** Unregister token from backend (call on logout) */
  const unregister = useCallback(async () => {
    if (tokenRef.current) {
      try {
        await unregisterPushToken(tokenRef.current);
      } catch (err) {
        console.error("Failed to unregister push token:", err);
      }
      tokenRef.current = null;
    }
  }, []);

  // Listen for incoming notifications (foreground + background response)
  useEffect(() => {
    if (!Notifications) return;

    const handleNotificationData = (data: Record<string, any> | undefined) => {
      if (data?.type === "maintenance_update" && onMaintenanceUpdate) {
        onMaintenanceUpdate(
          Boolean(data.maintenance),
          String(data.message ?? ""),
        );
      }
    };

    // Fires when a notification is received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        handleNotificationData(data);
      });

    // Fires when user taps a notification (app in background/killed)
    const responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        handleNotificationData(data);
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      responseListener.remove();
    };
  }, [onMaintenanceUpdate]);

  return { register, unregister, token: tokenRef };
}
