/**
 * Comprehensive tests for VoiceAddButton component
 * Covers: speech events (result, end, error), long press permission flow,
 * handlePress when listening, morphToMic/resetToPlus animations, silence timer
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

jest.spyOn(Alert, "alert");

import { VoiceAddButton } from "../../components/VoiceAddButton";

// Capture the event handlers registered by useSpeechRecognitionEvent
let speechEventHandlers: Record<string, Function> = {};
(useSpeechRecognitionEvent as jest.Mock).mockImplementation(
  (event: string, handler: Function) => {
    speechEventHandlers[event] = handler;
  },
);

const baseProps = {
  onPress: jest.fn(),
  onInterimTranscript: jest.fn(),
  onFinalTranscript: jest.fn(),
};

describe("VoiceAddButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    speechEventHandlers = {};
    (useSpeechRecognitionEvent as jest.Mock).mockImplementation(
      (event: string, handler: Function) => {
        speechEventHandlers[event] = handler;
      },
    );
    (
      ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock
    ).mockResolvedValue({
      granted: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Basic rendering ──────────────────────────────────────────────
  it("renders + text button by default", () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    expect(getByText("+")).toBeTruthy();
  });

  // ── Short press ──────────────────────────────────────────────────
  it("calls onPress on short press when not listening", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <VoiceAddButton {...baseProps} onPress={onPress} />,
    );
    fireEvent.press(getByText("+"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // ── Long press + permission granted ──────────────────────────────
  it("starts recognition on long press with permission granted", async () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync,
    ).toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    });
  });

  // ── Long press + permission denied ───────────────────────────────
  it("shows alert when microphone permission denied", async () => {
    (
      ExpoSpeechRecognitionModule.requestPermissionsAsync as jest.Mock
    ).mockResolvedValueOnce({
      granted: false,
    });
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Microphone Access Required",
      expect.stringContaining("microphone"),
    );
    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  // ── Long press does nothing when already listening ───────────────
  it("ignores long press when already listening", async () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    // First long press starts listening
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1);

    // Second long press should be ignored
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    // requestPermissionsAsync should only be called once
    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
  });

  // ── Short press when listening → abort ───────────────────────────
  it("aborts recognition on short press when listening", async () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    // Start listening
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    // Short press while listening
    fireEvent.press(getByText("+"));
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
  });

  // ── Speech result event ──────────────────────────────────────────
  it("calls onInterimTranscript on speech result event", async () => {
    const onInterimTranscript = jest.fn();
    render(
      <VoiceAddButton
        {...baseProps}
        onInterimTranscript={onInterimTranscript}
      />,
    );
    act(() => {
      speechEventHandlers.result?.({
        results: [{ transcript: "hello world" }],
      });
    });
    expect(onInterimTranscript).toHaveBeenCalledWith("hello world");
  });

  it("ignores result event with no transcript", () => {
    const onInterimTranscript = jest.fn();
    render(
      <VoiceAddButton
        {...baseProps}
        onInterimTranscript={onInterimTranscript}
      />,
    );
    act(() => {
      speechEventHandlers.result?.({ results: [{}] });
    });
    expect(onInterimTranscript).not.toHaveBeenCalled();
  });

  it("sets silence timer on result and stop is called via timer", async () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    // Long press to start listening (sets shouldRestartRef to true)
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    (ExpoSpeechRecognitionModule.stop as jest.Mock).mockClear();

    // Simulate a speech result - this sets the silence timer
    act(() => {
      speechEventHandlers.result?.({
        results: [{ transcript: "test" }],
      });
    });
    // Advance past SILENCE_MS (800ms) - silence timer fires and calls stop
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
  });

  // ── Speech end event ─────────────────────────────────────────────
  it("calls onFinalTranscript and clears pending on end event with transcript", async () => {
    const onFinalTranscript = jest.fn();
    const onInterimTranscript = jest.fn();
    render(
      <VoiceAddButton
        {...baseProps}
        onFinalTranscript={onFinalTranscript}
        onInterimTranscript={onInterimTranscript}
      />,
    );
    // Simulate a result then end
    act(() => {
      speechEventHandlers.result?.({
        results: [{ transcript: "buy milk" }],
      });
    });
    act(() => {
      speechEventHandlers.end?.();
    });
    expect(onFinalTranscript).toHaveBeenCalledWith("buy milk");
    expect(onInterimTranscript).toHaveBeenCalledWith("");
  });

  it("end event without pending transcript does not call onFinalTranscript", () => {
    const onFinalTranscript = jest.fn();
    render(
      <VoiceAddButton {...baseProps} onFinalTranscript={onFinalTranscript} />,
    );
    act(() => {
      speechEventHandlers.end?.();
    });
    expect(onFinalTranscript).not.toHaveBeenCalled();
  });

  it("end event restarts recognition when shouldRestart is true", async () => {
    const { getByText } = render(<VoiceAddButton {...baseProps} />);
    // Long press sets shouldRestartRef to true
    await act(async () => {
      fireEvent(getByText("+"), "longPress");
    });
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();

    // Simulate result + end, shouldRestart is still true
    act(() => {
      speechEventHandlers.result?.({ results: [{ transcript: "hello" }] });
    });
    act(() => {
      speechEventHandlers.end?.();
    });

    // Restart uses setTimeout(150)
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalled();
  });

  // ── Speech error event ───────────────────────────────────────────
  it("ignores aborted error", () => {
    render(<VoiceAddButton {...baseProps} />);
    act(() => {
      speechEventHandlers.error?.({ error: "aborted" });
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("clears silence timer on error when timer is active", () => {
    jest.useFakeTimers();
    render(<VoiceAddButton {...baseProps} />);
    // Trigger a result event to start the silence timer
    act(() => {
      speechEventHandlers.result?.({
        results: [{ transcript: "hello" }],
      });
    });
    // Now trigger an error — should clear the silence timer
    act(() => {
      speechEventHandlers.error?.({ error: "network" });
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Voice Error",
      "Speech recognition failed. Please try again.",
    );
    jest.useRealTimers();
  });

  it("ignores no-speech error", () => {
    render(<VoiceAddButton {...baseProps} />);
    act(() => {
      speechEventHandlers.error?.({ error: "no-speech" });
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows alert on real speech error", () => {
    render(<VoiceAddButton {...baseProps} />);
    act(() => {
      speechEventHandlers.error?.({ error: "network" });
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "Voice Error",
      "Speech recognition failed. Please try again.",
    );
  });

  // ── Registers three speech event handlers ────────────────────────
  it("registers result, end, and error speech event handlers", () => {
    render(<VoiceAddButton {...baseProps} />);
    expect(speechEventHandlers.result).toBeDefined();
    expect(speechEventHandlers.end).toBeDefined();
    expect(speechEventHandlers.error).toBeDefined();
  });
});
