import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sliding session: on 401/403 attempt token refresh before redirecting to login
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const url = err.config?.url || "";
    const isAuthRequest =
      url.includes("/auth/login") || url.includes("/auth/refresh");

    if (
      !isAuthRequest &&
      (err.response?.status === 401 || err.response?.status === 403)
    ) {
      const refreshToken = sessionStorage.getItem("admin_refresh_token");

      if (!refreshToken) {
        // No refresh token — clear session and redirect
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_user");
        window.location.href = "/login";
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Queue the retry behind the in-flight refresh
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            err.config.headers.Authorization = `Bearer ${token}`;
            resolve(api(err.config));
          });
        });
      }

      isRefreshing = true;
      try {
        const res = await api.post("/auth/refresh", {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRt } = res.data;
        sessionStorage.setItem("admin_token", access_token);
        if (newRt) sessionStorage.setItem("admin_refresh_token", newRt);
        refreshQueue.forEach((cb) => cb(access_token));
        refreshQueue = [];
        err.config.headers.Authorization = `Bearer ${access_token}`;
        return api(err.config);
      } catch {
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_refresh_token");
        sessionStorage.removeItem("admin_user");
        window.location.href = "/login";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  },
);

export default api;
