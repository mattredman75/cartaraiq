import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  detail: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  created_at: string | null;
}

interface PaginatedAuditLogs {
  logs: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export default function AuditLogPage() {
  const [data, setData] = useState<PaginatedAuditLogs | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: pageSize };
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      if (userSearch) params.user_id = userSearch;
      if (ipFilter) params.ip = ipFilter;

      const res = await api.get("/admin/audit-logs", { params });
      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, statusFilter, userSearch, ipFilter]);

  useEffect(() => {
    const debounce = setTimeout(fetchLogs, 300);
    return () => clearTimeout(debounce);
  }, [fetchLogs]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  const ACTIONS = [
    "login",
    "login_failed",
    "login_blocked",
    "register",
    "register_duplicate",
    "social_login",
    "social_login_failed",
    "social_login_blocked",
    "token_refresh",
    "token_refresh_blocked",
    "logout",
    "password_reset_request",
    "password_reset",
    "biometric_setup",
    "biometric_disable",
    "data_export",
    "data_import",
    "maintenance_toggle",
    "admin_deactivate_user",
    "admin_activate_user",
    "admin_force_password_reset",
    "admin_revoke_sessions",
    "admin_change_role",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          {data ? `${data.total} total events` : "Loading…"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="blocked">Blocked</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="User ID…"
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="IP Address…"
            value={ipFilter}
            onChange={(e) => {
              setIpFilter(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No events found
                  </td>
                </tr>
              ) : (
                data?.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          log.status === "success"
                            ? "bg-green-100 text-green-700"
                            : log.status === "failure"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500 max-w-[120px] truncate">
                      {log.user_id || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {log.ip_address || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[200px] truncate">
                      {log.detail || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-30 hover:bg-gray-50 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
