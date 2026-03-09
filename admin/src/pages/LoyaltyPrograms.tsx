import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Megaphone,
  X,
  Check,
  Loader2,
} from "lucide-react";

interface DetectionRules {
  prefixes: string[];
  lengths: number[];
  symbology: string[];
}

interface LoyaltyProgram {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  logo_background: string | null;
  detection_rules: DetectionRules;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
}

const emptyForm = {
  slug: "",
  name: "",
  logo_url: "",
  logo_background: "#FFFFFF",
  prefixes: "",
  lengths: "",
  symbology: "",
  is_active: true,
  sort_order: 0,
};

type FormState = typeof emptyForm;

function rulesFromForm(f: FormState): DetectionRules {
  return {
    prefixes: f.prefixes
      ? f.prefixes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    lengths: f.lengths
      ? f.lengths
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
      : [],
    symbology: f.symbology
      ? f.symbology
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  };
}

function formFromProgram(p: LoyaltyProgram): FormState {
  return {
    slug: p.slug,
    name: p.name,
    logo_url: p.logo_url ?? "",
    logo_background: p.logo_background ?? "",
    prefixes: (p.detection_rules?.prefixes ?? []).join(", "),
    lengths: (p.detection_rules?.lengths ?? []).join(", "),
    symbology: (p.detection_rules?.symbology ?? []).join(", "),
    is_active: p.is_active,
    sort_order: p.sort_order,
  };
}

export default function LoyaltyProgramsPage() {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  // Modal state
  const [editingId, setEditingId] = useState<string | null>(null); // null = create new
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/loyalty-programs");
      setPrograms(
        Array.isArray(res.data) ? res.data : (res.data.programs ?? []),
      );
    } catch {
      setError("Failed to load loyalty programs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: LoyaltyProgram) => {
    setEditingId(p.id);
    setForm(formFromProgram(p));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.slug.trim() || !form.name.trim()) {
      setFeedback("Slug and name are required");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        logo_url: form.logo_url.trim() || null,
        logo_background: form.logo_background.trim() || null,
        detection_rules: rulesFromForm(form),
        is_active: form.is_active,
        sort_order: Number(form.sort_order),
      };
      if (editingId) {
        await api.put(`/admin/loyalty-programs/${editingId}`, payload);
        setFeedback("Program updated");
      } else {
        await api.post("/admin/loyalty-programs", payload);
        setFeedback("Program created");
      }
      closeModal();
      fetchPrograms();
    } catch (err: any) {
      setFeedback(err.response?.data?.detail ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: LoyaltyProgram) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/loyalty-programs/${p.id}`);
      setFeedback(`Deleted "${p.name}"`);
      fetchPrograms();
    } catch (err: any) {
      setFeedback(err.response?.data?.detail ?? "Failed to delete");
    }
  };

  const handleBroadcast = async () => {
    if (
      !confirm("Send a silent push to all devices to refresh loyalty programs?")
    )
      return;
    setBroadcasting(true);
    setFeedback("");
    try {
      await api.post("/admin/loyalty-programs/broadcast");
      setFeedback("Broadcast sent to all devices");
    } catch (err: any) {
      setFeedback(err.response?.data?.detail ?? "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  };

  const field = (
    label: string,
    key: keyof FormState,
    opts?: { type?: string; placeholder?: string; hint?: string },
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      {opts?.hint && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          {opts.hint}
        </p>
      )}
      <input
        type={opts?.type ?? "text"}
        placeholder={opts?.placeholder ?? ""}
        value={String(form[key])}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]:
              opts?.type === "number" ? Number(e.target.value) : e.target.value,
          }))
        }
        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-teal-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Loyalty Programs
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {programs.length} programs configured
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBroadcast}
            disabled={broadcasting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-teal-600 text-teal-700 text-sm font-medium hover:bg-teal-50 disabled:opacity-50"
          >
            {broadcasting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Megaphone className="w-4 h-4" />
            )}
            Broadcast Update
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
          >
            <Plus className="w-4 h-4" />
            Add Program
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-teal-50 dark:bg-teal-900 text-teal-800 dark:text-teal-200 text-sm flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback("")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Logo
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Name / Slug
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Prefixes
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Background
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">
                  Active
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">
                  Order
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {programs.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="px-4 py-3">
                    {p.logo_url ? (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                        style={{
                          backgroundColor: p.logo_background ?? "#f5f5f5",
                        }}
                      >
                        <img
                          src={p.logo_url}
                          alt={p.name}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {p.name}
                    </div>
                    <div className="text-gray-400 dark:text-gray-500 text-xs">
                      {p.slug}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.detection_rules?.prefixes ?? [])
                        .slice(0, 3)
                        .map((pf) => (
                          <span
                            key={pf}
                            className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-mono"
                          >
                            {pf}
                          </span>
                        ))}
                      {(p.detection_rules?.prefixes ?? []).length > 3 && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                          +{p.detection_rules.prefixes.length - 3} more
                        </span>
                      )}
                      {(p.detection_rules?.prefixes ?? []).length === 0 && (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {p.logo_background ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded border border-gray-200 dark:border-gray-600"
                          style={{ backgroundColor: p.logo_background }}
                        />
                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          {p.logo_background}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.is_active ? (
                      <Check className="w-4 h-4 text-teal-600 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                    {p.sort_order}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-teal-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-gray-400 dark:text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-gray-400 dark:text-gray-500"
                  >
                    No programs yet. Click "Add Program" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingId ? "Edit Program" : "Add Program"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              {field("Slug", "slug", {
                placeholder: "flybuys",
                hint: "Unique lowercase identifier (e.g. coles-flybuys)",
              })}
              {field("Name", "name", { placeholder: "Flybuys" })}
              {field("Logo URL", "logo_url", {
                placeholder: "https://cdn.example.com/logo.png",
                hint: "Fully-qualified URL to PNG/SVG logo",
              })}

              {/* Logo background with preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Logo Background
                </label>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                  Brand background color for the logo tile
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    id="transparent_bg"
                    type="checkbox"
                    checked={form.logo_background === ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        logo_background: e.target.checked ? "" : "#FFFFFF",
                      }))
                    }
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <label
                    htmlFor="transparent_bg"
                    className="text-sm text-gray-600 dark:text-gray-400"
                  >
                    Transparent background
                  </label>
                </div>
                {form.logo_background !== "" && (
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.logo_background || "#FFFFFF"}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          logo_background: e.target.value,
                        }))
                      }
                      className="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-700"
                    />
                    <input
                      type="text"
                      value={form.logo_background}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          logo_background: e.target.value,
                        }))
                      }
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="#FFFFFF"
                    />
                    {form.logo_url && (
                      <div
                        className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: form.logo_background }}
                      >
                        <img
                          src={form.logo_url}
                          alt=""
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {field("Detection Prefixes", "prefixes", {
                placeholder: "6014, 601435, 601436",
                hint: "Comma-separated barcode prefixes",
              })}
              {field("Card Lengths", "lengths", {
                placeholder: "13, 16",
                hint: "Expected barcode digit lengths (optional)",
              })}
              {field("Symbology", "symbology", {
                placeholder: "ean13, code128",
                hint: "Accepted barcode symbologies (optional)",
              })}
              {field("Sort Order", "sort_order", {
                type: "number",
                placeholder: "0",
              })}

              <div className="flex items-center gap-3">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                  className="w-4 h-4 text-teal-600 rounded"
                />
                <label
                  htmlFor="is_active"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Active (visible in app)
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Save Changes" : "Create Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
