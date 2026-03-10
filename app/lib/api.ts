import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getItem, setItem, deleteItem } from "./storage";
import { API_URL } from "./constants";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// Unauthenticated API client for public endpoints (no auth token)
const apiNoAuth = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

// ── Silent token refresh on 401 ──────────────────────────────────────────────
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh on 401 and not already retrying
    if (err.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(err);
    }

    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshToken = await getItem("refresh_token");
        if (!refreshToken) {
          // No refresh token — can't recover
          isRefreshing = false;
          return Promise.reject(err);
        }

        const res = await apiNoAuth.post("/auth/refresh", {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRefreshToken, user } = res.data;

        // Persist new tokens
        await setItem("auth_token", access_token);
        if (newRefreshToken) await setItem("refresh_token", newRefreshToken);
        await setItem("auth_user", JSON.stringify(user));

        isRefreshing = false;
        onTokenRefreshed(access_token);

        // Retry the original request with the new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        refreshSubscribers = [];

        // Refresh failed — clear auth so the app redirects to login
        await deleteItem("auth_token");
        await deleteItem("refresh_token");
        await deleteItem("auth_user");

        return Promise.reject(refreshErr);
      }
    }

    // Another request triggered while refresh is in progress — queue it
    return new Promise((resolve) => {
      subscribeTokenRefresh((newToken: string) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        resolve(api(originalRequest));
      });
    });
  },
);

export default api;

// --- App Status ---
export const getAppStatus = () => apiNoAuth.get("/app/status");

export const reportLifecycle = (state: "foreground" | "background") =>
  api.post("/app/lifecycle", { state });

// --- Auth ---
export const authRegister = (email: string, password: string, name: string) =>
  api.post("/auth/register", { email, password, name });

export const authLogin = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const authForgotPassword = (email: string) =>
  api.post("/auth/forgot-password", { email });

export const updateMe = (name: string) => api.patch("/auth/me", { name });

export const uploadAvatar = (uri: string) => {
  const formData = new FormData();
  formData.append("file", { uri, name: "avatar.jpg", type: "image/jpeg" } as unknown as Blob);
  return api.post("/auth/me/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const clearAvatar = () => api.delete("/auth/me/avatar");

export const authResetPassword = (
  email: string,
  code: string,
  new_password: string,
) => api.post("/auth/reset-password", { email, code, new_password });

// --- Biometric ---
export const setupBiometric = (pinHash: string, biometricType: string) =>
  api.post("/auth/biometric/setup", {
    pin_hash: pinHash,
    biometric_type: biometricType,
  });

export const disableBiometric = () => api.post("/auth/biometric/disable");

// --- Shopping Lists ---
export const fetchShoppingLists = () => api.get("/lists/groups");

export const createShoppingList = (name: string) =>
  api.post("/lists/groups", { name });

export const deleteShoppingList = (id: string) =>
  api.delete(`/lists/groups/${id}`);

export const renameShoppingList = (id: string, name: string) =>
  api.patch(`/lists/groups/${id}`, { name });

// --- List Items ---
export const fetchListItems = (listId?: string) =>
  api.get("/lists", { params: listId ? { list_id: listId } : {} });

export const addListItem = (name: string, quantity: number, listId?: string) =>
  api.post("/lists/items", { name, quantity, list_id: listId });

export const parseAndAddItems = (text: string, listId?: string) =>
  api.post("/lists/items/bulk", { text, list_id: listId });

export const updateListItem = (
  id: string,
  data: Partial<{
    name: string;
    quantity: number;
    unit: string | null;
    checked: number;
    sort_order: number;
  }>,
) => api.patch(`/lists/items/${id}`, data);

export const reorderListItems = (items: { id: string; sort_order: number }[]) =>
  api.put("/lists/items/reorder", items);

export const deleteListItem = (id: string) => api.delete(`/lists/items/${id}`);

export const hardDeleteItem = (id: string) =>
  api.delete(`/lists/items/${id}/permanent`);

export const parseItemText = (text: string, listId?: string) =>
  api.post("/lists/items/parse-text", { text, list_id: listId });

export const fetchDeletedItems = (listId?: string) =>
  api.get("/lists/items/deleted", {
    params: listId ? { list_id: listId } : {},
  });

export const fetchSuggestions = (listId?: string) =>
  api.get("/lists/suggestions", { params: listId ? { list_id: listId } : {} });

export const fetchRecipeSuggestions = (listId?: string) =>
  api.get("/lists/recipe-suggestions", {
    params: listId ? { list_id: listId } : {},
  });

// --- Products ---
export const searchProducts = (q: string) =>
  api.get("/products/search", { params: { q } });

export const fetchProduct = (id: string) => api.get(`/products/${id}`);

// --- My Data ---
export const exportMyData = () => api.get("/my/data");

export const importMyData = (data: { lists: any[]; version?: number }) =>
  api.post("/my/data", data);

// --- Push Notifications ---
export const registerPushToken = (token: string) =>
  api.post("/push/register", { token });

export const unregisterPushToken = (token: string) =>
  api.delete("/push/unregister", { data: { token } });

// --- Social Auth ---
export const authSocial = (provider: string, id_token: string, name?: string) =>
  apiNoAuth.post("/auth/social", { provider, id_token, name });

// --- Recipe Inspiration ---
export const fetchRecipeInspiration = (category: string, page = 0) =>
  api.get("/recipes/inspiration", { params: { category, page } });

export const fetchRecipeDetail = (recipeId: string) =>
  api.get(`/recipes/${recipeId}`);

// --- AR Recipes ---
export const fetchARRecipeSearch = (category: string, limit = 12) =>
  api.get("/recipes/search", { params: { category, limit } });

export const fetchARRecipeDetail = (recipeId: string) =>
  api.get(`/recipes/ar/${recipeId}`);

// --- Auth Lifecycle ---
export const authLogout = () => api.post("/auth/logout");

export const authRefresh = (refresh_token: string) =>
  apiNoAuth.post("/auth/refresh", { refresh_token });

// --- List Sharing ---
export const createListInvite = (listId: string) =>
  api.post(`/lists/groups/${listId}/invite`);

export const fetchListShares = (listId: string) =>
  api.get(`/lists/groups/${listId}/shares`);

export const removeListShare = (listId: string, shareId: string) =>
  api.delete(`/lists/groups/${listId}/shares/${shareId}`);

export const acceptListInvite = (token: string) =>
  api.post(`/lists/share/accept/${token}`);

export const leaveList = (listId: string) =>
  api.post(`/lists/groups/${listId}/leave`);

// --- Recipe hearts (favourites) ---
export const heartRecipe = (id: string) => api.post(`/recipes/ar/${id}/heart`);
export const unheartRecipe = (id: string) =>
  api.delete(`/recipes/ar/${id}/heart`);
export const fetchHeartedRecipes = () => api.get("/recipes/hearts");
