import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from "react-native";

const TEAL = "#1B6B7A";
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

interface SuggestionItem {
  name: string;
  reason: string;
  _type: string;
}

interface SuggestionsStripProps {
  allSuggestions: SuggestionItem[];
  onAdd: (name: string, type: string) => void;
  onDismiss: (name: string) => void;
  onRefresh?: () => void; // optional callback to re‑fetch suggestions
  /**
   * Emoji or character to use for the refresh button. Defaults to a circular arrow.
   * A few possibilities you can choose from: 🔄, 🔁, ↻, ↺, ♻️, 🔃
   */
  refreshIcon?: string;
  /**
   * When true, the refresh icon will spin until this prop becomes false.
   */
  isRefreshing?: boolean;
}

export function SuggestionsStrip({
  allSuggestions,
  onAdd,
  onDismiss,
  onRefresh,
  refreshIcon = "↻",
  isRefreshing = false,
}: SuggestionsStripProps) {
  // animated rotation value for refresh icon
  const rotation = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRefreshing) {
      // create and start a looping animation if not already running
      if (!spinAnim.current) {
        spinAnim.current = Animated.loop(
          Animated.timing(rotation, {
            toValue: 1,
            duration: 800,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        spinAnim.current.start();
      }
    } else {
      // stop existing animation and reset
      if (spinAnim.current) {
        spinAnim.current.stop();
        spinAnim.current = null;
      }
      rotation.setValue(0);
    }
  }, [isRefreshing, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (allSuggestions.length === 0) return null;

  return (
    <View style={{ marginTop: 20 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#00C2CB",
            }}
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: MUTED,
              letterSpacing: 0.8,
            }}
          >
            SMART SUGGESTIONS
          </Text>
        </View>
        {onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            style={{ padding: 4 }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Animated.Text
              style={{
                fontSize: 16,
                color: MUTED,
                transform: [{ rotate: spin }],
              }}
            >
              {refreshIcon}
            </Animated.Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 8,
          gap: 10,
        }}
      >
        {allSuggestions.map((s, i) => (
          <View
            key={i}
            style={{
              backgroundColor: s._type === "recipe" ? "#E6F4F6" : CARD,
              borderRadius: 4,
              padding: 14,
              width: 148,
              height: 140,
              borderWidth: 1,
              borderColor: s._type === "recipe" ? "#B8D9DF" : BORDER,
              justifyContent: "space-between",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.16,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <TouchableOpacity
              onPress={() => onDismiss(s.name)}
              hitSlop={{ top: 8, right: 8, bottom: 4, left: 4 }}
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: MUTED,
                  fontWeight: "700",
                }}
              >
                ✕
              </Text>
            </TouchableOpacity>
            <View>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: TEXT,
                  marginBottom: 4,
                  paddingRight: 16,
                }}
              >
                {s.name}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: MUTED,
                  lineHeight: 15,
                }}
                numberOfLines={2}
              >
                {s.reason}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onAdd(s.name, s._type)}
              style={{
                backgroundColor: TEAL,
                borderRadius: 8,
                paddingVertical: 6,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                + Add
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
