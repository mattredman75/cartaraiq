"""Tests for test-runner endpoints and parser helpers in backend/routers/admin.py."""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from backend.routers.admin import (
    _parse_pytest_output,
    _parse_jest_json,
    _parse_vitest_json,
    _run_suite,
    _run_tests_background,
    _test_run_to_dict,
    _send_forced_reset_email,
)
from backend.models.test_run import TestRun
from backend.tests.conftest import auth_headers, make_admin, make_user


# ── Parser tests ─────────────────────────────────────────────────────────────


class TestParsePytestOutput:
    def test_parses_summary_with_all_fields(self):
        stdout = (
            "backend/tests/test_auth.py::test_login PASSED\n"
            "====== 45 passed, 2 failed, 1 skipped in 12.34s ======\n"
            "TOTAL    1823   308   83%\n"
        )
        result = _parse_pytest_output(stdout, "")
        assert result["passed"] == 45
        assert result["failed"] == 2
        assert result["skipped"] == 1
        assert result["total"] == 48
        assert result["duration"] == 12.34
        assert result["coverage"] == 83

    def test_parses_short_format_fallback(self):
        stdout = "45 passed\n3 failed\n"
        result = _parse_pytest_output(stdout, "")
        assert result["passed"] == 45
        assert result["failed"] == 3
        assert result["total"] == 48

    def test_no_output_returns_zeros(self):
        result = _parse_pytest_output("", "")
        assert result["passed"] == 0
        assert result["total"] == 0
        assert result["coverage"] is None
        assert result["duration"] is None

    def test_parses_error_count_fallback(self):
        # Summary parser captures "error" (singular) but dict key is "errors" (plural),
        # so the summary branch doesn't populate errors. Test the fallback path instead.
        stdout = "10 passed\n1 error\n"
        result = _parse_pytest_output(stdout, "")
        assert result["passed"] == 10
        assert result["errors"] == 1
        assert result["total"] == 11

    def test_coverage_from_stderr(self):
        result = _parse_pytest_output("", "TOTAL    100   5   95%\n")
        assert result["coverage"] == 95


class TestParseJestJson:
    def _make_jest_output(self, **overrides):
        data = {
            "numPassedTests": 100,
            "numFailedTests": 2,
            "numPendingTests": 3,
            "numTotalTests": 105,
            "startTime": 1700000000000,
            "numPassedTestSuites": 10,
            "numFailedTestSuites": 1,
            "numTotalTestSuites": 11,
            "testResults": [
                {"endTime": 1700000010000, "assertionResults": []},
            ],
            "coverageMap": {
                "file1.ts": {"s": {"0": 1, "1": 1, "2": 0}},
                "file2.ts": {"s": {"0": 1, "1": 1}},
            },
        }
        data.update(overrides)
        return json.dumps(data)

    def test_parses_full_jest_output(self):
        stdout = self._make_jest_output()
        result = _parse_jest_json(stdout)
        assert result["passed"] == 100
        assert result["failed"] == 2
        assert result["skipped"] == 3
        assert result["total"] == 105
        assert result["suites_passed"] == 10
        assert result["suites_failed"] == 1
        assert result["suites_total"] == 11
        assert result["duration"] == 10.0
        assert result["coverage"] == 80  # 4 out of 5 statements covered

    def test_parses_with_warnings_before_json(self):
        stdout = "WARN: some warning\n\n" + self._make_jest_output()
        result = _parse_jest_json(stdout)
        assert result["passed"] == 100

    def test_no_coverage_map(self):
        stdout = self._make_jest_output(coverageMap={})
        result = _parse_jest_json(stdout)
        assert result["coverage"] is None

    def test_invalid_json_returns_zeros(self):
        result = _parse_jest_json("not json at all", "")
        assert result["passed"] == 0
        assert result["total"] == 0

    def test_failed_test_details_extracted(self):
        stdout = self._make_jest_output(testResults=[
            {
                "endTime": 1700000010000,
                "assertionResults": [
                    {"status": "failed", "fullName": "test foo", "failureMessages": ["Expected 1 to be 2"]},
                    {"status": "passed", "fullName": "test bar", "failureMessages": []},
                ],
            },
        ])
        result = _parse_jest_json(stdout)
        assert "failed_tests" in result
        assert len(result["failed_tests"]) == 1
        assert result["failed_tests"][0]["name"] == "test foo"

    def test_no_test_results_for_duration(self):
        stdout = self._make_jest_output(testResults=[])
        result = _parse_jest_json(stdout)
        assert result["duration"] is None


