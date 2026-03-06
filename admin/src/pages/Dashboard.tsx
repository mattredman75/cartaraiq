import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import StatsCard from "../components/StatsCard";
import {
  Users,
  UserCheck,
  UserPlus,
  ShieldAlert,
  ListChecks,
  Package,
  Activity,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface Overview {
  total_users: number;
  active_users_5m: number;
  active_users_15m: number;
  active_users_30m: number;
  new_today: number;
  new_this_week: number;
  new_this_month: number;
  deactivated_users: number;
  auth_provider_breakdown: Record<string, number>;
  total_lists: number;
  total_items: number;
}

interface GrowthData {
  date: string;
  count: number;
}

interface SecurityData {
  total_failed_logins_24h: number;
  total_blocked_logins_24h: number;
  total_password_resets_24h: number;
  total_deactivated_accounts: number;
  recent_failures: any[];
}

const PIE_COLORS = [
  "#4f46e5",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
];

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [growth, setGrowth] = useState<GrowthData[]>([]);
  const [security, setSecurity] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [ov, gr, sec] = await Promise.all([
        api.get("/admin/dashboard/overview"),
        api.get("/admin/dashboard/growth?days=30"),
        api.get("/admin/dashboard/security"),
      ]);
      setOverview(ov.data);
      setGrowth(gr.data);
      setSecurity(sec.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const providerData = Object.entries(overview.auth_provider_breakdown).map(
    ([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }),
  );

  // Build date strings for drill-down links
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekISO = weekStart.toISOString().slice(0, 10);
  const monthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Live overview — auto-refreshes every 30 seconds
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Users"
          value={overview.total_users}
          icon={<Users className="w-6 h-6" />}
          to="/users"
        />
        <StatsCard
          title="Active Now (15m)"
          value={overview.active_users_15m}
          subtitle={`${overview.active_users_5m} in last 5m`}
          icon={<UserCheck className="w-6 h-6" />}
          color="green"
          to="/users?active_minutes=15&label=Active+Now+(15m)"
        />
        <StatsCard
          title="New Today"
          value={overview.new_today}
          subtitle={`${overview.new_this_week} this week`}
          icon={<UserPlus className="w-6 h-6" />}
          color="blue"
          to={`/users?registered_after=${todayISO}&label=New+Today`}
        />
        <StatsCard
          title="Deactivated"
          value={overview.deactivated_users}
          icon={<ShieldAlert className="w-6 h-6" />}
          color="red"
          to="/users?is_active=false&label=Deactivated+Users"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Lists"
          value={overview.total_lists}
          icon={<ListChecks className="w-6 h-6" />}
          color="indigo"
        />
        <StatsCard
          title="Total Items"
          value={overview.total_items}
          icon={<Package className="w-6 h-6" />}
          color="blue"
        />
        <StatsCard
          title="Active (30m)"
          value={overview.active_users_30m}
          icon={<Activity className="w-6 h-6" />}
          color="green"
          to="/users?active_minutes=30&label=Active+(30m)"
        />
        <StatsCard
          title="New This Month"
          value={overview.new_this_month}
          icon={<UserPlus className="w-6 h-6" />}
          color="amber"
          to={`/users?registered_after=${monthISO}&label=New+This+Month`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white">
            Registrations (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(d) => new Date(d).toLocaleDateString()}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              />
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Auth Provider Pie */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white">
            Auth Providers
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={providerData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {providerData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security summary */}
      {security && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 dark:text-white">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Security (Last 24h)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {security.total_failed_logins_24h}
              </p>
              <p className="text-sm text-red-500 dark:text-red-400">
                Failed Logins
              </p>
            </div>
            <div className="text-center p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {security.total_blocked_logins_24h}
              </p>
              <p className="text-sm text-amber-500 dark:text-amber-400">
                Blocked Logins
              </p>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {security.total_password_resets_24h}
              </p>
              <p className="text-sm text-blue-500 dark:text-blue-400">
                Password Resets
              </p>
            </div>
          </div>

          {security.recent_failures.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                Recent Failures
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      <th className="pb-2 font-medium">Action</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">IP</th>
                      <th className="pb-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.recent_failures.slice(0, 10).map((f: any) => (
                      <tr
                        key={f.id}
                        className="border-b border-gray-100 dark:border-gray-700"
                      >
                        <td className="py-2 font-mono text-xs dark:text-gray-300">
                          {f.action}
                        </td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500 dark:text-gray-400">
                          {f.ip_address || "—"}
                        </td>
                        <td className="py-2 text-gray-500 dark:text-gray-400">
                          {f.created_at
                            ? new Date(f.created_at).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
