import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setItem } from '../../lib/storage';
import { authLogin } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { COLORS } from '../../lib/constants';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authLogin(email, password);
      const { access_token, user } = res.data;
      await setItem('auth_token', access_token);
      await setItem('auth_user', JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginBottom: 36 }}
            >
              <Text style={{ fontFamily: 'Montserrat_500Medium', color: COLORS.muted, fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>

            {/* Header */}
            <Text
              style={{
                fontFamily: 'Montserrat_700Bold',
                fontSize: 32,
                color: COLORS.ink,
                lineHeight: 40,
                marginBottom: 8,
              }}
            >
              Welcome{'\n'}back
            </Text>
            <Text
              style={{
                fontFamily: 'Montserrat_400Regular',
                fontSize: 15,
                color: COLORS.muted,
                marginBottom: 40,
              }}
            >
              Sign in to your CartaraIQ account.
            </Text>

            {/* Fields */}
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontFamily: 'Montserrat_600SemiBold',
                  fontSize: 12,
                  color: COLORS.ink,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="jane@example.com"
                placeholderTextColor={COLORS.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  backgroundColor: COLORS.card,
                  borderWidth: 1.5,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 18,
                  paddingVertical: 15,
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 15,
                  color: COLORS.ink,
                }}
              />
            </View>

            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: 'Montserrat_600SemiBold',
                  fontSize: 12,
                  color: COLORS.ink,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                style={{
                  backgroundColor: COLORS.card,
                  borderWidth: 1.5,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 18,
                  paddingVertical: 15,
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 15,
                  color: COLORS.ink,
                }}
              />
            </View>

            {error ? (
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 13,
                  color: COLORS.danger,
                  marginBottom: 16,
                  marginTop: 8,
                }}
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.teal,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
                marginTop: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{
                    fontFamily: 'Montserrat_700Bold',
                    fontSize: 16,
                    color: '#fff',
                    letterSpacing: 0.3,
                  }}
                >
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/signup')}
              style={{ alignItems: 'center', marginTop: 24 }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 14,
                  color: COLORS.muted,
                }}
              >
                No account?{' '}
                <Text
                  style={{
                    fontFamily: 'Montserrat_600SemiBold',
                    color: COLORS.teal,
                  }}
                >
                  Sign up free
                </Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
