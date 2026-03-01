import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation,
} from 'react-native-reanimated';
import type { ShoppingList } from '../lib/types';

const TEAL = '#1B6B7A';
const TEXT = '#1A1A2E';
const BORDER = '#E8EFF2';
const BG = '#F5F9FA';

const LIST_DELETE_WIDTH = 80;
const LIST_SWIPE_THRESHOLD = 55;

export function SwipeableListItem({
  list, isSelected, canDelete, onSelect, onDelete, onEdit,
}: {
  list: ShoppingList;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const translateXShared = useSharedValue(0);
  const isOpenedShared = useSharedValue(false);

  const swipeGesture = React.useMemo(() => Gesture.Pan()
    .enabled(canDelete)
    .activeOffsetX([-8, 8])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const base = isOpenedShared.value ? -LIST_DELETE_WIDTH : 0;
      translateXShared.value = Math.min(0, Math.max(base + e.translationX, -LIST_DELETE_WIDTH - 8));
    })
    .onEnd((e) => {
      const base = isOpenedShared.value ? -LIST_DELETE_WIDTH : 0;
      const finalX = base + e.translationX;
      if (finalX <= -LIST_SWIPE_THRESHOLD) {
        isOpenedShared.value = true;
        translateXShared.value = withSpring(-LIST_DELETE_WIDTH, { damping: 20, stiffness: 300 });
      } else {
        isOpenedShared.value = false;
        translateXShared.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    }), [canDelete]);

  const animStyle = useAnimatedStyle(() => {
    const rightRadius = interpolate(
      translateXShared.value,
      [-8, 0],
      [0, 12],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX: translateXShared.value }],
      borderTopRightRadius: rightRadius,
      borderBottomRightRadius: rightRadius,
    };
  });

  const confirmDelete = () => {
    onDelete();
  };

  return (
    <View style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      {canDelete && (
        <View style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: LIST_DELETE_WIDTH,
          backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(0,0,0,0.24)' }} />
          <View style={{ position: 'absolute', left: 3, top: 0, bottom: 0, width: 5, backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <TouchableOpacity
            onPress={confirmDelete}
            style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
      <GestureDetector gesture={swipeGesture}>
        <Reanimated.View style={[animStyle, {
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: isSelected ? '#EEF7F9' : BG,
          borderWidth: 1.5,
          borderColor: isSelected ? TEAL : BORDER,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
        }]}>
          <TouchableOpacity
            onPress={onSelect}
            onLongPress={onEdit}
            delayLongPress={400}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}
          >
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: isSelected ? TEAL : TEXT, flex: 1 }}>
              {list.name}
            </Text>
            {isSelected && <Text style={{ fontSize: 11, color: TEAL, fontWeight: '700' }}>✓</Text>}
          </TouchableOpacity>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}
