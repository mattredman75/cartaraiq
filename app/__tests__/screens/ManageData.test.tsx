/**
 * Tests for ManageDataScreen — export, import, error handling
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert, Share } from "react-native";

jest.spyOn(Alert, "alert");
jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}));

const mockExportMyData = jest.fn();
const mockImportMyData = jest.fn();
jest.mock("../../lib/api", () => ({
  exportMyData: (...args: any[]) => mockExportMyData(...args),
  importMyData: (...args: any[]) => mockImportMyData(...args),
}));

const mockWriteAsStringAsync = jest.fn().mockResolvedValue(undefined);
const mockReadAsStringAsync = jest.fn().mockResolvedValue("{}");
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "/cache/",
  writeAsStringAsync: (...args: any[]) => mockWriteAsStringAsync(...args),
  readAsStringAsync: (...args: any[]) => mockReadAsStringAsync(...args),
  EncodingType: { UTF8: "utf8" },
}));

const mockGetDocumentAsync = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: any[]) => mockGetDocumentAsync(...args),
}));

import ManageDataScreen from "../../app/(app)/manage-data";

describe("ManageDataScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders Manage my data header", () => {
    const { getByText } = render(<ManageDataScreen />);
    expect(getByText(/Manage/)).toBeTruthy();
  });

  it("renders Export and Import buttons", () => {
    const { getByText } = render(<ManageDataScreen />);
    expect(getByText("Export data")).toBeTruthy();
    expect(getByText("Import data")).toBeTruthy();
  });

  it("renders description text", () => {
    const { getByText } = render(<ManageDataScreen />);
    expect(getByText(/Export your lists as JSON/)).toBeTruthy();
  });

  // ── Export flow ──────────────────────────────────────────────────
  it("exports data successfully", async () => {
    mockExportMyData.mockResolvedValueOnce({
      data: { lists: [{ name: "L1" }] },
    });
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Export data"));
    });
    expect(mockExportMyData).toHaveBeenCalled();
    expect(mockWriteAsStringAsync).toHaveBeenCalled();
    expect(Share.share).toHaveBeenCalled();
  });

  it("shows status after successful export", async () => {
    mockExportMyData.mockResolvedValueOnce({ data: { lists: [] } });
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Export data"));
    });
    expect(getByText("Export complete")).toBeTruthy();
  });

  it("shows alert on export failure", async () => {
    mockExportMyData.mockRejectedValueOnce(new Error("Network error"));
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Export data"));
    });
    expect(Alert.alert).toHaveBeenCalledWith("Export failed", "Network error");
  });

  // ── Import flow ──────────────────────────────────────────────────
  it("handles import when document picker is cancelled", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({ canceled: true });
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("handles import with no URI", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{}],
    });
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("alerts on invalid JSON file", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce("not-json{{{");
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid file",
      "The selected file is not valid JSON.",
    );
  });

  it("alerts on invalid format (no lists array)", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(JSON.stringify({ foo: "bar" }));
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid format",
      "The file doesn't contain a valid CartaraIQ data export.",
    );
  });

  it("confirms import and calls importMyData on confirm", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({ lists: [{ name: "L1" }], version: 2 }),
    );
    mockImportMyData.mockResolvedValueOnce({});
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });

    // Alert.alert is called with the confirmation dialog
    expect(Alert.alert).toHaveBeenCalledWith(
      "Import data?",
      expect.stringContaining("1 list(s)"),
      expect.any(Array),
    );

    // Simulate pressing "Import" button in the alert
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const importButton = alertCall[2].find((b: any) => b.text === "Import");
    await act(async () => {
      await importButton.onPress();
    });
    expect(mockImportMyData).toHaveBeenCalledWith({
      lists: [{ name: "L1" }],
      version: 2,
    });
  });

  it("shows status after successful import", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({ lists: [{ name: "L1" }] }),
    );
    mockImportMyData.mockResolvedValueOnce({});
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const importButton = alertCall[2].find((b: any) => b.text === "Import");
    await act(async () => {
      await importButton.onPress();
    });
    expect(getByText(/Import complete/)).toBeTruthy();
  });

  it("shows alert on import API failure", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({ lists: [{ name: "L1" }] }),
    );
    mockImportMyData.mockRejectedValueOnce({
      response: { data: { detail: "Server error" } },
    });
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const importButton = alertCall[2].find((b: any) => b.text === "Import");
    await act(async () => {
      await importButton.onPress();
    });
    // Second alert for the error
    expect(Alert.alert).toHaveBeenCalledWith("Import failed", "Server error");
  });

  it("handles document picker error", async () => {
    mockGetDocumentAsync.mockRejectedValueOnce(new Error("Permission denied"));
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    expect(Alert.alert).toHaveBeenCalledWith("Error", "Permission denied");
  });

  // ── Navigation ───────────────────────────────────────────────────
  it("navigates back on back button press", () => {
    const { UNSAFE_root } = render(<ManageDataScreen />);
    const backBtn = UNSAFE_root.findAll(
      (n: any) =>
        n.props?.style?.marginBottom === 24 &&
        n.props?.style?.flexDirection === "row" &&
        n.props?.onPress,
    );
    expect(backBtn.length).toBeGreaterThan(0);
    backBtn[0].props.onPress();
    expect(mockBack).toHaveBeenCalled();
  });

  // ── Error fallback branches ───────────────────────────────
  it("shows fallback error message when export error has no message", async () => {
    mockExportMyData.mockRejectedValueOnce({});
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Export data"));
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Export failed",
      "Something went wrong",
    );
  });

  it("shows fallback error message when import error has no detail or message", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "/file.json" }],
    });
    mockReadAsStringAsync.mockResolvedValueOnce(
      JSON.stringify({ lists: [{ name: "L1" }] }),
    );
    mockImportMyData.mockRejectedValueOnce({});
    const { getByText } = render(<ManageDataScreen />);
    await act(async () => {
      fireEvent.press(getByText("Import data"));
    });
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const importButton = alertCall[2].find((b: any) => b.text === "Import");
    await act(async () => {
      await importButton.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Import failed",
      "Something went wrong",
    );
  });
});