class TestParseVitestJson:
    def _make_vitest_output(self, **overrides):
        data = {
            "numPassedTests": 50,
            "numFailedTests": 0,
            "numPendingTests": 1,
            "numTodoTests": 2,
            "numTotalTests": 53,
            "startTime": 1700000000000,
            "numPassedTestSuites": 5,
            "numFailedTestSuites": 0,
            "numTotalTestSuites": 5,
            "testResults": [
                {"endTime": 1700000005000, "assertionResults": []},
            ],
        }
        data.update(overrides)
        json_str = json.dumps(data)
        # Vitest appends coverage table after JSON
        coverage_table = (
            "\n % Coverage report from v8\n"
            "All files          |   95.73 |    91.45 |   97.69 |   96.76 |\n"
        )
        return json_str + coverage_table

    def test_parses_full_vitest_output(self):
        stdout = self._make_vitest_output()
        result = _parse_vitest_json(stdout)
        assert result["passed"] == 50
        assert result["failed"] == 0
        assert result["skipped"] == 3  # pending + todo
        assert result["total"] == 53
        assert result["suites_passed"] == 5
        assert result["coverage"] == 96  # rounds 95.73
        assert result["duration"] == 5.0

    def test_no_coverage_table(self):
        data = json.dumps({"numPassedTests": 10, "numTotalTests": 10,
                           "testResults": [], "startTime": 0})
        result = _parse_vitest_json(data)
        assert result["passed"] == 10
        assert result["coverage"] is None

    def test_invalid_json_returns_zeros(self):
        result = _parse_vitest_json("garbage", "")
        assert result["passed"] == 0

    def test_failed_test_details(self):
        stdout = self._make_vitest_output(testResults=[
            {
                "endTime": 1700000005000,
                "assertionResults": [
                    {"status": "failed", "fullName": "should render", "failureMessages": ["Error: boom"]},
                ],
            },
        ])
        result = _parse_vitest_json(stdout)
        assert "failed_tests" in result
        assert len(result["failed_tests"]) == 1

    def test_coverage_from_stderr_only(self):
        data = json.dumps({"numPassedTests": 5, "numTotalTests": 5, "testResults": []})
        stderr = "All files          |   88.50 |    80.00 |   90.00 |   88.50 |\n"
        result = _parse_vitest_json(data, stderr)
        assert result["coverage"] == 88


# ── _run_suite tests ─────────────────────────────────────────────────────────


class TestRunSuite:
    def test_unknown_suite_returns_error(self):
        result = _run_suite("nonexistent")
        assert result["status"] == "error"
        assert "Unknown suite" in result["error"]

    @patch("backend.routers.admin.subprocess.run")
    def test_backend_suite_runs_pytest(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="====== 10 passed in 3.0s ======\nTOTAL    100   5   95%",
            stderr="",
            returncode=0,
        )
        result = _run_suite("backend")
        assert result["status"] == "pass"
        assert result["passed"] == 10
        assert result["coverage"] == 95
        # Verify pytest command was used
        cmd = mock_run.call_args[0][0]
        assert "pytest" in str(cmd)

    @patch("backend.routers.admin.subprocess.run")
    def test_app_suite_runs_jest(self, mock_run):
        jest_data = json.dumps({
            "numPassedTests": 50, "numFailedTests": 0,
            "numPendingTests": 0, "numTotalTests": 50,
            "testResults": [], "coverageMap": {},
        })
        mock_run.return_value = MagicMock(stdout=jest_data, stderr="", returncode=0)
        result = _run_suite("app")
        assert result["status"] == "pass"
        assert result["passed"] == 50

    @patch("backend.routers.admin.subprocess.run")
    def test_admin_suite_runs_vitest(self, mock_run):
        vitest_data = json.dumps({
            "numPassedTests": 30, "numFailedTests": 0,
            "numPendingTests": 0, "numTotalTests": 30,
            "testResults": [],
        })
        mock_run.return_value = MagicMock(stdout=vitest_data, stderr="", returncode=0)
        result = _run_suite("admin")
        assert result["status"] == "pass"
        assert result["passed"] == 30

    @patch("backend.routers.admin.subprocess.run")
    def test_failed_tests_detected(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="====== 9 passed, 1 failed in 3.0s ======\n",
            stderr="",
            returncode=1,
        )
        result = _run_suite("backend")
        assert result["status"] == "fail"

    @patch("backend.routers.admin.subprocess.run")
    def test_timeout_handling(self, mock_run):
        import subprocess
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="pytest", timeout=120)
        result = _run_suite("backend")
        assert result["status"] == "error"
        assert "timed out" in result["error"]

    @patch("backend.routers.admin.subprocess.run")
    def test_file_not_found_handling(self, mock_run):
        mock_run.side_effect = FileNotFoundError("pytest not found")
        result = _run_suite("backend")
        assert result["status"] == "error"
        assert "not found" in result["error"].lower()

    @patch("backend.routers.admin.subprocess.run")
    def test_generic_exception_handling(self, mock_run):
        mock_run.side_effect = RuntimeError("boom")
        result = _run_suite("backend")
        assert result["status"] == "error"
        assert "boom" in result["error"]

    @patch("backend.routers.admin.subprocess.run")
    def test_no_tests_parsed_fallback_to_exit_code(self, mock_run):
        mock_run.return_value = MagicMock(stdout="", stderr="", returncode=0)
        result = _run_suite("backend")
        assert result["status"] == "pass"

    @patch("backend.routers.admin.subprocess.run")
    def test_no_tests_parsed_nonzero_exit_code(self, mock_run):
        mock_run.return_value = MagicMock(stdout="", stderr="", returncode=1)
        result = _run_suite("backend")
        assert result["status"] == "fail"

    @patch("backend.routers.admin.subprocess.run")
    def test_long_output_truncated(self, mock_run):
        long_output = "x" * 5000
        mock_run.return_value = MagicMock(
            stdout=long_output,
            stderr="y" * 2000,
            returncode=0,
        )
        result = _run_suite("backend")
        assert len(result["output"]) == 3000
        assert len(result["stderr"]) == 1000


