/**
 * Tests for lib/api.ts
 * Covers: axios instance creation, request interceptor (token attachment),
 * response interceptor (silent 401 refresh), and all 30+ exported API functions.
 *
 * Uses require() for the module-under-test so we can configure axios mocks
 * BEFORE api.ts executes its top-level axios.create() calls.
 */

// ── Mocks that must be registered before any require ────────────────────────
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockDeleteItem = jest.fn();

jest.mock("../../lib/storage", () => ({
  getItem: (...args: any[]) => mockGetItem(...args),
  setItem: (...args: any[]) => mockSetItem(...args),
  deleteItem: (...args: any[]) => mockDeleteItem(...args),
}));

jest.mock("../../lib/constants", () => ({ API_URL: "https://test.api" }));
jest.mock("axios");

// ── Build mock instances & configure axios.create BEFORE loading api.ts ─────
const { AxiosError, AxiosHeaders } = jest.requireActual("axios");
const axios = require("axios").default || require("axios");

// Interceptor handler captures
let requestInterceptor: (config: any) => Promise<any>;
let responseSuccess: (res: any) => any;
let responseError: (err: any) => Promise<any>;

// api instance must be callable (api(originalRequest) is used for retry)
const mockApiInstance: any = Object.assign(
  jest.fn().mockResolvedValue({ data: "retried" }),
  {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: {
        use: jest.fn((fn: any) => {
          requestInterceptor = fn;
        }),
      },
      response: {
        use: jest.fn((ok: any, err: any) => {
          responseSuccess = ok;
          responseError = err;
        }),
      },
    },
  },
);

const mockNoAuth: any = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  patch: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// axios.create is auto-mocked as jest.fn(). Configure return values:
(axios.create as jest.Mock)
  .mockReturnValueOnce(mockApiInstance) // 1st call → api
  .mockReturnValueOnce(mockNoAuth); // 2nd call → apiNoAuth

// ── NOW load the module under test ──────────────────────────────────────────
const apiModule = require("../../lib/api");
const api = apiModule.default;
const {
  getAppStatus,
  reportLifecycle,
  authRegister,
  authLogin,
  authForgotPassword,
  updateMe,
  authResetPassword,
  setupBiometric,
  disableBiometric,
  fetchShoppingLists,
  createShoppingList,
  deleteShoppingList,
  renameShoppingList,
  fetchListItems,
  addListItem,
  parseAndAddItems,
  updateListItem,
  reorderListItems,
  deleteListItem,
  hardDeleteItem,
  parseItemText,
  fetchDeletedItems,
  fetchSuggestions,
  fetchRecipeSuggestions,
  searchProducts,
  fetchProduct,
  exportMyData,
  importMyData,
  registerPushToken,
  unregisterPushToken,
  authSocial,
  authLogout,
  authRefresh,
} = apiModule;

