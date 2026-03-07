/**
 * Tests for ProfileScreen
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.spyOn(Alert, "alert");

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockClearAuth = jest.fn();
let mockUser: any = { name: "Matt Smith", email: "matt@test.com" };
jest.mock("../../lib/store", () => ({
  useAuthStore: () => ({
    user: mockUser,
    clearAuth: mockClearAuth,
  }),
}));

const mockDeleteItem = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/storage", () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
}));

jest.mock("../../lib/api", () => ({
  __esModule: true,
  authLogout: jest.fn().mockResolvedValue({}),
}));

function getMockAuthLogout(): jest.Mock {
  return require("../../lib/api").authLogout;
}

import ProfileScreen from "../../app/(app)/profile";

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { name: "Matt Smith", email: "matt@test.com" };
  });

  it("renders user name", () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText("Matt Smith")).toBeTruthy();
  });

  it("renders user email", () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText("matt@test.com")).toBeTruthy();
  });

  it("renders user initials", () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText("MS")).toBeTruthy();
  });

  it("shows sign-out confirmation alert", () => {
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText("Sign Out"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Sign out",
      "Are you sure you want to sign out?",
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Sign Out" }),
      ]),
    );
  });

  it("executes sign out flow when confirmed", async () => {
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText("Sign Out"));
    // Get the onPress from the destructive button
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    const signOutButton = buttons.find((b: any) => b.text === "Sign Out");
    await signOutButton.onPress();
    // Dynamic import('../../lib/api') runs authLogout best-effort
    // Verify the important side effects: storage cleanup + auth clear
    expect(mockDeleteItem).toHaveBeenCalledWith("auth_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("refresh_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("auth_user");
    expect(mockClearAuth).toHaveBeenCalled();
  });

  it("sign out continues even if authLogout throws", async () => {
    getMockAuthLogout().mockRejectedValueOnce(new Error("fail"));
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText("Sign Out"));
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    const signOutButton = buttons.find((b: any) => b.text === "Sign Out");
    await signOutButton.onPress();
    expect(mockClearAuth).toHaveBeenCalled();
  });

  it("shows ?? initials when user has no name", () => {
    mockUser = { email: "noname@test.com" };
    const { getByText } = render(<ProfileScreen />);
    expect(getByText("??")).toBeTruthy();
  });

  it("shows ?? initials when user is null", () => {
    mockUser = null;
    const { getByText } = render(<ProfileScreen />);
    expect(getByText("??")).toBeTruthy();
  });
});