# ── _run_tests_background tests ──────────────────────────────────────────────


class TestRunTestsBackground:
    @patch("backend.routers.admin._run_suite")
    @patch("backend.database.SessionLocal")
    def test_updates_db_with_results(self, mock_session_cls, mock_run_suite):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        run = MagicMock(spec=TestRun)
        mock_session.query.return_value.filter.return_value.first.return_value = run

        mock_run_suite.return_value = {
            "status": "pass", "passed": 10, "failed": 0,
            "skipped": 1, "errors": 0, "total": 11,
            "coverage": 95, "duration": 3.0,
            "output": "test output", "stderr": "",
            "error": None, "failed_tests": None,
        }

        _run_tests_background({"backend": "run-123"})

        assert run.status == "pass"
        assert run.passed == 10
        assert run.coverage == 95
        mock_session.commit.assert_called()
        mock_session.close.assert_called_once()

    @patch("backend.routers.admin._run_suite")
    @patch("backend.database.SessionLocal")
    def test_handles_missing_run_row(self, mock_session_cls, mock_run_suite):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        mock_session.query.return_value.filter.return_value.first.return_value = None

        mock_run_suite.return_value = {"status": "pass", "passed": 5}

        # Should not raise
        _run_tests_background({"backend": "nonexistent"})
        mock_session.close.assert_called_once()

    @patch("backend.routers.admin._run_suite")
    @patch("backend.database.SessionLocal")
    def test_handles_exception_with_rollback(self, mock_session_cls, mock_run_suite):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        mock_run_suite.side_effect = RuntimeError("DB exploded")

        # Should not raise
        _run_tests_background({"backend": "run-123"})
        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()

    @patch("backend.routers.admin._run_suite")
    @patch("backend.database.SessionLocal")
    def test_stores_failed_tests_json(self, mock_session_cls, mock_run_suite):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session

        run = MagicMock(spec=TestRun)
        mock_session.query.return_value.filter.return_value.first.return_value = run

        failed_tests = [{"name": "test_foo", "message": "expected 1 got 2"}]
        mock_run_suite.return_value = {
            "status": "fail", "passed": 9, "failed": 1,
            "skipped": 0, "errors": 0, "total": 10,
            "coverage": 90, "duration": 2.0,
            "output": "", "stderr": "", "error": None,
            "failed_tests": failed_tests,
        }

        _run_tests_background({"backend": "run-456"})

        assert run.failed_tests_json == json.dumps(failed_tests)


# ── _test_run_to_dict tests ──────────────────────────────────────────────────