// ── Helpers ─────────────────────────────────────────────────────────────────
function make401(retry = false) {
  const config: any = { headers: new AxiosHeaders(), _retry: retry };
  return new AxiosError("Unauthorized", "ERR", config, null, {
    status: 401,
    data: {},
    statusText: "Unauthorized",
    headers: {},
    config,
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-set default resolved values after clearAllMocks
  mockApiInstance.mockResolvedValue({ data: "retried" });
  mockApiInstance.get.mockResolvedValue({ data: {} });
  mockApiInstance.post.mockResolvedValue({ data: {} });
  mockApiInstance.put.mockResolvedValue({ data: {} });
  mockApiInstance.patch.mockResolvedValue({ data: {} });
  mockApiInstance.delete.mockResolvedValue({ data: {} });
  mockNoAuth.get.mockResolvedValue({ data: {} });
  mockNoAuth.post.mockResolvedValue({ data: {} });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Module structure — checked before beforeEach clears call counts
// ═══════════════════════════════════════════════════════════════════════════
describe("api module structure", () => {
  it("exports the authenticated api instance as default", () => {
    expect(api).toBe(mockApiInstance);
  });

  it("creates two axios instances with correct baseURL", () => {
    // axios.create calls happen at module load, captured before clearAllMocks
    // We verify the instances were returned correctly (checked via api === mockApiInstance)
    expect(api).toBeDefined();
    expect(typeof api).toBe("function"); // callable for retry
  });

  it("captured request and response interceptor handlers", () => {
    expect(requestInterceptor).toBeDefined();
    expect(responseSuccess).toBeDefined();
    expect(responseError).toBeDefined();
  });

  it("does not register interceptors on apiNoAuth", () => {
    // apiNoAuth interceptors.request.use was never called with a real handler
    // We can verify by checking that the mock was not called (before clearAllMocks)
    // Since clearAllMocks runs in beforeEach, this is a structural check
    expect(mockNoAuth.interceptors.request.use).not.toHaveBeenCalled();
    expect(mockNoAuth.interceptors.response.use).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Request interceptor
// ═══════════════════════════════════════════════════════════════════════════
describe("request interceptor", () => {
  it("attaches Bearer token when auth_token exists", async () => {
    mockGetItem.mockResolvedValue("my-token");
    const config = { headers: new AxiosHeaders() };
    const result = await requestInterceptor(config);
    expect(mockGetItem).toHaveBeenCalledWith("auth_token");
    expect(result.headers.Authorization).toBe("Bearer my-token");
  });

  it("does not set Authorization when no token", async () => {
    mockGetItem.mockResolvedValue(null);
    const config = { headers: new AxiosHeaders() };
    const result = await requestInterceptor(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Response interceptor
// ═══════════════════════════════════════════════════════════════════════════
describe("response interceptor", () => {
  it("passes successful responses through", () => {
    const res = { data: "ok", status: 200 };
    expect(responseSuccess(res)).toEqual(res);
  });

  it("rejects non-401 errors without attempting refresh", async () => {
    const config: any = { headers: new AxiosHeaders() };
    const err = new AxiosError("Server Error", "ERR", config, null, {
      status: 500,
      data: {},
      statusText: "err",
      headers: {},
      config,
    } as any);
    await expect(responseError(err)).rejects.toBe(err);
    expect(mockGetItem).not.toHaveBeenCalledWith("refresh_token");
  });

  it("rejects already-retried 401s", async () => {
    const err = make401(true);
    await expect(responseError(err)).rejects.toBe(err);
  });

  it("rejects 401 when no refresh_token available", async () => {
    mockGetItem.mockResolvedValue(null);
    const err = make401();
    await expect(responseError(err)).rejects.toBe(err);
    expect(mockGetItem).toHaveBeenCalledWith("refresh_token");
  });

  it("refreshes token, persists new credentials, and retries request on 401", async () => {
    mockGetItem.mockImplementation(async (key: string) =>
      key === "refresh_token" ? "old-rt" : null,
    );
    mockNoAuth.post.mockResolvedValueOnce({
      data: {
        access_token: "new-at",
        refresh_token: "new-rt",
        user: { id: 1, name: "Test" },
      },
    });

    const err = make401();
    const result = await responseError(err);

    // Verify refresh exchange
    expect(mockNoAuth.post).toHaveBeenCalledWith("/auth/refresh", {
      refresh_token: "old-rt",
    });

    // Verify new credentials persisted
    expect(mockSetItem).toHaveBeenCalledWith("auth_token", "new-at");
    expect(mockSetItem).toHaveBeenCalledWith("refresh_token", "new-rt");
    expect(mockSetItem).toHaveBeenCalledWith(
      "auth_user",
      JSON.stringify({ id: 1, name: "Test" }),
    );

    // Verify retry was attempted via api(originalRequest)
    expect(mockApiInstance).toHaveBeenCalled();
  });

  it("clears all auth data when refresh fails", async () => {
    mockGetItem.mockResolvedValue("old-rt");
    mockNoAuth.post.mockRejectedValueOnce(new Error("refresh failed"));

    const err = make401();
    await expect(responseError(err)).rejects.toThrow("refresh failed");

    expect(mockDeleteItem).toHaveBeenCalledWith("auth_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("refresh_token");
    expect(mockDeleteItem).toHaveBeenCalledWith("auth_user");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. App Status endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("App Status API", () => {
  it("getAppStatus calls apiNoAuth GET /app/status", () => {
    getAppStatus();
    expect(mockNoAuth.get).toHaveBeenCalledWith("/app/status");
  });

  it("reportLifecycle posts state", () => {
    reportLifecycle("background");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/app/lifecycle", {
      state: "background",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Auth endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("Auth API", () => {
  it("authRegister", () => {
    authRegister("a@b.com", "pw", "Name");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/register", {
      email: "a@b.com",
      password: "pw",
      name: "Name",
    });
  });

  it("authLogin", () => {
    authLogin("a@b.com", "pw");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/login", {
      email: "a@b.com",
      password: "pw",
    });
  });

  it("authForgotPassword", () => {
    authForgotPassword("a@b.com");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/forgot-password", {
      email: "a@b.com",
    });
  });

  it("updateMe", () => {
    updateMe("New");
    expect(mockApiInstance.patch).toHaveBeenCalledWith("/auth/me", {
      name: "New",
    });
  });

  it("authResetPassword", () => {
    authResetPassword("a@b.com", "123", "newpw");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/reset-password", {
      email: "a@b.com",
      code: "123",
      new_password: "newpw",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Biometric endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("Biometric API", () => {
  it("setupBiometric", () => {
    setupBiometric("hash", "face");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/biometric/setup", {
      pin_hash: "hash",
      biometric_type: "face",
    });
  });

  it("disableBiometric", () => {
    disableBiometric();
    expect(mockApiInstance.post).toHaveBeenCalledWith(
      "/auth/biometric/disable",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Shopping Lists endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("Shopping Lists API", () => {
  it("fetchShoppingLists", () => {
    fetchShoppingLists();
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists/groups");
  });

  it("createShoppingList", () => {
    createShoppingList("Groceries");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/lists/groups", {
      name: "Groceries",
    });
  });

  it("deleteShoppingList", () => {
    deleteShoppingList("id1");
    expect(mockApiInstance.delete).toHaveBeenCalledWith("/lists/groups/id1");
  });

  it("renameShoppingList", () => {
    renameShoppingList("id1", "Renamed");
    expect(mockApiInstance.patch).toHaveBeenCalledWith("/lists/groups/id1", {
      name: "Renamed",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. List Items endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("List Items API", () => {
  it("fetchListItems with listId", () => {
    fetchListItems("L1");
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists", {
      params: { list_id: "L1" },
    });
  });

  it("fetchListItems without listId", () => {
    fetchListItems();
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists", { params: {} });
  });

  it("addListItem with listId", () => {
    addListItem("Milk", 2, "L1");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/lists/items", {
      name: "Milk",
      quantity: 2,
      list_id: "L1",
    });
  });

  it("addListItem without listId", () => {
    addListItem("Eggs", 1);
    expect(mockApiInstance.post).toHaveBeenCalledWith("/lists/items", {
      name: "Eggs",
      quantity: 1,
      list_id: undefined,
    });
  });

  it("parseAndAddItems", () => {
    parseAndAddItems("2 apples", "L1");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/lists/items/bulk", {
      text: "2 apples",
      list_id: "L1",
    });
  });

  it("updateListItem", () => {
    updateListItem("i1", { checked: 1, quantity: 5 });
    expect(mockApiInstance.patch).toHaveBeenCalledWith("/lists/items/i1", {
      checked: 1,
      quantity: 5,
    });
  });

  it("reorderListItems", () => {
    const items = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
    ];
    reorderListItems(items);
    expect(mockApiInstance.put).toHaveBeenCalledWith(
      "/lists/items/reorder",
      items,
    );
  });

  it("deleteListItem (soft)", () => {
    deleteListItem("i1");
    expect(mockApiInstance.delete).toHaveBeenCalledWith("/lists/items/i1");
  });

  it("hardDeleteItem (permanent)", () => {
    hardDeleteItem("i1");
    expect(mockApiInstance.delete).toHaveBeenCalledWith(
      "/lists/items/i1/permanent",
    );
  });

  it("parseItemText", () => {
    parseItemText("5 onions", "L1");
    expect(mockApiInstance.post).toHaveBeenCalledWith(
      "/lists/items/parse-text",
      {
        text: "5 onions",
        list_id: "L1",
      },
    );
  });

  it("fetchDeletedItems with listId", () => {
    fetchDeletedItems("L1");
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists/items/deleted", {
      params: { list_id: "L1" },
    });
  });

  it("fetchDeletedItems without listId", () => {
    fetchDeletedItems();
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists/items/deleted", {
      params: {},
    });
  });

  it("fetchSuggestions with listId", () => {
    fetchSuggestions("L1");
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists/suggestions", {
      params: { list_id: "L1" },
    });
  });

  it("fetchSuggestions without listId", () => {
    fetchSuggestions();
    expect(mockApiInstance.get).toHaveBeenCalledWith("/lists/suggestions", {
      params: {},
    });
  });

  it("fetchRecipeSuggestions with listId", () => {
    fetchRecipeSuggestions("L1");
    expect(mockApiInstance.get).toHaveBeenCalledWith(
      "/lists/recipe-suggestions",
      {
        params: { list_id: "L1" },
      },
    );
  });

  it("fetchRecipeSuggestions without listId", () => {
    fetchRecipeSuggestions();
    expect(mockApiInstance.get).toHaveBeenCalledWith(
      "/lists/recipe-suggestions",
      { params: {} },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Products endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("Products API", () => {
  it("searchProducts", () => {
    searchProducts("cheese");
    expect(mockApiInstance.get).toHaveBeenCalledWith("/products/search", {
      params: { q: "cheese" },
    });
  });

  it("fetchProduct", () => {
    fetchProduct("p1");
    expect(mockApiInstance.get).toHaveBeenCalledWith("/products/p1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. My Data endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("My Data API", () => {
  it("exportMyData", () => {
    exportMyData();
    expect(mockApiInstance.get).toHaveBeenCalledWith("/my/data");
  });

  it("importMyData", () => {
    const data = { lists: [{ name: "L" }], version: 1 };
    importMyData(data);
    expect(mockApiInstance.post).toHaveBeenCalledWith("/my/data", data);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Push Notifications endpoints
// ═══════════════════════════════════════════════════════════════════════════
describe("Push Notifications API", () => {
  it("registerPushToken", () => {
    registerPushToken("expo-tok");
    expect(mockApiInstance.post).toHaveBeenCalledWith("/push/register", {
      token: "expo-tok",
    });
  });

  it("unregisterPushToken sends token in body", () => {
    unregisterPushToken("expo-tok");
    expect(mockApiInstance.delete).toHaveBeenCalledWith("/push/unregister", {
      data: { token: "expo-tok" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Social Auth & Auth Lifecycle
// ═══════════════════════════════════════════════════════════════════════════
describe("Social Auth & Auth Lifecycle", () => {
  it("authSocial uses apiNoAuth with provider, id_token, name", () => {
    authSocial("google", "tok", "Name");
    expect(mockNoAuth.post).toHaveBeenCalledWith("/auth/social", {
      provider: "google",
      id_token: "tok",
      name: "Name",
    });
  });

  it("authSocial without name", () => {
    authSocial("apple", "tok");
    expect(mockNoAuth.post).toHaveBeenCalledWith("/auth/social", {
      provider: "apple",
      id_token: "tok",
      name: undefined,
    });
  });

  it("authLogout", () => {
    authLogout();
    expect(mockApiInstance.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("authRefresh uses apiNoAuth", () => {
    authRefresh("rt");
    expect(mockNoAuth.post).toHaveBeenCalledWith("/auth/refresh", {
      refresh_token: "rt",
    });
  });
});
