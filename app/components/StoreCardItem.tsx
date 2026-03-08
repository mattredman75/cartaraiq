import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { StoreCard } from "../lib/types";
import { useLoyaltyPrograms } from "../hooks/useLoyaltyPrograms";

interface StoreCardItemProps {
  card: StoreCard;
  onPress: () => void;
  onLongPress: () => void;
  cardWidth?: number;
  cardHeight?: number;
}

export function StoreCardItem({ card, onPress, onLongPress, cardWidth = 280, cardHeight = 160 }: StoreCardItemProps) {
  const { programs } = useLoyaltyPrograms();

  const program = card.programId
    ? programs.find((p) => p.id === card.programId || p.slug === card.programId) ?? null
    : null;

  // Branded card — program has a logo, use brand background and fill with logo
  if (program?.logo_url) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        activeOpacity={0.8}
      >
        <View
          style={{
            width: cardWidth,
            height: cardHeight,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: program.logo_background || "transparent",
          }}
        >
          <Image
            source={{ uri: program.logo_url }}
            style={{ width: cardWidth, height: cardHeight }}
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <View
        style={{
          width: cardWidth,
          height: cardHeight,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={[card.color, card.color + "CC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            flex: 1,
            justifyContent: "space-between",
            padding: 20,
          }}
        >
          {/* Swoosh Effect */}
          <View
            style={{
              position: "absolute",
              width: "150%",
              height: "200%",
              borderRadius: 9999,
              backgroundColor: "rgba(255,255,255,0.15)",
              top: -cardHeight * 0.3,
              right: -cardWidth * 0.15,
              transform: [{ rotate: "-45deg" }],
            }}
          />

          {/* Content */}
          <View style={{ zIndex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                fontWeight: "600",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Loyalty Card
            </Text>
          </View>

          <View style={{ zIndex: 1 }}>
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#fff",
                marginBottom: 4,
              }}
            >
              {card.name}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.8)",
                fontWeight: "500",
              }}
            >
               Tap to scan
            </Text>
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}
