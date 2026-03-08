import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import api from "../lib/api";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Server,
  Smartphone,
  Monitor,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface FailedTest {
  name: string;
  message: string;
}

interface SuiteResult {
  id?: string;
  status: "pass" | "fail" | "error" | "running" | "pending";
  exit_code?: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  total: number;
  coverage: number | null;
  coverage_statements?: number | null;
  coverage_branches?: number | null;
  coverage_functions?: number | null;
  coverage_lines?: number | null;
  duration: number | null;
  output?: string;
  stderr?: string;
  error?: string;
  suites_passed?: number;
  suites_failed?: number;
  suites_total?: number;
  failed_tests?: FailedTest[];
  triggered_by?: string;
  created_at?: string;
}

type SuiteName = "backend" | "app" | "admin";

interface SuiteConfig {
  key: SuiteName;
  label: string;
  description: string;
  icon: ReactNode;
  color: string;
  bgColor: string;
}

interface HistoryPoint {
  id: string;
  status: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  coverage: number | null;
  coverage_statements?: number | null;
  coverage_branches?: number | null;
  coverage_functions?: number | null;
  coverage_lines?: number | null;
  duration: number | null;
  created_at: string;
}

const SUITES: SuiteConfig[] = [
  {
    key: "backend",
    label: "Backend API",
    description: "Python / pytest",
    icon: <Server className="w-5 h-5" />,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  {
    key: "app",
    label: "Mobile App",
    description: "React Native / Jest",
    icon: <Smartphone className="w-5 h-5" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
  },
  {
    key: "admin",
    label: "Admin Portal",
    description: "React / Vitest",
    icon: <Monitor className="w-5 h-5" />,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950",
  },
];

const POLL_INTERVAL = 5_000; // 5 seconds

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusBadge(status: string) {
  switch (status) {
    case "pass":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Passed
        </span>
      );
    case "fail":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          <XCircle className="w-3.5 h-3.5" /> Failed
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" /> Error
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Clock className="w-3.5 h-3.5" /> No data
        </span>
      );
  }
}

