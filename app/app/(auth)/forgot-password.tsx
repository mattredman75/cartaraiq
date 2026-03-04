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
import { authForgotPassword } from '../../lib/api';
import { COLORS } from '../../lib/constants';
import { Ionicons } from "@expo/vector-icons";

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authForgotPassword(email.trim());
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
              Reset your{'\n'}password
            </Text>

            {sent ? (
              <>
                <Text
                  style={{
                    fontFamily: 'Montserrat_400Regular',
                    fontSize: 15,
                    color: COLORS.muted,
                    marginBottom: 40,
                    lineHeight: 22,
                  }}
                >
                  If <Text style={{ fontFamily: 'Montserrat_600SemiBold', color: COLORS.ink }}>{email}</Text> is
                  registered, you'll receive a 6-character reset code shortly.
                </Text>

                <TouchableOpacity
                  onPress={() => router.push(`/(auth)/reset-password?email=${encodeURIComponent(email)}` as any)}
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
                    Enter reset code
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
                  Enter your email and we'll send you a reset code.
                </Text>

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
                    onSubmitEditing={handleSubmit}
                    placeholder="jane@example.com"
                    placeholderTextColor={COLORS.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="done"
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
                    }}
                  >
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleSubmit}
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
                      Send reset code
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
