import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOGO_SIZE = 140;
const NUM_RINGS = 3;
const RING_DELAY = 400; // ms between each ring
const RING_DURATION = 1600; // ms for each ring to expand + fade
const DISPLAY_TIME = 2400; // total time before fade-out

interface AnimatedSplashProps {
  onFinish: () => void;
}

function PulseRing({ delay }: { delay: number }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Start with a small delay, then repeat
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(2.5, { duration: RING_DURATION, easing: Easing.out(Easing.cubic) }),
        -1, // infinite
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 100, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: RING_DURATION - 100, easing: Easing.in(Easing.cubic) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: LOGO_SIZE * 1.6,
          height: LOGO_SIZE * 1.6,
          borderRadius: (LOGO_SIZE * 1.6) / 2,
          borderWidth: 2.5,
          borderColor: '#4FB8C8',
        },
        animatedStyle,
      ]}
    />
  );
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const containerOpacity = useSharedValue(1);
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    // Logo entrance
    logoScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.2)) });
    logoOpacity.value = withTiming(1, { duration: 400 });

    // Fade out after display time
    const timeout = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      });
    }, DISPLAY_TIME);

    return () => clearTimeout(timeout);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Pulse rings */}
      {Array.from({ length: NUM_RINGS }).map((_, i) => (
        <PulseRing key={i} delay={i * RING_DELAY} />
      ))}

      {/* Logo */}
      <Animated.View style={logoStyle}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D4F5C',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
