import axios from "axios";
import { getItem } from "./storage";
import { API_URL } from "./constants";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const token = await getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

api.interceptors.response.use(
  (res) => {
    return res;
  },
  (err) => {
    console.log(
      "❌ API Error:",
      err.response?.status,
      err.config?.method?.toUpperCase(),
      err.config?.url,
      err.message,
    );
    return Promise.reject(err);
  },
);

export default api;

// --- Auth ---
export const authRegister = (email: string, password: string, name: string) =>
  api.post("/auth/register", { email, password, name });

export const authLogin = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const authForgotPassword = (email: string) =>
  api.post("/auth/forgot-password", { email });

export const updateMe = (name: string) => api.patch("/auth/me", { name });

export const authResetPassword = (
  email: string,
  code: string,
  new_password: string,
) => api.post("/auth/reset-password", { email, code, new_password });

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
