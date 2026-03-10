import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import type { ListItem } from "../lib/types";

const TEAL = "#1B6B7A";

const PLURAL: Record<string, string> = {
  loaf: "loaves",
  roll: "rolls",
  slice: "slices",
  sheet: "sheets",
  bar: "bars",
  jar: "jars",
  tub: "tubs",
  punnet: "punnets",
  sachet: "sachets",
  piece: "pieces",
  pack: "packs",
  packet: "packets",
  bottle: "bottles",
  can: "cans",
  bag: "bags",
  box: "boxes",
  bunch: "bunches",
  cup: "cups",
};
const pluralUnit = (unit: string, qty: number) =>
  qty > 1 ? (PLURAL[unit] ?? unit + "s") : unit;
const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

export const DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = 55;

// ── Scroll/drag context shared between ListScreen (provider) and ItemRow (consumer) ──

export interface ScrollInfo {
  dragDirection: "up" | "down";
  setDragDirection: (dir: "up" | "down") => void;
}

export const ScrollInfoContext = React.createContext<ScrollInfo>({
  dragDirection: "down",
  setDragDirection: () => {},
});

// ── ItemRow ───────────────────────────────────────────────────────────────────

function ItemRowInner({
  item,
  onToggle,
  onDelete,
  onLongPress,
  drag,
  isActive,
}: {
  item: ListItem;
  onToggle: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  drag?: () => void;
  isActive?: boolean;
}) {
  const { dragDirection, setDragDirection } =
    React.useContext(ScrollInfoContext);

  const rotateShared = useSharedValue(0);
  const rowRef = useRef<any>(null);
  const prevActiveYRef = useRef<number | null>(null);
  const prevDirRef = useRef<"up" | "down">("down");

  // Tilt while dragging — direction-aware, critically damped to avoid oscillation
  useEffect(() => {
    const targetDeg = isActive ? (dragDirection === "down" ? 3 : -3) : 0;
    rotateShared.value = withSpring(targetDeg, {
      damping: 32,
      stiffness: 280,
      mass: 0.8,
    });
  }, [isActive, dragDirection]);

  // Poll screen Y while dragging to detect movement direction (threshold >4px filters jitter)
  useEffect(() => {
    if (!isActive) {
      prevActiveYRef.current = null;
      return;
    }
    const interval = setInterval(() => {
      rowRef.current?.measureInWindow((_x: number, y: number) => {
        if (prevActiveYRef.current !== null) {
          const delta = y - prevActiveYRef.current;
          if (Math.abs(delta) > 4) {
            const newDir = delta > 0 ? "down" : "up";
            if (newDir !== prevDirRef.current) {
              setDragDirection(newDir);
              prevDirRef.current = newDir;
            }
          }
        }
        prevActiveYRef.current = y;
      });
    }, 32); // ~30 fps
    return () => clearInterval(interval);
  }, [isActive]);

  const itemAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateShared.value}deg` }],
  }));

  // Swipe-to-delete gesture
  const translateXShared = useSharedValue(0);
  const isOpenedShared = useSharedValue(false);

  const swipeGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const base = isOpenedShared.value ? -DELETE_WIDTH : 0;
          translateXShared.value = Math.min(
            0,
            Math.max(base + e.translationX, -DELETE_WIDTH - 8),
          );
        })
        .onEnd((e) => {
          const base = isOpenedShared.value ? -DELETE_WIDTH : 0;
          const finalX = base + e.translationX;
          if (finalX <= -SWIPE_THRESHOLD) {
            isOpenedShared.value = true;
            translateXShared.value = withSpring(-DELETE_WIDTH, {
              damping: 20,
              stiffness: 300,
            });
          } else {
            isOpenedShared.value = false;
            translateXShared.value = withSpring(0, {
              damping: 20,
              stiffness: 300,
            });
          }
        }),
    [],
  );

  const swipeableAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateXShared.value }],
  }));

  const confirmDelete = () => {
    isOpenedShared.value = false;
    translateXShared.value = withTiming(-500, { duration: 180 }, (finished) => {
      if (finished) runOnJS(onDelete)();
    });
  };

  return (
    <Reanimated.View
      ref={rowRef}
      style={[
        itemAnimStyle,
        {
          borderRadius: 14,
          shadowColor: "#000",
          shadowOffset: isActive
            ? { width: 0, height: 10 }
            : { width: 0, height: 1 },
          shadowOpacity: isActive ? 0.22 : 0.06,
          shadowRadius: isActive ? 18 : 6,
          elevation: isActive ? 14 : 2,
          marginBottom: 8,
          marginHorizontal: 20,
          zIndex: isActive ? 999 : 0,
        },
      ]}
    >
      <View
        style={{
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#C5D5D9",
        }}
      >
        {/* Red delete zone */}
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: DELETE_WIDTH,
            backgroundColor: "#EF4444",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              backgroundColor: "rgba(0,0,0,0.24)",
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 3,
              top: 0,
              bottom: 0,
              width: 5,
              backgroundColor: "rgba(0,0,0,0.10)",
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 8,
              top: 0,
              bottom: 0,
              width: 8,
              backgroundColor: "rgba(0,0,0,0.04)",
            }}
          />
          <TouchableOpacity
            onPress={confirmDelete}
            style={{
              flex: 1,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>

        {/* Swipeable row content */}
        <GestureDetector gesture={swipeGesture}>
          <Reanimated.View
            style={[
              swipeableAnimStyle,
              {
                backgroundColor: isActive ? "#F0F8FA" : CARD,
                paddingVertical: 14,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              },
            ]}
          >
            {/* Left zone: checkbox + name */}
            <TouchableOpacity
              onPress={onToggle}
              onLongPress={onLongPress}
              delayLongPress={400}
              activeOpacity={0.7}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: 2,
                  borderColor: item.checked === 1 ? TEAL : BORDER,
                  backgroundColor: item.checked === 1 ? TEAL : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.checked === 1 && (
                  <Text
                    style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}
                  >
                    ✓
                  </Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: item.checked === 1 ? MUTED : TEXT,
                    textDecorationLine:
                      item.checked === 1 ? "line-through" : "none",
                    flexShrink: 1,
                  }}
                >
                  {item.quantity > 1
                    ? `${item.quantity}${item.unit ? ` ${pluralUnit(item.unit, item.quantity)}` : ""} ${item.name}`
                    : item.name}
                </Text>
                {(item.quantity > 1 || !!item.unit) && (
                  <Text
                    style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}
                  >
                    {[item.quantity > 1 ? String(item.quantity) : null, item.unit || null]
                      .filter(Boolean)
                      .join(" ")}
                  </Text>
                )}
                {false && item.times_added > 3 && (
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Added {item.times_added}× before
                  </Text>
                )}
                {item.added_by_name && (
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Added by {item.added_by_name}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Drag handle — only for unchecked items */}
            {drag && (
              <TouchableOpacity
                onLongPress={drag}
                delayLongPress={100}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                style={{ paddingLeft: 4 }}
              >
                <View style={{ gap: 3 }}>
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      backgroundColor: BORDER,
                      borderRadius: 1,
                    }}
                  />
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      backgroundColor: BORDER,
                      borderRadius: 1,
                    }}
                  />
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      backgroundColor: BORDER,
                      borderRadius: 1,
                    }}
                  />
                </View>
              </TouchableOpacity>
            )}
          </Reanimated.View>
        </GestureDetector>
      </View>
    </Reanimated.View>
  );
}

export const ItemRow = React.memo(ItemRowInner, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.name === next.item.name &&
  prev.item.quantity === next.item.quantity &&
  prev.item.unit === next.item.unit &&
  prev.item.checked === next.item.checked &&
  prev.item.sort_order === next.item.sort_order &&
  prev.isActive === next.isActive
);
