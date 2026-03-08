/**
 * Tests for Settings screen
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { useAuthStore } from "../../lib/store";
import SettingsScreen from "../../app/(app)/settings";

// Mock the router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

// Mock storage
jest.mock("../../lib/storage", () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  deleteItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

// Mock biometric auth
jest.mock("../../hooks/useBiometricAuth", () => ({
  useBiometricAuth: () => ({
    isBiometricAvailable: false,
    biometricType: null,
    checkBiometricAvailability: jest.fn(),
    disableBiometricLogin: jest.fn(),
    isBiometricEnabled: jest.fn().mockResolvedValue(false),
    isPinEnabled: jest.fn().mockResolvedValue(false),
    enablePin: jest.fn().mockResolvedValue(true),
    disablePin: jest.fn().mockResolvedValue(true),
    hashPin: jest.fn().mockResolvedValue("hashed_pin"),
    getBiometricCredentials: jest.fn().mockResolvedValue(null),
    authenticateWithBiometric: jest.fn().mockResolvedValue(true),
    storeBiometricCredentials: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock API
jest.mock("../../lib/api", () => ({
  updateMe: jest.fn().mockResolvedValue({ success: true }),
  setupBiometric: jest.fn().mockResolvedValue({ success: true }),
  disableBiometric: jest.fn().mockResolvedValue({ success: true }),
  authLogout: jest.fn().mockResolvedValue({ success: true }),
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const store = useAuthStore.getState();
    store.setAuth("test-token", {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("renders without crashing", () => {
    const { toJSON } = render(<SettingsScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("displays user profile section", () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("test@example.com")).toBeTruthy();
    expect(getByText("Test User")).toBeTruthy();
  });

  it("displays user avatar initial", () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("T")).toBeTruthy();
  });

  it("displays AI Suggestions toggle", () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("AI Suggestions")).toBeTruthy();
  });

  it("displays Recipe Suggestions toggle", () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Recipe Suggestions")).toBeTruthy();
  });

  it("displays version info", () => {
    const { getByText } = render(<SettingsScreen />);
    const versionText = getByText(/App Version/);
    expect(versionText).toBeTruthy();
  });

  it("displays Log Out button", () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Log Out")).toBeTruthy();
  });

  it("displays logout functionality", async () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Log Out")).toBeTruthy();
  });

  it("can edit user name", async () => {
    const { getByText, getByDisplayValue } = render(<SettingsScreen />);

    // Find and click the edit button (pencil icon)
    const editButton = getByText("✎");
    fireEvent.press(editButton);

    // Name editing should now be active
    await waitFor(() => {
      const input = getByDisplayValue("Test User");
      expect(input).toBeTruthy();
    });
  });

  it("renders with different user names", () => {
    const store = useAuthStore.getState();
    store.setAuth("token", {
      id: "user-2",
      email: "john@example.com",
      name: "John Doe",
    });

    const { getByText } = render(<SettingsScreen />);
    expect(getByText("John Doe")).toBeTruthy();
    expect(getByText("J")).toBeTruthy();
  });
});
