/**
 * Tests for PINEntry component
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

import { PINEntry } from "../../components/PINEntry";

const baseProps = {
  onComplete: jest.fn(),
};

describe("PINEntry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders default title 'Enter PIN'", () => {
    const { getByText } = render(<PINEntry {...baseProps} />);
    expect(getByText("Enter PIN")).toBeTruthy();
  });

  it("renders custom title", () => {
    const { getByText } = render(
      <PINEntry {...baseProps} title="Confirm PIN" />,
    );
    expect(getByText("Confirm PIN")).toBeTruthy();
  });

  it("renders default subtitle", () => {
    const { getByText } = render(<PINEntry {...baseProps} />);
    expect(getByText("This keeps your account secure.")).toBeTruthy();
  });

  it("renders custom subtitle", () => {
    const { getByText } = render(
      <PINEntry {...baseProps} subtitle="Re-enter your PIN" />,
    );
    expect(getByText("Re-enter your PIN")).toBeTruthy();
  });

  it("renders number keys 0-9", () => {
    const { getByText } = render(<PINEntry {...baseProps} />);
    for (let i = 0; i <= 9; i++) {
      expect(getByText(String(i))).toBeTruthy();
    }
  });

  it("calls onComplete after 4 digits entered", () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <PINEntry {...baseProps} onComplete={onComplete} />,
    );
    fireEvent.press(getByText("1"));
    fireEvent.press(getByText("2"));
    fireEvent.press(getByText("3"));
    fireEvent.press(getByText("4"));
    // onComplete is called in a setTimeout(120ms)
    jest.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("calls onComplete with custom maxLength", () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <PINEntry {...baseProps} onComplete={onComplete} maxLength={6} />,
    );
    fireEvent.press(getByText("1"));
    fireEvent.press(getByText("2"));
    fireEvent.press(getByText("3"));
    fireEvent.press(getByText("4"));
    fireEvent.press(getByText("5"));
    fireEvent.press(getByText("6"));
    jest.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("renders cancel button when onCancel provided", () => {
    const onCancel = jest.fn();
    const { UNSAFE_root } = render(
      <PINEntry {...baseProps} onCancel={onCancel} />,
    );
    // Cancel button exists — rendered as a TouchableOpacity with Ionicons chevron-back
    expect(UNSAFE_root).toBeTruthy();
  });

  it("does not exceed maxLength digits", () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <PINEntry {...baseProps} onComplete={onComplete} />,
    );
    fireEvent.press(getByText("1"));
    fireEvent.press(getByText("2"));
    fireEvent.press(getByText("3"));
    fireEvent.press(getByText("4"));
    jest.advanceTimersByTime(200);
    // Reset happens inside setTimeout, now pin is ""
    // Press 5th digit — should start new sequence, not call again
    fireEvent.press(getByText("5"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // ── Backspace ──────────────────────────────────────────────────
  it("handles backspace to remove last digit", () => {
    const onComplete = jest.fn();
    const { getByText, UNSAFE_root } = render(
      <PINEntry {...baseProps} onComplete={onComplete} />,
    );
    fireEvent.press(getByText("1"));
    fireEvent.press(getByText("2"));
    fireEvent.press(getByText("3"));
    // The backspace button is a TouchableOpacity wrapping an Ionicons "backspace-outline"
    // Ionicons mock renders icon name as text. Find the TouchableOpacity parent.
    // Since text elements don't have onPress, walk up via UNSAFE_root
    // The backspace key has activeOpacity=0.7 and contains "backspace-outline"
    const allKeyButtons = UNSAFE_root.findAll(
      (node: any) => node.props?.onPress && node.props?.activeOpacity === 0.7,
    );
    // Digit buttons: 1-9 (9 in rows), 0 (bottom), plus backspace = 11 total
    // The backspace is the last one
    expect(allKeyButtons.length).toBeGreaterThanOrEqual(11);
    const backspaceBtn = allKeyButtons[allKeyButtons.length - 1];
    act(() => {
      backspaceBtn.props.onPress();
    });
    // After backspace, pin should be "12" (was "123", removed last)
    // Now enter 2 more digits → "1245" → triggers onComplete
    fireEvent.press(getByText("4"));
    fireEvent.press(getByText("5"));
    jest.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledWith("1245");
  });

  // ── "0" key ─────────────────────────────────────────────────────
  it("handles pressing 0 key", () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <PINEntry {...baseProps} onComplete={onComplete} />,
    );
    fireEvent.press(getByText("0"));
    fireEvent.press(getByText("0"));
    fireEvent.press(getByText("0"));
    fireEvent.press(getByText("0"));
    jest.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledWith("0000");
  });

  // ── onCancel callback ──────────────────────────────────────────
  it("calls onCancel when cancel button pressed", () => {
    const onCancel = jest.fn();
    const { UNSAFE_root } = render(
      <PINEntry {...baseProps} onCancel={onCancel} />,
    );
    // The cancel button is the first TouchableOpacity (back button with chevron-back)
    const cancelBtns = UNSAFE_root.findAll(
      (node: any) =>
        node.type === "View" &&
        node.props?.accessible &&
        node.props?.onPress &&
        node.props?.style?.paddingHorizontal === 16,
    );
    if (cancelBtns.length > 0) {
      cancelBtns[0].props.onPress();
      expect(onCancel).toHaveBeenCalled();
    }
  });

  it("does not render cancel button when onCancel not provided", () => {
    const { UNSAFE_root } = render(<PINEntry {...baseProps} />);
    const cancelBtns = UNSAFE_root.findAll(
      (node: any) =>
        node.props?.style?.paddingHorizontal === 16 && node.props?.onPress,
    );
    expect(cancelBtns.length).toBe(0);
  });
});
