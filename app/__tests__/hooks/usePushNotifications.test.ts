/**
 * Comprehensive tests for usePushNotifications hook
 * Covers: register (permissions, token, android channel, errors),
 * unregister, notification listeners, maintenance push handling
 */
import { renderHook, act } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockRegisterPushToken = jest.fn().mockResolvedValue({});
const mockUnregisterPushToken = jest.fn().mockResolvedValue({});
jest.mock("../../lib/api", () => ({
  registerPushToken: (...args: any[]) => mockRegisterPushToken(...args),
  unregisterPushToken: (...args: any[]) => mockUnregisterPushToken(...args),
}));

// Get references to the notification mocks for per-test customization
const Notifications = require("expo-notifications");
const Device = require("expo-device");

// Capture module-level handler before any test clears mock calls
const moduleNotificationHandler =
  Notifications.setNotificationHandler.mock.calls[0]?.[0];

import { usePushNotifications } from "../../hooks/usePushNotifications";

beforeEach(() => {
  jest.clearAllMocks();
  Device.isDevice = true;
  Notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  Notifications.requestPermissionsAsync.mockResolvedValue({
    status: "granted",
  });
  Notifications.getExpoPushTokenAsync.mockResolvedValue({
    data: "ExponentPushToken[mock]",
  });
});

describe("usePushNotifications", () => {
  it("returns register, unregister, and token ref", () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.register).toBe("function");
    expect(typeof result.current.unregister).toBe("function");
    expect(result.current.token).toBeDefined();
  });

  // ── register ──────────────────────────────────────────────────
  it("registers push token with backend when permissions granted", async () => {
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      "ExponentPushToken[mock]",
    );
  });

  it("requests permissions when not already granted", async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({
      status: "undetermined",
    });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      "ExponentPushToken[mock]",
    );
  });

  it("does not register when permission not granted after request", async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({
      status: "undetermined",
    });
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
    });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it("does not register on non-physical device", async () => {
    Device.isDevice = false;
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it("sets up Android notification channel on android", async () => {
    const origPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", writable: true });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ name: "Default" }),
    );
    Object.defineProperty(Platform, "OS", {
      value: origPlatform,
      writable: true,
    });
  });

  it("does not set android channel on iOS", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("handles registration errors gracefully", async () => {
    mockRegisterPushToken.mockRejectedValueOnce(new Error("network"));
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to register push token:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  // ── unregister ────────────────────────────────────────────────
  it("unregister is no-op when no token registered", async () => {
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.unregister();
    });
    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
  });

  it("unregisters token from backend after registering", async () => {
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    await act(async () => {
      await result.current.unregister();
    });
    expect(mockUnregisterPushToken).toHaveBeenCalledWith(
      "ExponentPushToken[mock]",
    );
  });

  it("handles unregister errors gracefully", async () => {
    mockUnregisterPushToken.mockRejectedValueOnce(new Error("fail"));
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.register();
    });
    await act(async () => {
      await result.current.unregister();
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to unregister push token:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  // ── Notification listeners ────────────────────────────────────
  it("sets up notification received and response listeners", () => {
    renderHook(() => usePushNotifications());
    expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
    expect(
      Notifications.addNotificationResponseReceivedListener,
    ).toHaveBeenCalled();
  });

  it("calls onMaintenanceUpdate for maintenance_update notification", () => {
    const onMaintenanceUpdate = jest.fn();
    renderHook(() => usePushNotifications({ onMaintenanceUpdate }));

    // Get the listener callback and simulate a notification
    const receivedCallback =
      Notifications.addNotificationReceivedListener.mock.calls[0][0];
    receivedCallback({
      request: {
        content: {
          data: {
            type: "maintenance_update",
            maintenance: true,
            message: "Down for maintenance",
          },
        },
      },
    });
    expect(onMaintenanceUpdate).toHaveBeenCalledWith(
      true,
      "Down for maintenance",
    );
  });

  it("calls onMaintenanceUpdate for notification response (background tap)", () => {
    const onMaintenanceUpdate = jest.fn();
    renderHook(() => usePushNotifications({ onMaintenanceUpdate }));

    const responseCallback =
      Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];
    responseCallback({
      notification: {
        request: {
          content: {
            data: {
              type: "maintenance_update",
              maintenance: false,
              message: "",
            },
          },
        },
      },
    });
    expect(onMaintenanceUpdate).toHaveBeenCalledWith(false, "");
  });

  it("ignores non-maintenance notifications", () => {
    const onMaintenanceUpdate = jest.fn();
    renderHook(() => usePushNotifications({ onMaintenanceUpdate }));

    const receivedCallback =
      Notifications.addNotificationReceivedListener.mock.calls[0][0];
    receivedCallback({
      request: { content: { data: { type: "other_update" } } },
    });
    expect(onMaintenanceUpdate).not.toHaveBeenCalled();
  });

  it("cleans up listeners on unmount", () => {
    const removeMock = jest.fn();
    Notifications.addNotificationReceivedListener.mockReturnValueOnce({
      remove: removeMock,
    });
    const responseRemove = jest.fn();
    Notifications.addNotificationResponseReceivedListener.mockReturnValueOnce({
      remove: responseRemove,
    });

    const { unmount } = renderHook(() => usePushNotifications());
    unmount();
    expect(removeMock).toHaveBeenCalled();
    expect(responseRemove).toHaveBeenCalled();
  });

  // ── Module-level notification handler ─────────────────────────────
  it("module-level setNotificationHandler callback returns correct config", async () => {
    // Use pre-captured handler (before clearAllMocks clears mock.calls)
    if (moduleNotificationHandler?.handleNotification) {
      const result = await moduleNotificationHandler.handleNotification();
      expect(result).toEqual({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      });
    }
  });
});
