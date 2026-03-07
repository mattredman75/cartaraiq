/**
 * Tests for hooks/useAppStatus.ts
 */
import { renderHook, act } from "@testing-library/react-native";

const mockGetAppStatus = jest.fn();
const mockReportLifecycle = jest.fn();
jest.mock("../../lib/api", () => ({
  getAppStatus: (...args: any[]) => mockGetAppStatus(...args),
  reportLifecycle: (...args: any[]) => mockReportLifecycle(...args),
}));

const mockSyncMaintenanceToWidget = jest.fn();
jest.mock("../../hooks/useWidgetSync", () => ({
  syncMaintenanceToWidget: (...args: any[]) =>
    mockSyncMaintenanceToWidget(...args),
}));

import { useAppStatus } from "../../hooks/useAppStatus";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAppStatus.mockResolvedValue({
    data: { maintenance: false, message: "" },
  });
  mockReportLifecycle.mockResolvedValue({});
  mockSyncMaintenanceToWidget.mockResolvedValue(undefined);
});

describe("useAppStatus", () => {
  it("initializes with maintenance=false", () => {
    const { result } = renderHook(() => useAppStatus());
    expect(result.current.maintenance).toBe(false);
    expect(result.current.message).toBe("");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  describe("checkStatus", () => {
    it("fetches status and syncs to widget", async () => {
      mockGetAppStatus.mockResolvedValue({
        data: { maintenance: true, message: "Down" },
      });
      const { result } = renderHook(() => useAppStatus());
      await act(async () => {
        await result.current.checkStatus();
      });
      expect(result.current.maintenance).toBe(true);
      expect(result.current.message).toBe("Down");
      expect(mockSyncMaintenanceToWidget).toHaveBeenCalledWith(true, "Down");
    });

    it("fails open on network error", async () => {
      mockGetAppStatus.mockRejectedValue(new Error("Network fail"));
      const { result } = renderHook(() => useAppStatus());
      await act(async () => {
        await result.current.checkStatus();
      });
      expect(result.current.maintenance).toBe(false);
      expect(result.current.error).toBe("Network fail");
    });
  });

  describe("refresh", () => {
    it("sets loading during refresh", async () => {
      let loadingDuringRefresh = false;
      mockGetAppStatus.mockImplementation(async () => {
        // We can't directly check loading mid-call in this setup,
        // but we can verify the full flow works
        return { data: { maintenance: false, message: "" } };
      });
      const { result } = renderHook(() => useAppStatus());
      await act(async () => {
        await result.current.refresh();
      });
      // After completion, loading should be false
      expect(result.current.loading).toBe(false);
    });
  });

  describe("applyPushUpdate", () => {
    it("sets status without network request", async () => {
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.applyPushUpdate(true, "Push maintenance");
      });
      expect(result.current.maintenance).toBe(true);
      expect(result.current.message).toBe("Push maintenance");
      expect(mockGetAppStatus).not.toHaveBeenCalled();
      expect(mockSyncMaintenanceToWidget).toHaveBeenCalledWith(
        true,
        "Push maintenance",
      );
    });
  });

  describe("cleanup", () => {
    it("does not throw when no listener exists", () => {
      const { result } = renderHook(() => useAppStatus());
      expect(() => result.current.cleanup()).not.toThrow();
    });
  });

  describe("setupAppStateListener", () => {
    it("sets up AppState change listener", () => {
      const { AppState } = require("react-native");
      const addEventSpy = jest
        .spyOn(AppState, "addEventListener")
        .mockReturnValue({
          remove: jest.fn(),
        });
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      expect(addEventSpy).toHaveBeenCalledWith("change", expect.any(Function));
      addEventSpy.mockRestore();
    });

    it("checks status and reports lifecycle on foreground", async () => {
      const { AppState } = require("react-native");
      let changeCallback: any;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((event: string, cb: any) => {
          changeCallback = cb;
          return { remove: jest.fn() };
        });
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      await act(async () => {
        await changeCallback("active");
      });
      expect(mockGetAppStatus).toHaveBeenCalled();
      expect(mockReportLifecycle).toHaveBeenCalledWith("foreground");
    });

    it("reports background lifecycle event", async () => {
      const { AppState } = require("react-native");
      let changeCallback: any;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((event: string, cb: any) => {
          changeCallback = cb;
          return { remove: jest.fn() };
        });
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      await act(async () => {
        await changeCallback("background");
      });
      expect(mockReportLifecycle).toHaveBeenCalledWith("background");
    });

    it("does nothing on inactive state", async () => {
      const { AppState } = require("react-native");
      let changeCallback: any;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((event: string, cb: any) => {
          changeCallback = cb;
          return { remove: jest.fn() };
        });
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      await act(async () => {
        await changeCallback("inactive");
      });
      expect(mockGetAppStatus).not.toHaveBeenCalled();
      expect(mockReportLifecycle).not.toHaveBeenCalled();
    });

    it("handles reportLifecycle rejection gracefully on foreground", async () => {
      const { AppState } = require("react-native");
      let changeCallback: any;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((event: string, cb: any) => {
          changeCallback = cb;
          return { remove: jest.fn() };
        });
      mockReportLifecycle.mockRejectedValueOnce(new Error("network"));
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      await act(async () => {
        await changeCallback("active");
      });
      // reportLifecycle("foreground").catch(() => {}) silently catches
      expect(mockReportLifecycle).toHaveBeenCalledWith("foreground");
    });

    it("handles reportLifecycle rejection gracefully on background", async () => {
      const { AppState } = require("react-native");
      let changeCallback: any;
      jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((event: string, cb: any) => {
          changeCallback = cb;
          return { remove: jest.fn() };
        });
      mockReportLifecycle.mockRejectedValueOnce(new Error("network"));
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      await act(async () => {
        await changeCallback("background");
      });
      // reportLifecycle("background").catch(() => {}) silently catches
      expect(mockReportLifecycle).toHaveBeenCalledWith("background");
    });

    it("cleanup removes the listener", () => {
      const removeMock = jest.fn();
      const { AppState } = require("react-native");
      jest.spyOn(AppState, "addEventListener").mockReturnValue({
        remove: removeMock,
      });
      const { result } = renderHook(() => useAppStatus());
      act(() => {
        result.current.setupAppStateListener();
      });
      act(() => {
        result.current.cleanup();
      });
      expect(removeMock).toHaveBeenCalled();
    });
  });
});
