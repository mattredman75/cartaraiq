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
import { authRegister } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { COLORS } from '../../lib/constants';

export default function SignupScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authRegister(email, password, name);
      const { access_token, user } = res.data;
      await setItem('auth_token', access_token);
      await setItem('auth_user', JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Something went wrong. Please try again.');
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
              Create your{'\n'}account
            </Text>
            <Text
              style={{
                fontFamily: 'Montserrat_400Regular',
                fontSize: 15,
                color: COLORS.muted,
                marginBottom: 40,
              }}
            >
              Start shopping smarter today.
            </Text>

            {/* Fields */}
            <InputField label="Full name" value={name} onChangeText={setName} placeholder="Jane Smith" />
            <InputField label="Email" value={email} onChangeText={setEmail} placeholder="jane@example.com" keyboardType="email-address" autoCapitalize="none" />
            <InputField label="Password" value={password} onChangeText={setPassword} placeholder="8+ characters" secureTextEntry />
            <InputField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" secureTextEntry />

            {error ? (
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 13,
                  color: COLORS.danger,
                  marginBottom: 16,
                }}
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.teal,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: 'center',
                marginTop: 8,
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
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={{ alignItems: 'center', marginTop: 24 }}
            >
              <Text
                style={{
                  fontFamily: 'Montserrat_400Regular',
                  fontSize: 14,
                  color: COLORS.muted,
                }}
              >
                Have an account?{' '}
                <Text
                  style={{
                    fontFamily: 'Montserrat_600SemiBold',
                    color: COLORS.teal,
                  }}
                >
                  Sign in
                </Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  return (
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
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
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
  );
}
