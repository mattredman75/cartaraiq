import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getItem, setItem, deleteItem } from "../../lib/storage";

jest.mock("expo-secure-store");

describe("lib/storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("native platform (iOS/Android)", () => {
    beforeEach(() => {
      (Platform as any).OS = "ios";
    });

    describe("getItem", () => {
      it("should call SecureStore.getItemAsync with the key", async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("test-value");

        const result = await getItem("auth_token");

        expect(SecureStore.getItemAsync).toHaveBeenCalledWith("auth_token");
        expect(result).toBe("test-value");
      });

      it("should return null when key does not exist", async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

        const result = await getItem("nonexistent");

        expect(result).toBeNull();
      });
    });

    describe("setItem", () => {
      it("should call SecureStore.setItemAsync with key and value", async () => {
        await setItem("auth_token", "my-jwt");

        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
          "auth_token",
          "my-jwt",
        );
      });
    });

    describe("deleteItem", () => {
      it("should call SecureStore.deleteItemAsync with the key", async () => {
        await deleteItem("auth_token");

        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("auth_token");
      });
    });
  });

  describe("web platform", () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      (Platform as any).OS = "web";
      mockStorage = {};
      Object.defineProperty(global, "localStorage", {
        value: {
          getItem: jest.fn((key: string) => mockStorage[key] ?? null),
          setItem: jest.fn((key: string, val: string) => {
            mockStorage[key] = val;
          }),
          removeItem: jest.fn((key: string) => {
            delete mockStorage[key];
          }),
        },
        writable: true,
        configurable: true,
      });
    });

    it("should use localStorage.getItem on web", async () => {
      mockStorage["auth_token"] = "web-token";

      const result = await getItem("auth_token");

      expect(result).toBe("web-token");
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    });

    it("should use localStorage.setItem on web", async () => {
      await setItem("auth_token", "web-token");

      expect(localStorage.setItem).toHaveBeenCalledWith(
        "auth_token",
        "web-token",
      );
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it("should use localStorage.removeItem on web", async () => {
      await deleteItem("auth_token");

      expect(localStorage.removeItem).toHaveBeenCalledWith("auth_token");
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
  });
});
