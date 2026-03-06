import { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Image,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../lib/constants';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Your Lists,\nAI Enhanced',
    subtitle:
      'CartaraIQ learns what you buy and when — so your list is ready before you even open the app.',
    image: require('../../assets/cartara_step-1.png'),
    accent: COLORS.cyan,
  },
  {
    id: '2',
    title: 'Predictive Lists\nFrom Your Habits',
    subtitle:
      "Running low on milk? We already know. AI tracks your patterns and surfaces the right items at the right time.",
    image: require('../../assets/cartara_step-2.png'),
    accent: COLORS.amber,
  },
  {
    id: '3',
    title: 'Discover What\nYou\'ll Love',
    subtitle:
      'Get AI-powered product recommendations tailored to your tastes, budget, and shopping habits.',
    image: require('../../assets/cartara_step-3.png'),
    accent: COLORS.tealLight,
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex((i) => i + 1);
    } else {
      router.push('/(auth)/signup');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.tealDark }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.tealDark} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Logo */}
        <View style={{ paddingHorizontal: 28, paddingTop: 16 }}>
          <Text
            style={{
              fontFamily: 'Montserrat_700Bold',
              fontSize: 22,
              color: '#FFFFFF',
              letterSpacing: -0.5,
            }}
          >
            Cartara<Text style={{ color: COLORS.cyan }}>IQ</Text>
          </Text>
        </View>

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(index);
          }}
          renderItem={({ item }) => (
            <View
              style={{
                width,
                paddingHorizontal: 28,
                justifyContent: 'center',
                alignItems: 'center',
                paddingTop: 40,
              }}
            >
              {/* Step image */}
              <Image
                source={item.image}
                style={{ width: width - 56, height: 160, marginBottom: 32 }}
                resizeMode="contain"
              />

              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 36,
                  color: '#FFFFFF',
                  lineHeight: 44,
                  marginBottom: 20,
                  textAlign: 'center',
                }}
              >
                {item.title}
              </Text>

              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 16,
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 26,
                  textAlign: 'center',
                }}
              >
                {item.subtitle}
              </Text>
            </View>
          )}
        />

        {/* Bottom controls */}
        <View
          style={{
            paddingHorizontal: 28,
            paddingBottom: 36,
          }}
        >
          {/* Dots */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 6,
                  width: i === currentIndex ? 28 : 8,
                  borderRadius: 3,
                  backgroundColor:
                    i === currentIndex ? COLORS.cyan : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.85}
            style={{
              backgroundColor: COLORS.cyan,
              borderRadius: 16,
              paddingVertical: 18,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: 'Montserrat_700Bold',
                fontSize: 16,
                color: COLORS.tealDark,
                letterSpacing: 0.3,
              }}
            >
              {currentIndex < SLIDES.length - 1 ? 'Continue' : 'Get Started'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.7}
            style={{ alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: 'Montserrat_500Medium',
                fontSize: 14,
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              Already have an account?{' '}
              <Text style={{ color: COLORS.cyan }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
