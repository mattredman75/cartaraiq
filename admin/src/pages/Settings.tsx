import { useEffect, useState } from "react";
import api from "../lib/api";
import { Wrench, AlertTriangle } from "lucide-react";

interface MaintenanceStatus {
  maintenance: boolean;
  message: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/app/status")
      .then((res) => {
        setStatus(res.data);
        setMessage(res.data.message || "");
        setLoading(false);
      })
      .catch(() => {
        setFetchError("Failed to load maintenance status");
        setLoading(false);
      });
  }, []);

  const toggleMaintenance = async (enable: boolean) => {
    if (
      !confirm(
        `Are you sure you want to ${enable ? "ENABLE" : "DISABLE"} maintenance mode?`,
      )
    )
      return;
    setSaving(true);
    setFeedback("");
    try {
      const res = await api.put("/app/maintenance", {
        maintenance: enable,
        message: enable ? message : "",
      });
      setStatus(res.data);
      setFeedback(
        enable ? "Maintenance mode enabled" : "Maintenance mode disabled",
      );
    } catch (err: any) {
      setFeedback(err.response?.data?.detail || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            System configuration
          </p>
        </div>
        <div className="p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          System configuration
        </p>
      </div>

      {feedback && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm">
          {feedback}
        </div>
      )}

      {/* Maintenance Mode */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wrench className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold dark:text-white">
            Maintenance Mode
          </h2>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Current status:
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              status?.maintenance
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {status?.maintenance ? "MAINTENANCE" : "OPERATIONAL"}
          </span>
        </div>

        {status?.maintenance && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">
              Maintenance mode is active. All app users will see the maintenance
              screen.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Maintenance Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="We're performing scheduled maintenance. We'll be back shortly."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            {!status?.maintenance ? (
              <button
                onClick={() => toggleMaintenance(true)}
                disabled={saving}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving ? "Saving…" : "Enable Maintenance Mode"}
              </button>
            ) : (
              <button
                onClick={() => toggleMaintenance(false)}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving ? "Saving…" : "Disable Maintenance Mode"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-2 dark:text-white">About</h2>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>Application:</strong> CartaraIQ Admin Panel
          </p>
          <p>
            <strong>API:</strong>{" "}
            {import.meta.env.VITE_API_URL || "http://localhost:8000"}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            All admin actions are recorded in the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}
