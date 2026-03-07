/**
 * Tests for MaintenanceScreen component — covers loading branch
 */
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";

import { MaintenanceScreen } from "../../components/MaintenanceScreen";

describe("MaintenanceScreen", () => {
  it("renders Maintenance Mode title", () => {
    const { getByText } = render(<MaintenanceScreen onRefresh={jest.fn()} />);
    expect(getByText("Maintenance Mode")).toBeTruthy();
  });

  it("renders default message when none provided", () => {
    const { getByText } = render(<MaintenanceScreen onRefresh={jest.fn()} />);
    expect(getByText(/scheduled maintenance/)).toBeTruthy();
  });

  it("renders custom message", () => {
    const { getByText } = render(
      <MaintenanceScreen message="Custom msg" onRefresh={jest.fn()} />,
    );
    expect(getByText("Custom msg")).toBeTruthy();
  });

  it("shows Refresh button initially (not loading)", () => {
    const { getByText, queryByText } = render(
      <MaintenanceScreen onRefresh={jest.fn()} />,
    );
    expect(getByText("Refresh")).toBeTruthy();
    expect(queryByText("Checking...")).toBeNull();
  });

  it("shows Checking... and ActivityIndicator while refreshing", async () => {
    let resolveRefresh: () => void;
    const onRefresh = jest.fn(
      () =>
        new Promise<void>((r) => {
          resolveRefresh = r;
        }),
    );
    const { getByText, queryByText } = render(
      <MaintenanceScreen onRefresh={onRefresh} />,
    );
    // Start refresh
    await act(async () => {
      fireEvent.press(getByText("Refresh"));
    });
    // Now loading should be true
    expect(getByText("Checking...")).toBeTruthy();
    expect(queryByText("Refresh")).toBeNull();
    // Complete refresh
    await act(async () => {
      resolveRefresh!();
    });
    // Back to not loading
    expect(getByText("Refresh")).toBeTruthy();
  });

  it("resets loading state via finally block", async () => {
    // Test the finally block path — onRefresh resolves but we verify
    // loading resets (covers the setLoading(false) in finally)
    let resolveRefresh: () => void;
    const onRefresh = jest.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveRefresh = r;
        }),
    );
    const { getByText, queryByText } = render(
      <MaintenanceScreen onRefresh={onRefresh} />,
    );
    // Press refresh — starts loading
    await act(async () => {
      fireEvent.press(getByText("Refresh"));
    });
    expect(queryByText("Refresh")).toBeNull();
    expect(getByText("Checking...")).toBeTruthy();
    // Resolve — goes through finally
    await act(async () => {
      resolveRefresh!();
    });
    expect(getByText("Refresh")).toBeTruthy();
  });
});
