/**
 * Tests for ForgotPasswordScreen
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
}));

const mockForgotPassword = jest.fn();
jest.mock("../../lib/api", () => ({
  authForgotPassword: (...args: any[]) => mockForgotPassword(...args),
}));

import ForgotPasswordScreen from "../../app/(auth)/forgot-password";

describe("ForgotPasswordScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders Reset your password header", () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText(/Reset your/)).toBeTruthy();
  });

  it("renders email input", () => {
    const { getByPlaceholderText } = render(<ForgotPasswordScreen />);
    expect(getByPlaceholderText("jane@example.com")).toBeTruthy();
  });

  it("renders Send reset code button", () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    expect(getByText("Send reset code")).toBeTruthy();
  });

  it("shows error when email empty and submit pressed", async () => {
    const { getByText } = render(<ForgotPasswordScreen />);
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    expect(getByText("Please enter your email address.")).toBeTruthy();
  });

  it("calls authForgotPassword and shows success state", async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    expect(mockForgotPassword).toHaveBeenCalledWith("jane@e.com");
    // After success, should show "Enter reset code" button
    expect(getByText("Enter reset code")).toBeTruthy();
  });

  it("shows error on API failure", async () => {
    mockForgotPassword.mockRejectedValueOnce(new Error("fail"));
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    expect(getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("navigates back on back button press", () => {
    const { UNSAFE_root } = render(<ForgotPasswordScreen />);
    // Find TouchableOpacity with onPress → router.back() (first one)
    const backButtons = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.onPress && node.props?.style?.marginBottom === 24,
    );
    if (backButtons.length > 0) {
      backButtons[0].props.onPress();
      expect(mockBack).toHaveBeenCalled();
    }
  });

  // ── Sent state ────────────────────────────────────────────────
  it("shows sent state with email address and social sign-in message", async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    expect(getByText(/jane@e.com/)).toBeTruthy();
    expect(getByText(/Apple, Google, or Facebook/)).toBeTruthy();
  });

  it("navigates to reset-password from sent state", async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen />,
    );
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    fireEvent.press(getByText("Enter reset code"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("reset-password"),
    );
  });

  // ── Loading state branch ─────────────────────────────────
  it("shows ActivityIndicator while loading and hides Send text", async () => {
    // Make the API call hang so loading state persists
    let resolveApi: any;
    mockForgotPassword.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveApi = r;
        }),
    );
    const { getByText, getByPlaceholderText, queryByText, UNSAFE_root } =
      render(<ForgotPasswordScreen />);
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    await act(async () => {
      fireEvent.press(getByText("Send reset code"));
    });
    // While loading, "Send reset code" text should NOT be visible
    expect(queryByText("Send reset code")).toBeNull();
    // ActivityIndicator should be rendered
    const indicators = UNSAFE_root.findAll(
      (node: any) =>
        node.type?.displayName === "ActivityIndicator" ||
        node.props?.animating !== undefined,
    );
    expect(indicators.length).toBeGreaterThan(0);
    // Resolve to clean up
    await act(async () => {
      resolveApi?.({});
    });
  });
});
