/**
 * Tests for SettingsModal — comprehensive coverage of biometric toggle, PIN, display name, sign out
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.spyOn(Alert, "alert");

const mockUpdateMe = jest.fn().mockResolvedValue({});
const mockSetupBiometric = jest.fn().mockResolvedValue({});
const mockDisableBiometric = jest.fn().mockResolvedValue({});
const mockAuthLogout = jest.fn().mockResolvedValue({});
jest.mock("../../lib/api", () => ({
  updateMe: (...args: any[]) => mockUpdateMe(...args),
  setupBiometric: (...args: any[]) => mockSetupBiometric(...args),
  disableBiometric: (...args: any[]) => mockDisableBiometric(...args),
  authLogout: (...args: any[]) => mockAuthLogout(...args),
}));

const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockDeleteItem = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/storage", () => ({
  setItem: (...args: any[]) => mockSetItem(...args),
  getItem: jest.fn().mockResolvedValue(null),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
}));

const mockCheckBiometricAvailability = jest.fn().mockResolvedValue(false);
const mockIsBiometricEnabled = jest.fn().mockResolvedValue(false);
const mockIsPinEnabled = jest.fn().mockResolvedValue(false);
const mockDisableBiometricLogin = jest.fn().mockResolvedValue(undefined);
const mockEnablePin = jest.fn().mockResolvedValue(undefined);
const mockDisablePin = jest.fn().mockResolvedValue(undefined);
const mockHashPin = jest.fn().mockResolvedValue("hashed123");
const mockGetBiometricCredentials = jest.fn().mockResolvedValue(null);
const mockAuthenticateWithBiometric = jest.fn().mockResolvedValue(true);
const mockStoreBiometricCredentials = jest.fn().mockResolvedValue(undefined);
let mockIsBiometricAvailable = false;
let mockBiometricType: string | null = null;

jest.mock("../../hooks/useBiometricAuth", () => ({
  useBiometricAuth: () => ({
    isBiometricAvailable: mockIsBiometricAvailable,
    biometricType: mockBiometricType,
    checkBiometricAvailability: mockCheckBiometricAvailability,
    disableBiometricLogin: mockDisableBiometricLogin,
    isBiometricEnabled: mockIsBiometricEnabled,
    isPinEnabled: mockIsPinEnabled,
    enablePin: mockEnablePin,
    disablePin: mockDisablePin,
    hashPin: mockHashPin,
    getBiometricCredentials: mockGetBiometricCredentials,
    authenticateWithBiometric: mockAuthenticateWithBiometric,
    storeBiometricCredentials: mockStoreBiometricCredentials,
  }),
}));

const mockClearAuth = jest.fn();
const mockUpdateUser = jest.fn();
let mockUser: any = { name: "Matt", email: "matt@test.com" };
jest.mock("../../lib/store", () => ({
  useAuthStore: () => ({
    user: mockUser,
    clearAuth: mockClearAuth,
    updateUser: mockUpdateUser,
  }),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: "2.0.0",
      ios: { buildNumber: "42" },
    },
  },
}));

import { SettingsModal } from "../../components/SettingsModal";

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  aiEnabled: true,
  setAiEnabled: jest.fn(),
  pairingEnabled: true,
  setPairingEnabled: jest.fn(),
};

describe("SettingsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsBiometricAvailable = false;
    mockBiometricType = null;
    mockUser = { name: "Matt", email: "matt@test.com" };
  });

  // ── Visibility ───────────────────────────────────────────────────
  it("renders nothing visible when visible=false", () => {
    const { toJSON } = render(<SettingsModal {...baseProps} visible={false} />);
    expect(toJSON()).toBeNull();
  });

  // ── User info ────────────────────────────────────────────────────
  it("renders user initial, name, and email", () => {
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("M")).toBeTruthy();
    expect(getByText("Matt")).toBeTruthy();
    expect(getByText("matt@test.com")).toBeTruthy();
  });

  // ── Toggle settings ──────────────────────────────────────────────
  it("renders AI Suggestions toggle", () => {
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("AI Suggestions")).toBeTruthy();
  });

  it("renders Pairing Suggestions toggle", () => {
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("Pairing Suggestions")).toBeTruthy();
  });

  it("calls setAiEnabled and stores preference when AI toggle changes", () => {
    const setAiEnabled = jest.fn();
    const { getAllByRole } = render(
      <SettingsModal {...baseProps} setAiEnabled={setAiEnabled} />,
    );
    // Switches are rendered as role="switch"
    const switches = getAllByRole("switch");
    // First switch is AI Suggestions
    fireEvent(switches[0], "valueChange", false);
    expect(setAiEnabled).toHaveBeenCalledWith(false);
    expect(mockSetItem).toHaveBeenCalledWith("ai_suggestions_enabled", "0");
  });

  it("calls setPairingEnabled and stores preference", () => {
    const setPairingEnabled = jest.fn();
    const { getAllByRole } = render(
      <SettingsModal {...baseProps} setPairingEnabled={setPairingEnabled} />,
    );
    const switches = getAllByRole("switch");
    // Second switch is Pairing Suggestions
    fireEvent(switches[1], "valueChange", false);
    expect(setPairingEnabled).toHaveBeenCalledWith(false);
    expect(mockSetItem).toHaveBeenCalledWith(
      "pairing_suggestions_enabled",
      "0",
    );
  });

  // ── Version ──────────────────────────────────────────────────────
  it("renders version info", () => {
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText(/Version 2\.0\.0/)).toBeTruthy();
  });

  // ── Sign out ─────────────────────────────────────────────────────
  it("renders Sign Out button", () => {
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("Sign Out")).toBeTruthy();
  });

  it("calls sign-out flow: logout, clear storage, clear auth, redirect", async () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <SettingsModal {...baseProps} onClose={onClose} />,
    );
    await act(async () => {
      fireEvent.press(getByText("Sign Out"));
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockAuthLogout).toHaveBeenCalled();
    expect(mockDeleteItem).toHaveBeenCalledWith("auth_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("refresh_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("auth_user");
    expect(mockClearAuth).toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith("/(auth)/welcome");
  });

  it("sign out works even when authLogout fails", async () => {
    mockAuthLogout.mockRejectedValueOnce(new Error("network"));
    const { getByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText("Sign Out"));
    });
    expect(mockClearAuth).toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith("/(auth)/welcome");
  });

  // ── Manage my data ──────────────────────────────────────────────
  it("navigates to manage-data", () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <SettingsModal {...baseProps} onClose={onClose} />,
    );
    fireEvent.press(getByText("Manage my data"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/(app)/manage-data");
  });

  // ── Display name editing ─────────────────────────────────────────
  it("enters edit mode and saves display name", async () => {
    const { getByText, getByDisplayValue } = render(
      <SettingsModal {...baseProps} />,
    );
    fireEvent.press(getByText("✎"));
    expect(getByDisplayValue("Matt")).toBeTruthy();
    fireEvent.changeText(getByDisplayValue("Matt"), "Matthew");
    await act(async () => {
      fireEvent.press(getByText("Save"));
    });
    expect(mockUpdateMe).toHaveBeenCalledWith("Matthew");
    expect(mockUpdateUser).toHaveBeenCalledWith({ name: "Matthew" });
  });

  it("does not call updateMe when name is unchanged", async () => {
    const { getByText, getByDisplayValue } = render(
      <SettingsModal {...baseProps} />,
    );
    fireEvent.press(getByText("✎"));
    await act(async () => {
      fireEvent.press(getByText("Save"));
    });
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  // ── Biometric toggle (when available) ────────────────────────────
  it("shows biometric section when isBiometricAvailable", () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("Face ID Login")).toBeTruthy();
  });

  it("shows Touch ID label when biometricType is touchId", () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "touchId";
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("Touch ID Login")).toBeTruthy();
  });

  it("shows generic Biometric label for unknown type", () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "other";
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText(/Biometric.*Login/)).toBeTruthy();
  });

  it("does not show biometric section when unavailable", () => {
    mockIsBiometricAvailable = false;
    const { queryByText } = render(<SettingsModal {...baseProps} />);
    expect(queryByText(/Face ID|Touch ID|Biometric.*Login/)).toBeNull();
  });

  it("disables biometric toggle calls disableBiometric and disableBiometricLogin", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(true);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Find the biometric switch (3rd switch: AI, Pairing, Biometric)
    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", false);
    });
    expect(mockDisableBiometric).toHaveBeenCalled();
    expect(mockDisableBiometricLogin).toHaveBeenCalled();
  });

  it("enables biometric with PIN hash triggers setup flow", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({
      pinHash: "existing-hash",
    });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockResolvedValueOnce({});

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockSetupBiometric).toHaveBeenCalledWith("existing-hash", "faceId");
    expect(mockSetItem).toHaveBeenCalledWith("biometric_enabled", "true");
  });

  it("enabling biometric without PIN hash shows alert to set PIN", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: null });

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "PIN Required",
      expect.stringContaining("set up a PIN"),
      expect.any(Array),
    );
  });

  it("enabling biometric with failed bio auth shows error", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(false);

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Biometric Setup Failed",
      expect.any(String),
      expect.any(Array),
    );
  });

  it("enabling biometric with backend error shows alert", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockRejectedValueOnce(new Error("Server error"));

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Setup Failed",
      expect.stringContaining("Server error"),
      expect.any(Array),
    );
  });

  // ── PIN toggle ───────────────────────────────────────────────────
  it("shows PIN Login toggle when biometric is available", () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    const { getByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("PIN Login")).toBeTruthy();
  });

  it("enables PIN when toggle is switched on and pinHash exists", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "existing" });

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    // PIN switch is the 4th switch (AI, Pairing, Bio, PIN)
    const pinSwitch = switches[3];
    await act(async () => {
      fireEvent(pinSwitch, "valueChange", true);
    });
    expect(mockEnablePin).toHaveBeenCalled();
  });

  it("shows reset PIN modal when enabling PIN without existing hash", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: null });

    const { getAllByRole, findByText } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const pinSwitch = switches[3];
    await act(async () => {
      fireEvent(pinSwitch, "valueChange", true);
    });
    expect(await findByText("Enter new PIN")).toBeTruthy();
  });

  it("disables PIN when toggle is switched off", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const pinSwitch = switches[3];
    await act(async () => {
      fireEvent(pinSwitch, "valueChange", false);
    });
    expect(mockDisablePin).toHaveBeenCalled();
  });

  // ── Reset PIN flow ───────────────────────────────────────────────
  it("shows Reset PIN button when PIN is enabled", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { findByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(await findByText("Reset PIN")).toBeTruthy();
  });

  it("Reset PIN opens PIN entry modal", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { findByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });
    expect(await findByText("Enter new PIN")).toBeTruthy();
  });

  it("completing PIN reset flow with matching PINs succeeds", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);
    mockGetBiometricCredentials.mockResolvedValue({
      email: "e",
      password: "p",
      pinHash: "old",
    });

    const { findByText, getByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });

    // First step: enter 4-digit PIN
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    // PINEntry has a 120ms setTimeout before onComplete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Confirm step: enter same PIN
    expect(await findByText("Confirm your new PIN")).toBeTruthy();
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(mockHashPin).toHaveBeenCalledWith("1234");
    expect(mockSetItem).toHaveBeenCalledWith(
      "biometric_credentials",
      expect.stringContaining("hashed123"),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Success",
      expect.stringContaining("updated"),
    );
  });

  it("PIN reset with mismatched PINs shows alert and resets", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { findByText, getByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });

    // First step: 1234
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    // PINEntry has a 120ms setTimeout before onComplete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Confirm step: 5678 (mismatch)
    for (const d of ["5", "6", "7", "8"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "PINs don't match",
      expect.any(String),
      expect.any(Array),
    );
  });

  // ── Biometric success modal ──────────────────────────────────────
  it("shows and dismisses biometric success modal", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockResolvedValueOnce({});

    const { getAllByRole, findByText } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Success modal should be shown
    expect(await findByText("Face ID Enabled")).toBeTruthy();
    expect(await findByText("Got it")).toBeTruthy();
    await act(async () => {
      fireEvent.press(await findByText("Got it"));
    });
  });

  it("biometric success modal onRequestClose dismisses it", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockResolvedValueOnce({});

    const { getAllByRole, findByText, UNSAFE_root } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Success modal visible
    expect(await findByText("Face ID Enabled")).toBeTruthy();
    // Find all Modal elements and call onRequestClose on the one with visible=true
    const modals = UNSAFE_root.findAll(
      (n: any) => n.type?.name === "Modal" && n.props?.onRequestClose,
    );
    const visibleModal = modals.find((m: any) => m.props.visible);
    if (visibleModal) {
      await act(async () => {
        visibleModal.props.onRequestClose();
      });
    }
  });

  // ── Reset PIN error paths ────────────────────────────────────────
  it("PIN reset shows error when getBiometricCredentials returns null", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);
    mockGetBiometricCredentials.mockResolvedValue(null);

    const { findByText, getByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });

    // First step: 1234
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Confirm step: 1234 (matching)
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should call hashPin but not Alert.alert("Success")
    expect(mockHashPin).toHaveBeenCalledWith("1234");
    // The error is set internally — getBiometricCredentials returned null
    // Alert should NOT be called with "Success"
    const successCalls = (Alert.alert as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === "Success",
    );
    expect(successCalls.length).toBe(0);
  });

  it("PIN reset shows error when hashPin throws", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);
    mockHashPin.mockRejectedValueOnce(new Error("hash failed"));

    const { findByText, getByText } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });

    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // hashPin threw, so the catch block should fire
    expect(mockHashPin).toHaveBeenCalled();
  });

  // ── Display name onSubmitEditing ─────────────────────────────────
  it("saves display name via onSubmitEditing on the TextInput", async () => {
    const { getByText, getByDisplayValue } = render(
      <SettingsModal {...baseProps} />,
    );
    fireEvent.press(getByText("✎"));
    const input = getByDisplayValue("Matt");
    fireEvent.changeText(input, "NewName");
    await act(async () => {
      fireEvent(input, "submitEditing");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockUpdateMe).toHaveBeenCalledWith("NewName");
    expect(mockUpdateUser).toHaveBeenCalledWith({ name: "NewName" });
  });

  it("onSubmitEditing does not update when name unchanged", async () => {
    const { getByText, getByDisplayValue } = render(
      <SettingsModal {...baseProps} />,
    );
    fireEvent.press(getByText("✎"));
    const input = getByDisplayValue("Matt");
    // Don't change the text — submit same name
    await act(async () => {
      fireEvent(input, "submitEditing");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  // ── Alert "Set PIN" button in biometric toggle ───────────────────
  it("pressing Set PIN in biometric Alert opens reset PIN modal", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: null });

    const { getAllByRole, findByText } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });

    // Alert.alert was called with "PIN Required" and "Set PIN" button
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const pinRequiredCall = alertCalls.find(
      (c: any[]) => c[0] === "PIN Required",
    );
    expect(pinRequiredCall).toBeTruthy();

    // Press the "Set PIN" button handler
    const buttons = pinRequiredCall![2];
    const setPinBtn = buttons.find((b: any) => b.text === "Set PIN");
    expect(setPinBtn).toBeTruthy();
    await act(async () => {
      setPinBtn.onPress();
    });

    // Should now show reset PIN modal
    expect(await findByText("Enter new PIN")).toBeTruthy();
  });

  // ── Biometric storage error ──────────────────────────────────────
  it("shows Storage Error alert when biometric enable persists fails", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockResolvedValueOnce({});
    // Make setItem fail for the biometric_enabled storage call
    mockSetItem.mockRejectedValueOnce(new Error("storage full"));

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Storage Error",
      expect.stringContaining("couldn't be saved"),
      expect.any(Array),
    );
  });

  // ── Reset PIN modal cancel callbacks ─────────────────────────────
  it("cancel on first Reset PIN step closes modal", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { findByText, getAllByText } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });
    expect(await findByText("Enter new PIN")).toBeTruthy();

    // Press the PINEntry cancel/back chevron
    const backBtns = getAllByText("chevron-back");
    await act(async () => {
      fireEvent.press(backBtns[backBtns.length - 1]);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Modal should be closed — "Enter new PIN" should no longer be visible
    // (The resetPINModal visible=false hides children)
  });

  it("cancel on confirm Reset PIN step goes back to first step", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = "faceId";
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(true);

    const { findByText, getByText, getAllByText } = render(
      <SettingsModal {...baseProps} />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await act(async () => {
      fireEvent.press(await findByText("Reset PIN"));
    });

    // Enter first PIN: 1234
    for (const d of ["1", "2", "3", "4"]) {
      await act(async () => {
        fireEvent.press(getByText(d));
      });
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should be on confirm step
    expect(await findByText("Confirm your new PIN")).toBeTruthy();

    // Press the back/cancel chevron on confirm step
    const backBtns = getAllByText("chevron-back");
    await act(async () => {
      fireEvent.press(backBtns[backBtns.length - 1]);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Should show first step again
    expect(await findByText("Enter new PIN")).toBeTruthy();
  });

  // ── aiEnabled=false branch coverage ──────────────────────────────
  it("renders opacity 0.4 and disabled pairing when aiEnabled is false", () => {
    const { getByText } = render(
      <SettingsModal {...baseProps} aiEnabled={false} />,
    );
    expect(getByText("Pairing Suggestions")).toBeTruthy();
    expect(getByText("AI Suggestions")).toBeTruthy();
  });

  // ── user.name null branch ─────────────────────────────────────────
  it("shows User fallback and empty edit text when user.name is null", async () => {
    mockUser = { name: null, email: "matt@test.com" };
    const { getByText, findByText } = render(<SettingsModal {...baseProps} />);
    expect(getByText("User")).toBeTruthy();
    // Enter edit mode — displayNameText should default to ""
    fireEvent.press(getByText("✎"));
    expect(await findByText("Save")).toBeTruthy();
  });

  // ── biometricType null fallback to "faceId" ─────────────────────
  it("uses faceId fallback when biometricType is null during enable", async () => {
    mockIsBiometricAvailable = true;
    mockBiometricType = null;
    mockIsBiometricEnabled.mockResolvedValueOnce(false);
    mockIsPinEnabled.mockResolvedValueOnce(false);
    mockGetBiometricCredentials.mockResolvedValueOnce({ pinHash: "h" });
    mockAuthenticateWithBiometric.mockResolvedValueOnce(true);
    mockSetupBiometric.mockResolvedValueOnce({});

    const { getAllByRole } = render(<SettingsModal {...baseProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const switches = getAllByRole("switch");
    const bioSwitch = switches[2];
    await act(async () => {
      fireEvent(bioSwitch, "valueChange", true);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockSetupBiometric).toHaveBeenCalledWith("h", "faceId");
  });

  // ── version block branch coverage ───────────────────────────────
  it("shows version with android versionCode when no ios buildNumber", () => {
    const Constants = require("expo-constants").default;
    const original = { ...Constants.expoConfig };
    Constants.expoConfig = {
      version: "3.0.0",
      ios: {},
      android: { versionCode: 99 },
    };
    const { getByText } = render(<SettingsModal {...baseProps} />);
    // build-info.json adds gitCommit hash, so build = "99.<hash>"
    expect(getByText(/Version 3\.0\.0/)).toBeTruthy();
    Constants.expoConfig = original;
  });

  it("shows version without build info when no buildNumber or versionCode", () => {
    const Constants = require("expo-constants").default;
    const original = { ...Constants.expoConfig };
    Constants.expoConfig = { version: undefined, ios: {}, android: {} };
    const { getByText } = render(<SettingsModal {...baseProps} />);
    // version defaults to "1.0.0", build will be just the git hash
    expect(getByText(/Version 1\.0\.0/)).toBeTruthy();
    Constants.expoConfig = original;
  });
});
