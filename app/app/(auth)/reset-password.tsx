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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authResetPassword } from '../../lib/api';
import { COLORS } from '../../lib/constants';
import { Ionicons } from "@expo/vector-icons";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!code.trim() || !password || !confirmPassword) {
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
      await authResetPassword(emailParam ?? '', code.trim(), password);
      setSuccess(true);
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
            <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 36 }}>
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
              {success ? 'Password\nupdated!' : 'Enter your\nreset code'}
            </Text>

            {success ? (
              <>
                <Text
                  style={{
                    fontFamily: 'Montserrat_400Regular',
                    fontSize: 15,
                    color: COLORS.muted,
                    marginBottom: 40,
                  }}
                >
                  Your password has been changed. You can now sign in with your new password.
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace('/(auth)/login')}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: COLORS.teal,
                    borderRadius: 16,
                    paddingVertical: 18,
                    alignItems: 'center',
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
                    Sign in
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: 'Montserrat_400Regular',
                    fontSize: 15,
                    color: COLORS.muted,
                    marginBottom: 40,
                  }}
                >
                  Check your email for the 6-character code, then set a new password.
                </Text>

                <InputField
                  label="Reset code"
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  placeholder="A3F7B2"
                  autoCapitalize="characters"
                />
                <InputField
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="8+ characters"
                  secureTextEntry
                />
                <InputField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  secureTextEntry
                />

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
                  onPress={handleReset}
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
                      Set new password
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{ alignItems: 'center', marginTop: 20 }}
                >
                  <Text
                    style={{
                      fontFamily: 'Montserrat_400Regular',
                      fontSize: 14,
                      color: COLORS.muted,
                    }}
                  >
                    Didn't get a code?{' '}
                    <Text style={{ fontFamily: 'Montserrat_600SemiBold', color: COLORS.teal }}>
                      Resend
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
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
        autoCapitalize={autoCapitalize ?? 'none'}
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
