import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/constants";

interface MaintenanceScreenProps {
  message?: string;
  onRefresh: () => Promise<void>;
}

export function MaintenanceScreen({
  message = "We are currently performing scheduled maintenance. Please check back soon.",
  onRefresh,
}: MaintenanceScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.surface }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        {/* Maintenance Icon */}
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: COLORS.tealLight,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Ionicons
            name="construct"
            size={40}
            color={COLORS.teal}
          />
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: COLORS.ink,
            textAlign: "center",
            marginBottom: 12,
            fontFamily: "Montserrat_700Bold",
          }}
        >
          Maintenance Mode
        </Text>

        {/* Message */}
        <Text
          style={{
            fontSize: 16,
            color: COLORS.muted,
            textAlign: "center",
            marginBottom: 40,
            lineHeight: 24,
            fontFamily: "Montserrat_400Regular",
          }}
        >
          {message}
        </Text>

        {/* Refresh Button */}
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            backgroundColor: COLORS.teal,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons
              name="refresh"
              size={18}
              color="#fff"
              style={{ marginRight: 8 }}
            />
          )}
          <Text
            style={{
              color: "#fff",
              fontSize: 16,
              fontWeight: "600",
              fontFamily: "Montserrat_600SemiBold",
            }}
          >
            {loading ? "Checking..." : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
