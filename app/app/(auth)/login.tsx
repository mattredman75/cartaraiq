import { useEffect, useState } from 'react';
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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setItem } from '../../lib/storage';
import { authLogin } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { COLORS } from '../../lib/constants';
import { useBiometricAuth } from '../../hooks/useBiometricAuth';
import { PINEntry } from '../../components/PINEntry';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const {
    isBiometricAvailable,
    biometricType,
    authenticateWithBiometric,
    storeBiometricCredentials,
    getBiometricCredentials,
    isBiometricEnabled,
    verifyPin,
    hashPin,
  } = useBiometricAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [showPINEntry, setShowPINEntry] = useState(false);
  const [showPINSetup, setShowPINSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);

  useEffect(() => {
    checkBiometricSetup();
  }, []);

  const checkBiometricSetup = async () => {
    const available = isBiometricAvailable;
    if (available) {
      const enabled = await isBiometricEnabled();
      setBiometricReady(enabled);
    }
  };

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

      // Offer to set up biometric login
      if (isBiometricAvailable && !biometricReady) {
        setShowBiometricSetup(true);
      }
    } catch (e: any) {
      setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const credentials = await getBiometricCredentials();
      if (!credentials) {
        setError('No stored credentials found.');
        setLoading(false);
        return;
      }

      const success = await authenticateWithBiometric();
      if (!success) {
        setError('Biometric authentication failed.');
        setLoading(false);
        return;
      }

      // Use stored credentials to login
      const res = await authLogin(credentials.email, credentials.password);
      const { access_token, user } = res.data;
      await setItem('auth_token', access_token);
      await setItem('auth_user', JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
    } finally {
      setLoading(false);
    }
  };

  const handlePINLogin = async (enteredPin: string) => {
    setLoading(true);
    setError('');

    try {
      const credentials = await getBiometricCredentials();
      if (!credentials) {
        setError('No stored credentials found.');
        setLoading(false);
        return;
      }

      const isValid = await verifyPin(enteredPin);
      if (!isValid) {
        setError('Invalid PIN.');
        setLoading(false);
        return;
      }

      // Use stored credentials to login
      const res = await authLogin(credentials.email, credentials.password);
      const { access_token, user } = res.data;
      await setItem('auth_token', access_token);
      await setItem('auth_user', JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
      setLoading(false);
    }
  };

  const handleSetUpBiometric = async () => {
    // Store credentials for biometric
    await storeBiometricCredentials(email, password);
    setShowBiometricSetup(false);
    setShowPINSetup(true); // Ask for PIN as fallback
  };

  const handleSetUpPIN = async (enteredPin: string) => {
    try {
      const pinHash = hashPin(enteredPin);
      // Update storage with PIN hash
      const credentials = await getBiometricCredentials();
      if (credentials) {
        credentials.pinHash = pinHash;
        await setItem('biometric_credentials', JSON.stringify(credentials));
      }
      setShowPINSetup(false);
      setPin('');
      // Navigate to app
      router.replace('/(app)/list');
    } catch (e) {
      setError(`Failed to set PIN: ${e}`);
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

            {biometricReady && isBiometricAvailable && (
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  marginTop: 12,
                }}
              >
                <Ionicons
                  name={biometricType?.includes('faceId') ? 'face' : 'finger-print'}
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontFamily: 'Montserrat_700Bold',
                    fontSize: 16,
                    color: '#fff',
                    letterSpacing: 0.3,
                  }}
                >
                  {biometricType?.includes('faceId') ? 'Face ID' : biometricType?.includes('touchId') ? 'Touch ID' : 'Biometric'} Login
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password' as any)}
              style={{ alignItems: 'center', marginTop: 20 }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_500Medium',
                  fontSize: 14,
                  color: COLORS.teal,
                }}
              >
                Forgot password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/signup')}
              style={{ alignItems: 'center', marginTop: 16 }}
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

      {/* Biometric Setup Modal */}
      <Modal visible={showBiometricSetup} transparent animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 32 }}>
            <TouchableOpacity
              onPress={() => {
                setShowBiometricSetup(false);
              }}
              style={{ marginBottom: 36 }}
            >
              <Text style={{ fontFamily: 'Montserrat_500Medium', color: COLORS.muted, fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>

            <Text
              style={{
                fontFamily: 'Montserrat_700Bold',
                fontSize: 32,
                color: COLORS.ink,
                lineHeight: 40,
                marginBottom: 8,
              }}
            >
              {biometricType?.includes('faceId')
                ? 'Enable Face ID'
                : biometricType?.includes('touchId')
                  ? 'Enable Touch ID'
                  : 'Enable Biometric'}
            </Text>
            <Text
              style={{
                fontFamily: 'Montserrat_400Regular',
                fontSize: 15,
                color: COLORS.muted,
                marginBottom: 40,
              }}
            >
              Use {biometricType} to quickly log in next time.
            </Text>

            <View
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 16,
                padding: 20,
                marginBottom: 40,
                alignItems: 'center',
              }}
            >
              <Ionicons
                name={biometricType?.includes('faceId') ? 'face' : 'finger-print'}
                size={64}
                color={COLORS.primary}
                style={{ marginBottom: 16 }}
              />
              <Text
                style={{
                  fontFamily: 'Montserrat_500Medium',
                  fontSize: 14,
                  color: COLORS.muted,
                  textAlign: 'center',
                }}
              >
                This keeps your account secure while making login faster.
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleSetUpBiometric}
              disabled={loading}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.teal,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 16,
                  color: '#fff',
                  letterSpacing: 0.3,
                }}
              >
                Enable
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowBiometricSetup(false);
                router.replace('/(app)/list');
              }}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.secondary,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_700Bold',
                  fontSize: 16,
                  color: COLORS.ink,
                  letterSpacing: 0.3,
                }}
              >
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* PIN Setup Modal */}
      <Modal visible={showPINSetup} transparent animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <PINEntry
            onComplete={handleSetUpPIN}
            onCancel={() => {
              setShowPINSetup(false);
              router.replace('/(app)/list');
            }}
            title="Set up PIN"
            subtitle="Create a 4-digit PIN as a backup login method"
            maxLength={4}
          />
        </SafeAreaView>
      </Modal>

      {/* PIN Login Modal */}
      <Modal visible={showPINEntry} transparent animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <PINEntry
            onComplete={(enteredPin) => {
              setShowPINEntry(false);
              handlePINLogin(enteredPin);
            }}
            onCancel={() => setShowPINEntry(false)}
            title="Enter PIN"
            subtitle="Enter your 4-digit PIN to login"
            maxLength={4}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}
