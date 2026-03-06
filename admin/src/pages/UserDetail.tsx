import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import {
  ArrowLeft,
  UserX,
  UserCheck,
  KeyRound,
  LogOut,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";

interface UserDetail {
  id: string;
  email: string;
  name: string;
  role: string;
  auth_provider: string | null;
  auth_provider_id: string | null;
  is_active: boolean;
  biometric_enabled: boolean;
  biometric_type: string | null;
  created_at: string | null;
  has_password: boolean;
  has_refresh_token: boolean;
  list_count: number;
  item_count: number;
  push_token_count: number;
  recent_audit: any[];
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [message, setMessage] = useState("");

  const fetchUser = useCallback(async () => {
    try {
      const res = await api.get(`/admin/users/${userId}`);
      setUser(res.data);
    } catch {
      navigate("/users");
    } finally {
      setLoading(false);
    }
  }, [userId, navigate]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const doAction = async (
    action: string,
    method: string = "POST",
    body?: any,
  ) => {
    if (!confirm(`Are you sure you want to ${action.replace(/-/g, " ")}?`))
      return;
    setActionLoading(action);
    setMessage("");
    try {
      const url = `/admin/users/${userId}/${action}`;
      const res =
        method === "PUT" ? await api.put(url, body) : await api.post(url);
      setMessage(res.data.message);
      await fetchUser();
    } catch (err: any) {
      setMessage(err.response?.data?.detail || "Action failed");
    } finally {
      setActionLoading("");
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Users
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">{user.name}</h1>
          <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              user.is_active
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {user.is_active ? "Active" : "Inactive"}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              user.role === "admin"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {user.role}
          </span>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm">
          {message}
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <h2 className="text-lg font-semibold mb-2 dark:text-white">
            Account Info
          </h2>
          <Row label="User ID" value={user.id} mono />
          <Row label="Auth Provider" value={user.auth_provider || "Email"} />
          {user.auth_provider_id && (
            <Row label="Provider ID" value={user.auth_provider_id} mono />
          )}
          <Row label="Has Password" value={user.has_password ? "Yes" : "No"} />
          <Row
            label="Has Active Session"
            value={user.has_refresh_token ? "Yes" : "No"}
          />
          <Row
            label="Biometric"
            value={
              user.biometric_enabled
                ? user.biometric_type || "Enabled"
                : "Disabled"
            }
          />
          <Row
            label="Joined"
            value={
              user.created_at ? new Date(user.created_at).toLocaleString() : "—"
            }
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <h2 className="text-lg font-semibold mb-2 dark:text-white">Usage</h2>
          <Row label="Shopping Lists" value={String(user.list_count)} />
          <Row label="Total Items" value={String(user.item_count)} />
          <Row label="Push Tokens" value={String(user.push_token_count)} />
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">
          Admin Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {user.is_active ? (
            <ActionBtn
              icon={<UserX className="w-4 h-4" />}
              label="Deactivate"
              onClick={() => doAction("deactivate")}
              loading={actionLoading === "deactivate"}
              variant="danger"
            />
          ) : (
            <ActionBtn
              icon={<UserCheck className="w-4 h-4" />}
              label="Activate"
              onClick={() => doAction("activate")}
              loading={actionLoading === "activate"}
              variant="success"
            />
          )}
          {!user.auth_provider && (
            <ActionBtn
              icon={<KeyRound className="w-4 h-4" />}
              label="Force Password Reset"
              onClick={() => doAction("force-password-reset")}
              loading={actionLoading === "force-password-reset"}
            />
          )}
          <ActionBtn
            icon={<LogOut className="w-4 h-4" />}
            label="Revoke Sessions"
            onClick={() => doAction("revoke-sessions")}
            loading={actionLoading === "revoke-sessions"}
          />
          {user.role === "user" ? (
            <ActionBtn
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Promote to Admin"
              onClick={() => doAction("role", "PUT", { role: "admin" })}
              loading={actionLoading === "role"}
              variant="warning"
            />
          ) : (
            <ActionBtn
              icon={<ShieldOff className="w-4 h-4" />}
              label="Demote to User"
              onClick={() => doAction("role", "PUT", { role: "user" })}
              loading={actionLoading === "role"}
              variant="warning"
            />
          )}
        </div>
      </div>

      {/* Audit History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white">
          Recent Activity ({user.recent_audit.length})
        </h2>
        {user.recent_audit.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            No audit history
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">IP</th>
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {user.recent_audit.map((a: any) => (
                  <tr
                    key={a.id}
                    className="border-b border-gray-100 dark:border-gray-700"
                  >
                    <td className="py-2 font-mono text-xs dark:text-gray-300">
                      {a.action}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          a.status === "success"
                            ? "bg-green-100 text-green-700"
                            : a.status === "failure"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">
                      {a.ip_address || "—"}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-400 text-xs">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2 text-gray-400 dark:text-gray-500 text-xs max-w-[200px] truncate">
                      {a.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={
          mono
            ? "font-mono text-xs text-gray-700 dark:text-gray-300"
            : "text-gray-900 dark:text-gray-100"
        }
      >
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading: boolean;
  variant?: "default" | "danger" | "success" | "warning";
}) {
  const base =
    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer";
  const variants: Record<string, string> = {
    default:
      "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600",
    danger:
      "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900",
    success:
      "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900",
    warning:
      "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${base} ${variants[variant]}`}
    >
      {loading ? (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
