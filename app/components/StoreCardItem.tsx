import React, { useState } from "react";
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

export function StoreCardItem({
  card,
  onPress,
  onLongPress,
  cardWidth = 280,
  cardHeight = 160,
}: StoreCardItemProps) {
  const { programs } = useLoyaltyPrograms();
  // Pre-guess based on ~18 chars/line at fontSize 22 in ~240px width; onTextLayout corrects precisely
  const [isLongName, setIsLongName] = useState(() => card.name.length > 18);

  const program = card.programId
    ? (programs.find(
        (p) => p.id === card.programId || p.slug === card.programId,
      ) ?? null)
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
            justifyContent: isLongName ? "center" : "space-between",
            padding: isLongName ? 10 : 20,
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

          {/* Header — hidden when name is long */}
          {!isLongName && (
            <View
              style={{
                zIndex: 1,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
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
          )}

          <View style={{ zIndex: 1 }}>
            <Text
              numberOfLines={3}
              ellipsizeMode="tail"
              onTextLayout={(e) => {
                const lineCount = e.nativeEvent.lines.length;
                setIsLongName(lineCount > 1);
              }}
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "#fff",
                marginBottom: isLongName ? 0 : 4,
              }}
            >
              {card.name}
            </Text>
            {/* Footer — hidden when name is long */}
            {!isLongName && (
              <Text
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.8)",
                  fontWeight: "500",
                }}
              >
                Tap to scan
              </Text>
            )}
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}