function coverageColor(pct: number | null) {
  if (pct === null) return "text-gray-400";
  if (pct >= 90) return "text-green-600 dark:text-green-400";
  if (pct >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function coverageRingColor(pct: number | null) {
  if (pct === null) return "stroke-gray-300 dark:stroke-gray-600";
  if (pct >= 90) return "stroke-green-500";
  if (pct >= 75) return "stroke-amber-500";
  return "stroke-red-500";
}

function CoverageRing({ pct }: { pct: number | null }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const filled = pct !== null ? (pct / 100) * circumference : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="5"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="5"
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            className={coverageRingColor(pct)}
          />
        </svg>
        <span className={`absolute text-sm font-bold ${coverageColor(pct)}`}>
          {pct !== null ? `${pct}%` : "—"}
        </span>
      </div>
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Coverage
      </span>
    </div>
  );
}

/* ── Trend Chart ──────────────────────────────────────────────────────────── */

function TrendChart({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null;

  const data = history.map((h, i) => ({
    run: `#${i + 1}`,
    Passed: h.passed,
    Failed: h.failed,
    Skipped: h.skipped,
    Coverage: h.coverage ?? 0,
  }));

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
        Recent Trend
      </h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="run" tick={{ fontSize: 10 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            label={{
              value: "Tests",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10, fill: "#9ca3af" },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-gray-800, #1f2937)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Line
            type="monotone"
            dataKey="Passed"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Failed"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="Skipped"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Coverage Metrics Chart ───────────────────────────────────────────────── */

function CoverageChart({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null;

  // Check if any non-null coverage metrics exist
  const hasCoverageData = history.some(h => 
    h.coverage_statements !== null || 
    h.coverage_branches !== null || 
    h.coverage_functions !== null || 
    h.coverage_lines !== null
  );

  if (!hasCoverageData) return null;

  const data = history.map((h, i) => ({
    run: `#${i + 1}`,
    Statements: h.coverage_statements ?? null,
    Branches: h.coverage_branches ?? null,
    Functions: h.coverage_functions ?? null,
    Lines: h.coverage_lines ?? null,
  }));

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
        Coverage Metrics
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="run" tick={{ fontSize: 10 }} />
          <YAxis 
            tick={{ fontSize: 10 }} 
            domain={[0, 100]}
            label={{
              value: "Coverage %",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10, fill: "#9ca3af" },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-gray-800, #1f2937)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "12px",
            }}
            formatter={(value) => value !== null ? `${value.toFixed(2)}%` : "—"}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Line
            type="monotone"
            dataKey="Statements"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Branches"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Functions"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Lines"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Suite Card ───────────────────────────────────────────────────────────── */

function SuiteCard({
  config,
  result,
  running,
  onRun,
  history,
}: {
  config: SuiteConfig;
  result: SuiteResult | null;
  running: boolean;
  onRun: () => void;
  history: HistoryPoint[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = running || result?.status === "running";
  const showStats =
    result && result.status !== "running" && result.status !== "pending";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${config.bgColor} ${config.color}`}>
            {config.icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {config.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {config.description}
              {result?.created_at && (
                <span className="ml-2 text-gray-400 dark:text-gray-500">
                  · {timeAgo(result.created_at)}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result && statusBadge(result.status)}
          <button
            onClick={onRun}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors cursor-pointer"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {/* Running indicator */}
      {isRunning && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            <Loader2 className="w-5 h-5 animate-spin" />
            <div>
              <p className="text-sm font-medium">
                Tests running in background…
              </p>
              <p className="text-xs mt-0.5 opacity-75">
                You can leave this page and come back — results will be saved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {showStats && (
        <div className="px-5 pb-5">
          {result.status === "error" ? (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm">
              {result.error}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-6">
                {/* Coverage ring */}
                <CoverageRing pct={result.coverage} />

                {/* Test counts */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBlock
                    label="Total"
                    value={result.total}
                    color="text-gray-900 dark:text-white"
                  />
                  <StatBlock
                    label="Passed"
                    value={result.passed}
                    color="text-green-600 dark:text-green-400"
                  />
                  <StatBlock
                    label="Failed"
                    value={result.failed}
                    color={
                      result.failed > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-400"
                    }
                  />
                  <StatBlock
                    label="Skipped"
                    value={result.skipped}
                    color="text-amber-600 dark:text-amber-400"
                  />
                </div>

                {/* Duration */}
                {result.duration !== null && (
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      Duration
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {result.duration}s
                    </p>
                  </div>
                )}
              </div>

              {/* Failed tests */}
              {result.failed_tests && result.failed_tests.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                    Failed Tests ({result.failed_tests.length})
                  </h4>
                  <div className="space-y-2">
                    {result.failed_tests.map((ft, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800"
                      >
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          {ft.name}
                        </p>
                        {ft.message && (
                          <pre className="mt-1 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-words max-h-24 overflow-auto">
                            {ft.message}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trend chart */}
              <TrendChart history={history} />

              {/* Coverage metrics chart */}
              <CoverageChart history={history} />

              {/* Expandable output */}
              {result.output && (
                <>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                  >
                    {expanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    {expanded ? "Hide" : "Show"} raw output
                  </button>

                  {expanded && (
                    <pre className="mt-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-80 whitespace-pre-wrap break-words">
                      {result.output || "(no output)"}
                      {result.stderr ? `\n\nSTDERR:\n${result.stderr}` : ""}
                    </pre>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ── Summary Bar ──────────────────────────────────────────────────────────── */

function SummaryBar({
  results,
}: {
  results: Record<string, SuiteResult | null>;
}) {
  const suites = Object.values(results).filter(
    (r): r is SuiteResult => r !== null && r.status !== "running",
  );
  if (suites.length === 0) return null;

  const totalPassed = suites.reduce((s, r) => s + r.passed, 0);
  const totalFailed = suites.reduce((s, r) => s + r.failed, 0);
  const totalSkipped = suites.reduce((s, r) => s + r.skipped, 0);
  const totalTests = suites.reduce((s, r) => s + r.total, 0);
  const allPassed = suites.every((r) => r.status === "pass");

  return (
    <div
      className={`rounded-xl p-4 flex items-center justify-between ${
        allPassed
          ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
          : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
      }`}
    >
      <div className="flex items-center gap-3">
        {allPassed ? (
          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
        )}
        <div>
          <p
            className={`font-semibold ${allPassed ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}`}
          >
            {allPassed ? "All Tests Passing" : "Some Tests Failing"}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {suites.length} suite{suites.length !== 1 ? "s" : ""} tested
          </p>
        </div>
      </div>
      <div className="flex gap-6 text-sm">
        <div className="text-center">
          <p className="font-bold text-gray-900 dark:text-white">
            {totalTests}
          </p>
          <p className="text-gray-500 dark:text-gray-400">Total</p>
        </div>
        <div className="text-center">
          <p className="font-bold text-green-600 dark:text-green-400">
            {totalPassed}
          </p>
          <p className="text-gray-500 dark:text-gray-400">Passed</p>
        </div>
        <div className="text-center">
          <p
            className={`font-bold ${totalFailed > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}
          >
            {totalFailed}
          </p>
          <p className="text-gray-500 dark:text-gray-400">Failed</p>
        </div>
        <div className="text-center">
          <p className="font-bold text-amber-600 dark:text-amber-400">
            {totalSkipped}
          </p>
          <p className="text-gray-500 dark:text-gray-400">Skipped</p>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function TestResultsPage() {
  const [results, setResults] = useState<Record<string, SuiteResult | null>>({
    backend: null,
    app: null,
    admin: null,
  });
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({
    backend: [],
    app: [],
    admin: [],
  });
  const [initialLoad, setInitialLoad] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch last results + history ──────────────────────────────────────
  const fetchResults = useCallback(async () => {
    try {
      const [resRes, histRes] = await Promise.all([
        api.get("/admin/tests/results"),
        api.get("/admin/tests/history"),
      ]);
      setResults(resRes.data.suites);
      setHistory(histRes.data.history);
    } catch {
      // ignore — we'll retry on next poll
    } finally {
      setInitialLoad(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Poll while any suite is "running"
  const anyRunning = Object.values(results).some(
    (r) => r?.status === "running",
  );

  useEffect(() => {
    if (anyRunning) {
      pollRef.current = setInterval(fetchResults, POLL_INTERVAL);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [anyRunning, fetchResults]);

  // ── Trigger a run ────────────────────────────────────────────────────
  const runSuite = async (suite: SuiteName) => {
    // Optimistically mark as running
    setResults((prev) => ({
      ...prev,
      [suite]: {
        ...(prev[suite] ?? {}),
        status: "running",
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        total: 0,
        coverage: null,
        duration: null,
      } as SuiteResult,
    }));
    try {
      const res = await api.post(`/admin/tests/run?suite=${suite}`);
      // Backend returns the "running" row — poll will pick up completed state
      setResults((prev) => ({
        ...prev,
        [suite]: res.data.suites[suite],
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setResults((prev) => ({
        ...prev,
        [suite]: {
          status: "error",
          error: message,
          passed: 0,
          failed: 0,
          skipped: 0,
          errors: 0,
          total: 0,
          coverage: null,
          duration: null,
        },
      }));
    }
  };

  const runAll = async () => {
    // Optimistically mark all as running
    for (const s of ["backend", "app", "admin"] as SuiteName[]) {
      setResults((prev) => ({
        ...prev,
        [s]: {
          ...(prev[s] ?? {}),
          status: "running",
          passed: 0,
          failed: 0,
          skipped: 0,
          errors: 0,
          total: 0,
          coverage: null,
          duration: null,
        } as SuiteResult,
      }));
    }
    try {
      const res = await api.post("/admin/tests/run?suite=all");
      setResults((prev) => ({
        ...prev,
        ...res.data.suites,
      }));
    } catch {
      // individual suite states already set to running — poll will resolve
    }
  };

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FlaskConical className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            <h1 className="text-2xl font-bold dark:text-white">Test Results</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-10">
            Run and review test suites — results persist so you can leave and
            come back
          </p>
        </div>
        <button
          onClick={runAll}
          disabled={anyRunning}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors cursor-pointer"
        >
          {anyRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run All Tests
        </button>
      </div>

      {/* Summary bar */}
      <SummaryBar results={results} />

      {/* Suite cards */}
      <div className="space-y-4">
        {SUITES.map((config) => (
          <SuiteCard
            key={config.key}
            config={config}
            result={results[config.key]}
            running={results[config.key]?.status === "running"}
            onRun={() => runSuite(config.key)}
            history={history[config.key] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