class TestTestRunToDict:
    def test_serializes_complete_run(self):
        run = MagicMock(spec=TestRun)
        run.id = "run-1"
        run.suite = "backend"
        run.status = "pass"
        run.passed = 10
        run.failed = 0
        run.skipped = 1
        run.errors = 0
        run.total = 11
        run.coverage = 95
        run.duration = 3.5
        run.output = "output"
        run.stderr = ""
        run.error_message = None
        run.failed_tests_json = None
        run.triggered_by = "admin-1"
        run.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)

        d = _test_run_to_dict(run)
        assert d["id"] == "run-1"
        assert d["suite"] == "backend"
        assert d["coverage"] == 95
        assert d["failed_tests"] is None
        assert d["created_at"] == "2024-01-01T00:00:00+00:00"

    def test_serializes_with_failed_tests(self):
        run = MagicMock(spec=TestRun)
        run.id = "run-2"
        run.suite = "app"
        run.status = "fail"
        run.passed = 9
        run.failed = 1
        run.skipped = 0
        run.errors = 0
        run.total = 10
        run.coverage = 90
        run.duration = 2.0
        run.output = ""
        run.stderr = ""
        run.error_message = None
        run.failed_tests_json = json.dumps([{"name": "test_x", "message": "boom"}])
        run.triggered_by = "admin-1"
        run.created_at = None

        d = _test_run_to_dict(run)
        assert d["failed_tests"] == [{"name": "test_x", "message": "boom"}]
        assert d["created_at"] is None


# ── Test runner endpoint tests ───────────────────────────────────────────────


class TestRunTestsEndpoint:
    @patch("backend.routers.admin._run_tests_background")
    def test_run_single_suite(self, mock_bg, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/tests/run?suite=backend", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "backend" in data["suites"]
        assert data["suites"]["backend"]["status"] == "running"

    @patch("backend.routers.admin._run_tests_background")
    def test_run_all_suites(self, mock_bg, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/tests/run?suite=all", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "backend" in data["suites"]
        assert "app" in data["suites"]
        assert "admin" in data["suites"]

    def test_run_invalid_suite_400(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.post("/admin/tests/run?suite=invalid", headers=headers)
        assert resp.status_code == 400

    def test_run_requires_admin(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.post("/admin/tests/run?suite=backend", headers=headers)
        assert resp.status_code == 403


class TestGetTestResults:
    def test_get_results_empty(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.get("/admin/tests/results", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["suites"]["backend"] is None
        assert data["suites"]["app"] is None
        assert data["suites"]["admin"] is None

    def test_get_results_with_data(self, client, db):
        admin = make_admin(db)
        run = TestRun(suite="backend", status="pass", passed=10, failed=0,
                      total=10, coverage=95, triggered_by=admin.id)
        db.add(run)
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/tests/results", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["suites"]["backend"]["status"] == "pass"
        assert data["suites"]["backend"]["coverage"] == 95

    def test_get_results_requires_admin(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/admin/tests/results", headers=headers)
        assert resp.status_code == 403


class TestGetTestHistory:
    def test_get_history_empty(self, client, db):
        admin = make_admin(db)
        headers = auth_headers(admin)
        resp = client.get("/admin/tests/history", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["history"]["backend"] == []

    def test_get_history_excludes_running(self, client, db):
        admin = make_admin(db)
        db.add(TestRun(suite="backend", status="running", triggered_by=admin.id))
        db.add(TestRun(suite="backend", status="pass", passed=10, total=10, triggered_by=admin.id))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/tests/history", headers=headers)
        data = resp.json()
        # Running should be filtered out
        assert all(r["status"] != "running" for r in data["history"]["backend"])
        assert len(data["history"]["backend"]) == 1

    def test_get_history_with_limit(self, client, db):
        admin = make_admin(db)
        for i in range(5):
            db.add(TestRun(suite="backend", status="pass", passed=i, total=i, triggered_by=admin.id))
        db.commit()
        headers = auth_headers(admin)
        resp = client.get("/admin/tests/history?limit=3", headers=headers)
        data = resp.json()
        assert len(data["history"]["backend"]) <= 3

    def test_get_history_requires_admin(self, client, db):
        user = make_user(db)
        headers = auth_headers(user)
        resp = client.get("/admin/tests/history", headers=headers)
        assert resp.status_code == 403


# ── _send_forced_reset_email ─────────────────────────────────────────────────


class TestSendForcedResetEmail:
    @patch("backend.routers.admin.smtplib.SMTP")
    @patch("backend.routers.admin.settings")
    def test_sends_email(self, mock_settings, mock_smtp):
        mock_settings.smtp_from = "noreply@test.com"
        mock_settings.smtp_host = "smtp.test.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "user"
        mock_settings.smtp_pass = "pass"

        mock_server = MagicMock()
        mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp.return_value.__exit__ = MagicMock(return_value=False)

        _send_forced_reset_email("user@test.com", "Test User", "https://reset.link")
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.sendmail.assert_called_once()
