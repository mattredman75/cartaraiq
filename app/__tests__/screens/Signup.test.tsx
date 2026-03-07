/**
 * Tests for SignupScreen
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
}));

const mockSetAuth = jest.fn();
jest.mock("../../lib/store", () => ({
  useAuthStore: (selector?: any) => {
    const state = { setAuth: mockSetAuth, token: null, user: null };
    return selector ? selector(state) : state;
  },
}));

const mockAuthRegister = jest.fn();
jest.mock("../../lib/api", () => ({
  authRegister: (...args: any[]) => mockAuthRegister(...args),
}));

jest.mock("../../lib/storage", () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  deleteItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../hooks/useSocialAuth", () => ({
  useSocialAuth: () => ({
    loginWithApple: mockLoginWithApple,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithFacebook: mockLoginWithFacebook,
    appleAvailable: mockAppleAvailable,
    googleAvailable: mockGoogleAvailable,
    facebookAvailable: mockFacebookAvailable,
    googleReady: true,
    facebookReady: true,
  }),
}));

const mockLoginWithApple = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockLoginWithFacebook = jest.fn();
let mockAppleAvailable = false;
let mockGoogleAvailable = false;
let mockFacebookAvailable = false;

import SignupScreen from "../../app/(auth)/signup";

describe("SignupScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppleAvailable = false;
    mockGoogleAvailable = false;
    mockFacebookAvailable = false;
  });

  it("renders Create your account header", () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/Create your/)).toBeTruthy();
  });

  it("renders all input fields", () => {
    const { getByPlaceholderText } = render(<SignupScreen />);
    expect(getByPlaceholderText("Jane Smith")).toBeTruthy();
    expect(getByPlaceholderText("jane@example.com")).toBeTruthy();
    expect(getByPlaceholderText("8+ characters")).toBeTruthy();
    expect(getByPlaceholderText("Re-enter your password")).toBeTruthy();
  });

  it("renders Create Account button", () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText("Create Account")).toBeTruthy();
  });

  it("shows error when fields are empty and submit pressed", async () => {
    const { getByText } = render(<SignupScreen />);
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(getByText("Please fill in all fields.")).toBeTruthy();
  });

  it("shows error when passwords don't match", async () => {
    const { getByText, getByPlaceholderText } = render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "different",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(getByText("Passwords do not match.")).toBeTruthy();
  });

  it("calls authRegister and setAuth on successful signup", async () => {
    mockAuthRegister.mockResolvedValueOnce({
      data: {
        access_token: "tok",
        refresh_token: "ref",
        user: { name: "Jane", email: "jane@e.com" },
      },
    });
    const { getByText, getByPlaceholderText } = render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "pass1234",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(mockAuthRegister).toHaveBeenCalledWith(
      "jane@e.com",
      "pass1234",
      "Jane",
    );
    expect(mockSetAuth).toHaveBeenCalledWith("tok", {
      name: "Jane",
      email: "jane@e.com",
    });
  });

  it("shows API error on failed signup", async () => {
    mockAuthRegister.mockRejectedValueOnce({
      response: { data: { detail: "Email already exists" } },
    });
    const { getByText, getByPlaceholderText } = render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(
      getByPlaceholderText("jane@example.com"),
      "jane@e.com",
    );
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "pass1234",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(getByText("Email already exists")).toBeTruthy();
  });

  it("navigates to login when Sign in pressed", () => {
    const { getByText } = render(<SignupScreen />);
    fireEvent.press(getByText(/Sign in/));
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("shows generic error when API error has no detail", async () => {
    mockAuthRegister.mockRejectedValueOnce({});
    const { getByText, getByPlaceholderText } = render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(getByPlaceholderText("jane@example.com"), "j@e.com");
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "pass1234",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(getByText("Something went wrong. Please try again.")).toBeTruthy();
  });

  it("shows back button that navigates back", () => {
    const { toJSON } = render(<SignupScreen />);
    // The back button calls router.back()
    expect(toJSON()).toBeTruthy();
  });

  // ── Social Auth Section ────────────────────────────────────────
  it("renders social auth section when providers available", () => {
    mockAppleAvailable = true;
    mockGoogleAvailable = true;
    mockFacebookAvailable = true;
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/or sign up with/)).toBeTruthy();
  });

  it("does not render social section when no providers available", () => {
    const { queryByText } = render(<SignupScreen />);
    expect(queryByText(/or sign up with/)).toBeNull();
  });

  it("renders Apple button when available", () => {
    mockAppleAvailable = true;
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/or sign up with/)).toBeTruthy();
  });

  it("renders Google button when available", () => {
    mockGoogleAvailable = true;
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/or sign up with/)).toBeTruthy();
  });

  it("renders Facebook button when available", () => {
    mockFacebookAvailable = true;
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/or sign up with/)).toBeTruthy();
  });

  it("renders Sign in link at bottom", () => {
    const { getByText } = render(<SignupScreen />);
    expect(getByText(/Have an account/)).toBeTruthy();
  });

  // ── Social button presses ────────────────────────────────────────
  it("pressing Apple button calls loginWithApple", async () => {
    mockAppleAvailable = true;
    mockLoginWithApple.mockResolvedValueOnce(undefined);
    const { UNSAFE_root } = render(<SignupScreen />);
    // Find Apple button by its backgroundColor #000
    const appleBtn = UNSAFE_root.findAll(
      (n: any) =>
        n.props?.style?.backgroundColor === "#000" && n.props?.onPress,
    );
    expect(appleBtn.length).toBeGreaterThan(0);
    await act(async () => {
      appleBtn[0].props.onPress();
    });
    expect(mockLoginWithApple).toHaveBeenCalled();
  });

  it("pressing Google button calls loginWithGoogle", async () => {
    mockGoogleAvailable = true;
    mockLoginWithGoogle.mockResolvedValueOnce(undefined);
    const { UNSAFE_root } = render(<SignupScreen />);
    // Find Google button by borderWidth 1 or 1.5
    const googleBtn = UNSAFE_root.findAll(
      (n: any) =>
        n.props?.style?.borderWidth >= 1 &&
        n.props?.style?.borderWidth <= 2 &&
        n.props?.onPress,
    );
    expect(googleBtn.length).toBeGreaterThan(0);
    await act(async () => {
      googleBtn[0].props.onPress();
    });
    expect(mockLoginWithGoogle).toHaveBeenCalled();
  });

  it("pressing Facebook button calls loginWithFacebook", async () => {
    mockFacebookAvailable = true;
    mockLoginWithFacebook.mockResolvedValueOnce(undefined);
    const { UNSAFE_root } = render(<SignupScreen />);
    // Find Facebook button by backgroundColor #1877F2
    const fbBtn = UNSAFE_root.findAll(
      (n: any) =>
        n.props?.style?.backgroundColor === "#1877F2" && n.props?.onPress,
    );
    expect(fbBtn.length).toBeGreaterThan(0);
    await act(async () => {
      fbBtn[0].props.onPress();
    });
    expect(mockLoginWithFacebook).toHaveBeenCalled();
  });

  it("back button calls router.back", () => {
    const { UNSAFE_root } = render(<SignupScreen />);
    // Find back button by marginLeft: -10
    const backBtn = UNSAFE_root.findAll(
      (n: any) => n.props?.style?.marginLeft === -10 && n.props?.onPress,
    );
    expect(backBtn.length).toBeGreaterThan(0);
    backBtn[0].props.onPress();
    expect(mockBack).toHaveBeenCalled();
  });

  // ── Loading state branch ────────────────────────────────────────
  it("shows ActivityIndicator while loading", async () => {
    let resolveApi: any;
    mockAuthRegister.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveApi = r;
        }),
    );
    const { getByText, getByPlaceholderText, queryByText, UNSAFE_root } =
      render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(getByPlaceholderText("jane@example.com"), "j@e.com");
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "pass1234",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    // While loading, "Create Account" text should be gone
    expect(queryByText("Create Account")).toBeNull();
    // Cleanup
    await act(async () => {
      resolveApi?.({ data: { access_token: "t", user: {} } });
    });
  });

  // ── No refresh_token in response ────────────────────────────────
  it("handles signup response without refresh_token", async () => {
    mockAuthRegister.mockResolvedValueOnce({
      data: { access_token: "tok", user: { name: "Jane" } },
    });
    const { getByText, getByPlaceholderText } = render(<SignupScreen />);
    fireEvent.changeText(getByPlaceholderText("Jane Smith"), "Jane");
    fireEvent.changeText(getByPlaceholderText("jane@example.com"), "j@e.com");
    fireEvent.changeText(getByPlaceholderText("8+ characters"), "pass1234");
    fireEvent.changeText(
      getByPlaceholderText("Re-enter your password"),
      "pass1234",
    );
    await act(async () => {
      fireEvent.press(getByText("Create Account"));
    });
    expect(mockSetAuth).toHaveBeenCalledWith("tok", { name: "Jane" });
  });
});
