import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { COLORS } from "../lib/constants";

interface PINEntryProps {
  onComplete: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  maxLength?: number;
}

export function PINEntry({
  onComplete,
  onCancel,
  title = "Enter PIN",
  subtitle = "Enter your 4-digit PIN",
  maxLength = 4,
}: PINEntryProps) {
  const [pin, setPin] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus the hidden input when the component mounts
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (text: string) => {
    // Allow only digits
    const digits = text.replace(/[^0-9]/g, "").slice(0, maxLength);
    setPin(digits);
    if (digits.length === maxLength) {
      setTimeout(() => onComplete(digits), 100);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {/* Hidden native input */}
        <TextInput
          ref={inputRef}
          value={pin}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={maxLength}
          secureTextEntry
          caretHidden
          style={styles.hiddenInput}
          autoFocus
        />

        {/* PIN dot display */}
        <View style={styles.pinDisplay}>
          {Array.from({ length: maxLength }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.pinDot,
                {
                  backgroundColor: i < pin.length ? COLORS.teal : COLORS.surface,
                  borderColor: i < pin.length ? COLORS.teal : COLORS.border,
                },
              ]}
            />
          ))}
        </View>

        <Text style={styles.tapHint}>Tap to open keyboard</Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 60,
  },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: COLORS.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: COLORS.muted,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  tapHint: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 24,
  },
});
