/**
 * Tests for hooks/useSocialAuth.ts
 */
import { renderHook, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

const mockAuthSocial = jest.fn();
const mockSetItem = jest.fn();
jest.mock("../../lib/api", () => ({
  authSocial: (...args: any[]) => mockAuthSocial(...args),
}));
jest.mock("../../lib/storage", () => ({
  setItem: (...args: any[]) => mockSetItem(...args),
  getItem: jest.fn(),
  deleteItem: jest.fn(),
}));

// Mock useAuthStore
const mockSetAuth = jest.fn();
jest.mock("../../lib/store", () => ({
  useAuthStore: (selector: any) => selector({ setAuth: mockSetAuth }),
}));

import { useSocialAuth } from "../../hooks/useSocialAuth";

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthSocial.mockResolvedValue({
    data: { access_token: "at", refresh_token: "rt", user: { id: 1 } },
  });
  mockSetItem.mockResolvedValue(undefined);
  (Crypto.digestStringAsync as jest.Mock).mockResolvedValue("nonce-hash");
  (Crypto.getRandomBytes as jest.Mock).mockReturnValue(new Uint8Array(32));
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("useSocialAuth", () => {
  it("returns login functions and availability flags", () => {
    const { result } = renderHook(() => useSocialAuth());
    expect(typeof result.current.loginWithApple).toBe("function");
    expect(typeof result.current.loginWithGoogle).toBe("function");
    expect(typeof result.current.loginWithFacebook).toBe("function");
  });

  describe("loginWithApple", () => {
    it("handles Apple sign-in success", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-token",
        fullName: { givenName: "John", familyName: "Doe" },
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "apple",
        "apple-token",
        "John Doe",
      );
      expect(mockSetItem).toHaveBeenCalledWith("auth_token", "at");
      expect(mockSetAuth).toHaveBeenCalledWith("at", { id: 1 });
    });

    it("suppresses ERR_REQUEST_CANCELED", async () => {
      const err: any = new Error("User cancelled");
      err.code = "ERR_REQUEST_CANCELED";
      (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(err);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("shows alert on other errors", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(
        new Error("boom"),
      );
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      expect(Alert.alert).toHaveBeenCalledWith("Apple Sign In", "boom");
    });

    it("handles missing identity token", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: null,
        fullName: null,
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Apple Sign In",
        expect.stringContaining("no identity token"),
      );
    });

    it("handles Apple sign-in with partial name (givenName only)", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-token",
        fullName: { givenName: "Jane", familyName: undefined },
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      // name should be undefined because both givenName AND familyName are needed
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "apple",
        "apple-token",
        undefined,
      );
    });

    it("handles Apple sign-in with no fullName", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-token",
        fullName: null,
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithApple();
      });
      // name should be undefined since fullName is null
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "apple",
        "apple-token",
        undefined,
      );
    });
  });

  describe("loginWithFacebook", () => {
    it("handles cancel gracefully", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "cancel",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(mockAuthSocial).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("handles success with access_token in query params", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "success",
        url: "cartaraiq://redirect?access_token=fb-token&state=xyz",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "facebook",
        "fb-token",
        undefined,
      );
    });

    it("handles success with access_token in hash fragment", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "success",
        url: "cartaraiq://redirect#access_token=fb-hash-token&state=xyz",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "facebook",
        "fb-hash-token",
        undefined,
      );
    });

    it("shows alert when no access_token in URL", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "success",
        url: "cartaraiq://redirect?state=xyz",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Facebook Sign In",
        expect.stringContaining("No access token"),
      );
    });

    it("shows alert on error result", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "error",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Facebook Sign In",
        expect.any(String),
      );
    });

    it("throws when success but url is missing", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "success",
        url: undefined,
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Facebook Sign In",
        "Facebook sign in failed.",
      );
    });

    it("handles dismiss result gracefully", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
        type: "dismiss",
      });
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(mockAuthSocial).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("suppresses cancelled error", async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockRejectedValue(
        new Error("User cancelled"),
      );
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithFacebook();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe("loginWithGoogle", () => {
    it("handles dismiss gracefully", async () => {
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockResolvedValue({ type: "dismiss" }),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(mockAuthSocial).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("handles success and exchanges code for token", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ id_token: "google-id-token" }),
      });
      global.fetch = mockFetch;
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockResolvedValue({
          type: "success",
          params: { code: "auth-code" },
        }),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({ method: "POST" }),
      );
      expect(mockAuthSocial).toHaveBeenCalledWith(
        "google",
        "google-id-token",
        undefined,
      );
    });

    it("shows alert when token exchange returns no id_token", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({}),
      });
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockResolvedValue({
          type: "success",
          params: { code: "auth-code" },
        }),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Google Sign In",
        expect.stringContaining("Failed to exchange"),
      );
    });

    it("shows alert on google error", async () => {
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockRejectedValue(new Error("Network error")),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Google Sign In",
        "Network error",
      );
    });

    it("handles cancel result gracefully", async () => {
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockResolvedValue({ type: "cancel" }),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(mockAuthSocial).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it("throws when result is not success, dismiss, or cancel", async () => {
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockResolvedValue({ type: "error" }),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Google Sign In",
        "Google sign in failed.",
      );
    });

    it("suppresses cancelled error message", async () => {
      (AuthSession.useAuthRequest as jest.Mock).mockReturnValue([
        { codeVerifier: "cv" },
        null,
        jest.fn().mockRejectedValue(new Error("User cancelled")),
      ]);
      const { result } = renderHook(() => useSocialAuth());
      await act(async () => {
        await result.current.loginWithGoogle();
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });
});
