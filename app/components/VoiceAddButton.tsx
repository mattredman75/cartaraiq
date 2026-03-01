import React, { useRef, useState, useCallback } from "react";
import {
  TouchableOpacity,
  Text,
  Animated,
  View,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

const TEAL = "#1B6B7A";
const RED = "#EF4444";

interface VoiceAddButtonProps {
  onPress: () => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
}

export function VoiceAddButton({ onPress, onInterimTranscript, onFinalTranscript }: VoiceAddButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  const morphAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Controls whether "end" should restart recognition or reset to "+"
  const shouldRestartRef = useRef(false);
  // Accumulates the current utterance transcript
  const pendingTranscriptRef = useRef("");
  // Silence detection: stop() after this many ms of no new transcript
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_MS = 800;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const startRecognition = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    });
  }, []);

  const resetToPlus = useCallback(() => {
    setIsListening(false);
    pulseLoopRef.current?.stop();
    Animated.parallel([
      Animated.timing(morphAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [morphAnim, pulseAnim]);

  const morphToMic = useCallback(() => {
    setIsListening(true);
    Animated.timing(morphAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current.start();
  }, [morphAnim, pulseAnim]);

  // ── Speech events ──────────────────────────────────────────────────────────

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript;
    if (!transcript) return;
    pendingTranscriptRef.current = transcript;
    onInterimTranscript(transcript);

    // Client-side silence detection: stop after SILENCE_MS of no new words
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (shouldRestartRef.current) {
        ExpoSpeechRecognitionModule.stop();
      }
    }, SILENCE_MS);
  });

  useSpeechRecognitionEvent("end", () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const transcript = pendingTranscriptRef.current;
    if (transcript) {
      onFinalTranscriptRef.current(transcript);
      pendingTranscriptRef.current = "";
      onInterimTranscript("");
    }

    if (shouldRestartRef.current) {
      setTimeout(startRecognition, 150);
    } else {
      resetToPlus();
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (event.error === "aborted") {
      // User-initiated cancel — discard pending, let "end" call resetToPlus
      pendingTranscriptRef.current = "";
      return;
    }
    if (event.error === "no-speech") {
      // iOS timeout with no speech — restart silently, let "end" handle it
      pendingTranscriptRef.current = "";
      return;
    }
    // Real error: stop restarting, let "end" call resetToPlus
    shouldRestartRef.current = false;
    pendingTranscriptRef.current = "";
    Alert.alert("Voice Error", "Speech recognition failed. Please try again.");
  });

  // ── Gesture handlers ───────────────────────────────────────────────────────

  const handleLongPress = useCallback(async () => {
    if (isListening) return;
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Microphone Access Required",
        "Enable microphone access in Settings to add items by voice."
      );
      return;
    }
    shouldRestartRef.current = true;
    morphToMic();
    startRecognition();
  }, [isListening, morphToMic, startRecognition]);

  const handlePress = useCallback(() => {
    if (isListening) {
      shouldRestartRef.current = false;
      ExpoSpeechRecognitionModule.abort();
    } else {
      onPress();
    }
  }, [isListening, onPress]);

  // ── Animated styles ────────────────────────────────────────────────────────

  const bgColor = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [TEAL, RED],
  });

  const plusStyle = {
    opacity: morphAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { scale: morphAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
    ],
  };

  const micStyle = {
    position: "absolute" as const,
    opacity: morphAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    transform: [
      { scale: morphAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
    ],
  };

  const pulseRingStyle = {
    opacity: morphAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
    transform: [{ scale: pulseAnim }],
  };

  return (
    <View style={styles.wrapper}>
      <Animated.View
        pointerEvents="none"
        style={[styles.pulseRing, pulseRingStyle, { backgroundColor: RED }]}
      />
      <Animated.View style={[styles.button, { backgroundColor: bgColor }]}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={350}
          style={styles.touchable}
          activeOpacity={0.8}
        >
          <Animated.Text style={[styles.plusText, plusStyle]}>+</Animated.Text>
          <Animated.View style={micStyle}>
            <Ionicons name="mic" size={20} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  button: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
  },
  touchable: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
  },
  plusText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },
});
