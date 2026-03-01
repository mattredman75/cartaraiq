import React from 'react';
import { View } from 'react-native';

const TEAL = '#1B6B7A';

export function DragPlaceholder() {
  const LINE_COUNT = 30;
  const LINE_SPACING = 12;
  return (
    <View style={{
      height: 60,
      marginHorizontal: 20,
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: TEAL,
      backgroundColor: 'rgba(27,107,122,0.04)',
      overflow: 'hidden',
    }}>
      {Array.from({ length: LINE_COUNT }, (_, i) => (
        <View key={`f${i}`} style={{
          position: 'absolute',
          width: 1,
          height: 160,
          backgroundColor: 'rgba(27,107,122,0.18)',
          left: i * LINE_SPACING - 20,
          top: -50,
          transform: [{ rotate: '45deg' }],
        }} />
      ))}
      {Array.from({ length: LINE_COUNT }, (_, i) => (
        <View key={`b${i}`} style={{
          position: 'absolute',
          width: 1,
          height: 160,
          backgroundColor: 'rgba(27,107,122,0.18)',
          left: i * LINE_SPACING - 20,
          top: -50,
          transform: [{ rotate: '-45deg' }],
        }} />
      ))}
    </View>
  );
}
