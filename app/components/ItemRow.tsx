import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
} from "react-native";
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

const CARD = "#FFFFFF";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

export const DELETE_WIDTH = 80; // peek/snap width
const SWIPE_THRESHOLD = 55;
const SCREEN_W = Dimensions.get("window").width;
const FULL_SWIPE_THRESHOLD = SCREEN_W * 0.55;

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

interface ItemRowProps {
  item: ListItem;
  onToggle: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  drag?: () => void;
  isActive?: boolean;
  inGroup?: boolean;
  squareTopCorners?: boolean;
  isHoverTarget?: boolean;
  disableSwipe?: boolean;
}

function ItemRowInner({
  item,
  onToggle,
  onDelete,
  onLongPress,
  drag,
  isActive,
  inGroup = false,
  squareTopCorners = false,
  isHoverTarget = false,
  disableSwipe = false,
}: ItemRowProps) {
  const { dragDirection, setDragDirection } =
    React.useContext(ScrollInfoContext);

  // Hover target pulse animation
  const hoverPulse = useRef(new Animated.Value(0)).current;
  const hoverLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (isHoverTarget) {
      hoverLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(hoverPulse, {
            toValue: 1,
            duration: 350,
            useNativeDriver: false,
          }),
          Animated.timing(hoverPulse, {
            toValue: 0.25,
            duration: 350,
            useNativeDriver: false,
          }),
        ]),
      );
      hoverLoopRef.current.start();
    } else {
      hoverLoopRef.current?.stop();
      Animated.timing(hoverPulse, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [isHoverTarget]);

  const hoverBorderColor = hoverPulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", "#4FB8C8"],
  });

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
        .enabled(!disableSwipe)
        .activeOffsetX([-8, 8])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const base = isOpenedShared.value ? -DELETE_WIDTH : 0;
          translateXShared.value = Math.min(
            0,
            Math.max(base + e.translationX, -SCREEN_W),
          );
        })
        .onEnd((e) => {
          const base = isOpenedShared.value ? -DELETE_WIDTH : 0;
          const finalX = base + e.translationX;
          const isFastFling = e.velocityX < -900;
          if (isFastFling || finalX <= -FULL_SWIPE_THRESHOLD) {
            // Full swipe — animate off screen then delete
            translateXShared.value = withTiming(
              -SCREEN_W,
              { duration: 200 },
              (done) => {
                if (done) runOnJS(onDelete)();
              },
            );
            isOpenedShared.value = false;
          } else if (finalX <= -SWIPE_THRESHOLD) {
            // Partial — snap to peek state
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
    [onDelete, disableSwipe],
  );

  const swipeableAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(0, translateXShared.value) }],
  }));

  const confirmDelete = () => {
    isOpenedShared.value = false;
    translateXShared.value = withTiming(
      -SCREEN_W,
      { duration: 200 },
      (finished) => {
        if (finished) runOnJS(onDelete)();
      },
    );
  };

  return (
    <Reanimated.View
      ref={rowRef}
      style={[
        itemAnimStyle,
        {
          borderTopLeftRadius: squareTopCorners ? 0 : 4,
          borderTopRightRadius: squareTopCorners ? 0 : 4,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
          shadowColor: "#000",
          shadowOffset: isActive
            ? { width: 0, height: 8 }
            : { width: 0, height: 3 },
          shadowOpacity: isActive ? 0.22 : 0.16,
          shadowRadius: isActive ? 12 : 4,
          elevation: isActive ? 10 : 4,
          marginBottom: 6,
          marginHorizontal: 20,
          zIndex: isActive ? 999 : 0,
        },
      ]}
    >
      {/* Pulse ring overlay for hover-to-group */}
      {isHoverTarget && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderTopLeftRadius: squareTopCorners ? 0 : 4,
            borderTopRightRadius: squareTopCorners ? 0 : 4,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            borderWidth: 2.5,
            borderColor: hoverBorderColor,
            zIndex: 10,
          }}
        />
      )}

      <View
        style={
          inGroup
            ? {
                marginLeft: 14,
              }
            : undefined
        }
      >
        <View
          style={{
            borderTopLeftRadius: squareTopCorners ? 0 : 4,
            borderTopRightRadius: squareTopCorners ? 0 : 4,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "#C5D5D9",
          }}
        >
          {/* Red delete zone — full width, label pinned to right */}
          <TouchableOpacity
            onPress={confirmDelete}
            activeOpacity={1}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "#EF4444",
              alignItems: "flex-end",
              justifyContent: "center",
              paddingRight: 14,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Delete
            </Text>
          </TouchableOpacity>

          {/* Swipeable row content */}
          <GestureDetector gesture={swipeGesture}>
            <Reanimated.View
              style={[
                swipeableAnimStyle,
                {
                  backgroundColor: isActive ? "#F0F8FA" : CARD,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                },
              ]}
            >
              {/* Left zone: checkbox + name */}
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* Checkbox dot — only this toggles checked state */}
                <TouchableOpacity
                  onPress={onToggle}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: 2,
                      borderColor: item.checked === 1 ? TEAL : BORDER,
                      backgroundColor:
                        item.checked === 1 ? TEAL : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.checked === 1 && (
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Name area — long press to group */}
                <TouchableOpacity
                  onLongPress={onLongPress}
                  delayLongPress={400}
                  activeOpacity={1}
                  style={{ flex: 1 }}
                >
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
                      {item.unit
                        ? item.name
                        : item.quantity > 1
                          ? `${item.quantity} ${item.name}`
                          : item.name}
                    </Text>
                    {!!item.unit && (
                      <Text
                        style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}
                      >
                        {`${Math.max(1, item.quantity)} ${item.unit}`}
                      </Text>
                    )}
                    {false && item.times_added > 3 && (
                      <Text
                        style={{ fontSize: 11, color: MUTED, marginTop: 1 }}
                      >
                        Added {item.times_added}× before
                      </Text>
                    )}
                    {item.added_by_name && (
                      <Text
                        style={{ fontSize: 11, color: MUTED, marginTop: 1 }}
                      >
                        Added by {item.added_by_name}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              </View>

              {/* Drag handle — only for unchecked items */}
              {drag && (
                <TouchableOpacity
                  onPressIn={drag}
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
      </View>
    </Reanimated.View>
  );
}

export const ItemRow = React.memo(
  ItemRowInner,
  (prev: Readonly<ItemRowProps>, next: Readonly<ItemRowProps>) =>
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.quantity === next.item.quantity &&
    prev.item.unit === next.item.unit &&
    prev.item.checked === next.item.checked &&
    prev.item.group_id === next.item.group_id &&
    prev.item.sort_order === next.item.sort_order &&
    prev.inGroup === next.inGroup &&
    prev.squareTopCorners === next.squareTopCorners &&
    Boolean(prev.drag) === Boolean(next.drag) &&
    prev.isActive === next.isActive &&
    prev.isHoverTarget === next.isHoverTarget,
);
