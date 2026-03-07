/**
 * Tests for hooks/useBiometricAuth.ts
 */
import { renderHook, act } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Crypto from "expo-crypto";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();
jest.mock("../../lib/storage", () => ({
  getItem: (...args: any[]) => mockGetItem(...args),
  setItem: (...args: any[]) => mockSetItem(...args),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
}));

import { useBiometricAuth } from "../../hooks/useBiometricAuth";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockDeleteItem.mockResolvedValue(undefined);
  (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
  (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
  (
    LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock
  ).mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  ]);
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
    success: true,
  });
  (Crypto.digestStringAsync as jest.Mock).mockResolvedValue("hashed-pin-123");
  (Crypto.getRandomBytes as jest.Mock).mockReturnValue(new Uint8Array(32));
});

describe("useBiometricAuth", () => {
  // ── checkBiometricAvailability ──
  describe("checkBiometricAvailability", () => {
    it("returns true and sets biometricType when hardware enrolled", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let enrolled: boolean;
      await act(async () => {
        enrolled = await result.current.checkBiometricAvailability();
      });
      expect(enrolled!).toBe(true);
      expect(result.current.isBiometricAvailable).toBe(true);
      expect(result.current.biometricType).toBe("faceId");
    });

    it("returns false when no hardware", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(
        false,
      );
      const { result } = renderHook(() => useBiometricAuth());
      let enrolled: boolean;
      await act(async () => {
        enrolled = await result.current.checkBiometricAvailability();
      });
      expect(enrolled!).toBe(false);
      expect(result.current.isBiometricAvailable).toBe(false);
    });

    it("returns false when not enrolled", async () => {
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(
        false,
      );
      const { result } = renderHook(() => useBiometricAuth());
      let enrolled: boolean;
      await act(async () => {
        enrolled = await result.current.checkBiometricAvailability();
      });
      expect(enrolled!).toBe(false);
    });

    it("handles errors gracefully", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockRejectedValue(
        new Error("fail"),
      );
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.checkBiometricAvailability();
      });
      expect(result.current.isBiometricAvailable).toBe(false);
      expect(result.current.error).toContain("Error checking biometric");
    });

    it("detects FINGERPRINT type on iOS as touchId", async () => {
      (
        LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock
      ).mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.checkBiometricAvailability();
      });
      // On test env (non-android), FINGERPRINT maps to touchId
      expect(result.current.biometricType).toContain("Id");
    });

    it("detects IRIS type", async () => {
      (
        LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock
      ).mockResolvedValue([LocalAuthentication.AuthenticationType.IRIS]);
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.checkBiometricAvailability();
      });
      expect(result.current.biometricType).toBe("iris");
    });

    it("detects multiple biometric types", async () => {
      (
        LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock
      ).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.checkBiometricAvailability();
      });
      expect(result.current.biometricType).toContain("faceId");
      expect(result.current.biometricType).toContain("/");
    });
  });

  // ── authenticateWithBiometric ──
  describe("authenticateWithBiometric", () => {
    it("returns true on success", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.authenticateWithBiometric();
      });
      expect(ok!).toBe(true);
    });

    it("returns false and sets error on user_cancel", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "user_cancel",
      });
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.authenticateWithBiometric();
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("cancelled");
    });

    it("returns false on user_fallback", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "user_fallback",
      });
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.authenticateWithBiometric();
      });
      expect(result.current.error).toContain("use PIN");
    });

    it("returns false on system_cancel", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "system_cancel",
      });
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.authenticateWithBiometric();
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("cancelled");
    });

    it("returns false on unknown error", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "lockout",
      });
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.authenticateWithBiometric();
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("lockout");
    });

    it("handles exception from authenticateAsync", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockRejectedValue(
        new Error("hardware error"),
      );
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.authenticateWithBiometric();
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("hardware error");
    });
  });

  // ── storeBiometricCredentials / getBiometricCredentials ──
  describe("credential storage", () => {
    it("stores credentials in secure storage", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.storeBiometricCredentials(
          "a@b.com",
          "pw",
          "hash",
        );
      });
      expect(ok!).toBe(true);
      expect(mockSetItem).toHaveBeenCalledWith(
        "biometric_credentials",
        expect.stringContaining("a@b.com"),
      );
      expect(mockSetItem).toHaveBeenCalledWith("biometric_enabled", "true");
      expect(mockSetItem).toHaveBeenCalledWith("pin_enabled", "true");
    });

    it("retrieves stored credentials", async () => {
      const creds = { email: "a@b.com", password: "pw", pinHash: "hash" };
      mockGetItem.mockResolvedValue(JSON.stringify(creds));
      const { result } = renderHook(() => useBiometricAuth());
      let got: any;
      await act(async () => {
        got = await result.current.getBiometricCredentials();
      });
      expect(got).toEqual(creds);
    });

    it("returns null when no credentials stored", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let got: any;
      await act(async () => {
        got = await result.current.getBiometricCredentials();
      });
      expect(got).toBeNull();
    });

    it("returns null and sets error on parse failure", async () => {
      mockGetItem.mockResolvedValue("not-valid-json");
      const { result } = renderHook(() => useBiometricAuth());
      let got: any;
      await act(async () => {
        got = await result.current.getBiometricCredentials();
      });
      expect(got).toBeNull();
      expect(result.current.error).toContain("Failed to retrieve");
    });

    it("handles storeBiometricCredentials failure", async () => {
      mockSetItem.mockRejectedValueOnce(new Error("storage full"));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.storeBiometricCredentials("a@b.com", "pw");
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("Failed to store");
    });
  });

  // ── isBiometricEnabled / isPinEnabled ──
  describe("feature flags", () => {
    it("isBiometricEnabled returns stored value", async () => {
      mockGetItem.mockResolvedValue("true");
      const { result } = renderHook(() => useBiometricAuth());
      let val: boolean;
      await act(async () => {
        val = await result.current.isBiometricEnabled();
      });
      expect(val!).toBe(true);
    });

    it("isPinEnabled falls back to biometric_enabled", async () => {
      // pin_enabled is null, biometric_enabled is "true"
      mockGetItem.mockImplementation(async (key: string) => {
        if (key === "pin_enabled") return null;
        if (key === "biometric_enabled") return "true";
        return null;
      });
      const { result } = renderHook(() => useBiometricAuth());
      let val: boolean;
      await act(async () => {
        val = await result.current.isPinEnabled();
      });
      expect(val!).toBe(true);
    });

    it("isBiometricEnabled returns false on error", async () => {
      mockGetItem.mockRejectedValue(new Error("storage error"));
      const { result } = renderHook(() => useBiometricAuth());
      let val: boolean;
      await act(async () => {
        val = await result.current.isBiometricEnabled();
      });
      expect(val!).toBe(false);
    });

    it("isPinEnabled returns false on error", async () => {
      mockGetItem.mockRejectedValue(new Error("storage error"));
      const { result } = renderHook(() => useBiometricAuth());
      let val: boolean;
      await act(async () => {
        val = await result.current.isPinEnabled();
      });
      expect(val!).toBe(false);
    });
  });

  // ── disableBiometricLogin / enablePin / disablePin ──
  describe("toggle methods", () => {
    it("disableBiometricLogin sets false and auto-enables PIN", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.disableBiometricLogin();
      });
      expect(mockSetItem).toHaveBeenCalledWith("biometric_enabled", "false");
      expect(mockSetItem).toHaveBeenCalledWith("pin_enabled", "true");
    });

    it("enablePin sets pin_enabled to true", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.enablePin();
      });
      expect(ok!).toBe(true);
      expect(mockSetItem).toHaveBeenCalledWith("pin_enabled", "true");
    });

    it("disablePin sets pin_enabled to false", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.disablePin();
      });
      expect(mockSetItem).toHaveBeenCalledWith("pin_enabled", "false");
    });

    it("disableBiometricLogin returns false on error", async () => {
      mockSetItem.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: any;
      await act(async () => {
        ok = await result.current.disableBiometricLogin();
      });
      expect(ok).toBe(false);
      expect(result.current.error).toContain("Failed to disable biometric");
    });

    it("enablePin returns false on error", async () => {
      mockSetItem.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.enablePin();
      });
      expect(ok!).toBe(false);
    });

    it("disablePin returns false on error", async () => {
      mockSetItem.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.disablePin();
      });
      expect(ok!).toBe(false);
    });
  });

  // ── disableAllQuickLogin ──
  it("disableAllQuickLogin clears everything", async () => {
    const { result } = renderHook(() => useBiometricAuth());
    await act(async () => {
      await result.current.disableAllQuickLogin();
    });
    expect(mockSetItem).toHaveBeenCalledWith("biometric_enabled", "false");
    expect(mockSetItem).toHaveBeenCalledWith("pin_enabled", "false");
    expect(mockDeleteItem).toHaveBeenCalledWith("biometric_credentials");
  });

  it("disableAllQuickLogin returns false on error", async () => {
    mockSetItem.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useBiometricAuth());
    let ok: any;
    await act(async () => {
      ok = await result.current.disableAllQuickLogin();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toContain("Failed to disable quick login");
  });

  // ── hashPin / verifyPin ──
  describe("PIN verification", () => {
    it("hashPin uses SHA256 with salt", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      await act(async () => {
        await result.current.hashPin("1234");
      });
      expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
        Crypto.CryptoDigestAlgorithm.SHA256,
        "1234cartaraiq_secure_pin_salt_2024",
      );
    });

    it("verifyPin returns true when hash matches", async () => {
      const creds = {
        email: "a@b.com",
        password: "pw",
        pinHash: "hashed-pin-123",
      };
      mockGetItem.mockResolvedValue(JSON.stringify(creds));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.verifyPin("1234");
      });
      expect(ok!).toBe(true);
    });

    it("verifyPin returns false when no credentials stored", async () => {
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.verifyPin("1234");
      });
      expect(ok!).toBe(false);
    });

    it("verifyPin returns false on error", async () => {
      mockGetItem.mockRejectedValue(new Error("storage crash"));
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.verifyPin("1234");
      });
      expect(ok!).toBe(false);
      // Error could be from getBiometricCredentials or verifyPin depending on path
      expect(result.current.error).toBeTruthy();
    });

    it("verifyPin returns false when hash doesn't match", async () => {
      const creds = {
        email: "a@b.com",
        password: "pw",
        pinHash: "different-hash",
      };
      mockGetItem.mockResolvedValue(JSON.stringify(creds));
      (Crypto.digestStringAsync as jest.Mock).mockResolvedValue(
        "hashed-pin-456",
      );
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.verifyPin("9999");
      });
      expect(ok!).toBe(false);
    });

    it("verifyPin catches hashPin errors and sets error", async () => {
      const creds = {
        email: "a@b.com",
        password: "pw",
        pinHash: "some-hash",
      };
      mockGetItem.mockResolvedValue(JSON.stringify(creds));
      // hashPin calls Crypto.digestStringAsync — make it throw
      (Crypto.digestStringAsync as jest.Mock).mockRejectedValue(
        new Error("crypto fail"),
      );
      const { result } = renderHook(() => useBiometricAuth());
      let ok: boolean;
      await act(async () => {
        ok = await result.current.verifyPin("1234");
      });
      expect(ok!).toBe(false);
      expect(result.current.error).toContain("PIN verification failed");
    });
  });
});
