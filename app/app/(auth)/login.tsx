import { useEffect, useState } from "react";
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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { setItem } from "../../lib/storage";
import { authLogin } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { COLORS } from "../../lib/constants";
import { useBiometricAuth } from "../../hooks/useBiometricAuth";
import { PINEntry } from "../../components/PINEntry";

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
    isPinEnabled,
    verifyPin,
    hashPin,
    checkBiometricAvailability,
    disableAllQuickLogin,
  } = useBiometricAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [showPINEntry, setShowPINEntry] = useState(false);
  const [showPINSetup, setShowPINSetup] = useState(false);
  const [showPINConfirm, setShowPINConfirm] = useState(false);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [biometricReady, setBiometricReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [showCredentialsFailedModal, setShowCredentialsFailedModal] = useState(false);

  useEffect(() => {
    console.log("Login component mounted, checking biometric setup...");
    checkBiometricSetup();
  }, []);

  const checkBiometricSetup = async () => {
    console.log("Starting biometric setup check...");
    try {
      const available = await checkBiometricAvailability();
      console.log("Biometric availability check result:", available);

      const [bioEnabled, pinEnabledVal, credentials] = await Promise.all([
        isBiometricEnabled(),
        isPinEnabled(),
        getBiometricCredentials(),
      ]);

      console.log("Biometric check results:", {
        available,
        bioEnabled,
        pinEnabledVal,
        hasCredentials: !!credentials,
        credentialsKeys: credentials ? Object.keys(credentials) : null
      });

      // Only mark bioReady if biometric is enabled AND credentials exist
      const bioReady = available && bioEnabled && !!credentials;
      setBiometricReady(bioReady);
      setPinReady(pinEnabledVal && !!credentials);

      // Prioritize biometric login if enabled
      if (bioReady && credentials) {
        // Auto-trigger biometric login for better UX
        handleBiometricLoginAuto();
      } else if (pinEnabledVal && credentials) {
        // PIN is the ONLY fast-login method — show PIN entry straight away
        setShowPINEntry(true);
      }
      // Otherwise show the form with visible buttons
    } catch (error) {
      console.warn("Biometric setup check failed or timed out:", error);
      setBiometricReady(false);
      setPinReady(false);
    }
  };

  // Auto-triggered biometric login (called on mount, not from a button press)
  const handleBiometricLoginAuto = async () => {
    try {
      const credentials = await getBiometricCredentials();
      if (!credentials) return; // No credentials stored — fall through to username/password

      const success = await authenticateWithBiometric();
      if (!success) {
        // Face ID failed — cascade to PIN if available
        const pinEnabledVal = await isPinEnabled();
        if (pinEnabledVal && credentials.pinHash) {
          setShowPINEntry(true);
        }
        // Otherwise just show the username/password form (already visible)
        return;
      }

      const res = await authLogin(credentials.email, credentials.password);
      const { access_token, user } = res.data;
      await setItem("auth_token", access_token);
      await setItem("auth_user", JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      // If auth failed (401), stored password is stale — disable quick login
      if (e.response?.status === 401) {
        await disableAllQuickLogin();
        setBiometricReady(false);
        setPinReady(false);
        setShowCredentialsFailedModal(true);
      } else {
        // Silently fall through to username/password form
        console.warn("Auto biometric login failed:", e);
      }
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await authLogin(email, password);
      const { access_token, user } = res.data;
      await setItem("auth_token", access_token);
      await setItem("auth_user", JSON.stringify(user));
      setAuth(access_token, user);

      // Offer to set up biometric login only if biometric is available and not already set up
      const biometricAvailable = await checkBiometricAvailability();
      if (biometricAvailable && !biometricReady) {
        setShowBiometricSetup(true);
      } else {
        // Navigate to app
        router.replace("/(app)/list");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const credentials = await getBiometricCredentials();
      if (!credentials) {
        setError("No stored credentials found.");
        setLoading(false);
        return;
      }

      const success = await authenticateWithBiometric();
      if (!success) {
        // Face ID failed — cascade to PIN if available, otherwise fall back to username/password
        setLoading(false);
        if (pinReady && credentials.pinHash) {
          setShowPINEntry(true);
        } else {
          setError("Biometric authentication failed. Please sign in with your username and password.");
        }
        return;
      }

      // Use stored credentials to login
      const res = await authLogin(credentials.email, credentials.password);
      const { access_token, user } = res.data;
      await setItem("auth_token", access_token);
      await setItem("auth_user", JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      // If auth failed (401), stored password is stale — disable quick login
      if (e.response?.status === 401) {
        await disableAllQuickLogin();
        setBiometricReady(false);
        setPinReady(false);
        setShowCredentialsFailedModal(true);
      } else {
        setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
      }
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePINLogin = async (enteredPin: string) => {
    setLoading(true);
    setError("");

    try {
      const credentials = await getBiometricCredentials();
      if (!credentials) {
        setShowPINEntry(false);
        setError("No stored credentials found. Please sign in with your username and password.");
        setLoading(false);
        return;
      }

      const isValid = await verifyPin(enteredPin);
      if (!isValid) {
        // PIN failed — cascade to username/password
        setShowPINEntry(false);
        setError("Incorrect PIN. Please sign in with your username and password.");
        setLoading(false);
        return;
      }

      // Use stored credentials to login
      const res = await authLogin(credentials.email, credentials.password);
      const { access_token, user } = res.data;
      await setItem("auth_token", access_token);
      await setItem("auth_user", JSON.stringify(user));
      setAuth(access_token, user);
    } catch (e: any) {
      // If auth failed (401), stored password is stale — disable quick login
      if (e.response?.status === 401) {
        setShowPINEntry(false);
        await disableAllQuickLogin();
        setBiometricReady(false);
        setPinReady(false);
        setShowCredentialsFailedModal(true);
      } else {
        setError(e.response?.data?.detail ?? `${e.message} (${e.code})`);
      }
      setLoading(false);
    }
  };

  const handleSetUpBiometric = async () => {
    // Store credentials for biometric
    await storeBiometricCredentials(email, password);

    // Prompt for biometric permission
    const success = await authenticateWithBiometric();
    if (!success) {
      setError("Biometric setup failed. Proceeding with PIN setup.");
    }

    setShowBiometricSetup(false);
    setShowPINSetup(true); // Ask for PIN as fallback
  };

  const handleSetUpPIN = async (enteredPin: string) => {
    // First PIN entry - store it and move to confirmation
    setFirstPin(enteredPin);
    setShowPINSetup(false);
    setShowPINConfirm(true);
  };

  const handleConfirmPIN = async (enteredPin: string) => {
    // Verify the confirmation PIN matches the first PIN
    if (enteredPin !== firstPin) {
      Alert.alert(
        "PINs don't match",
        "The PINs you entered don't match. Please try again.",
        [{ text: "OK" }],
      );
      setFirstPin("");
      setShowPINConfirm(false);
      setShowPINSetup(true);
      return;
    }

    try {
      const pinHash = await hashPin(enteredPin);
      // Get or create credentials with PIN hash
      let credentials = await getBiometricCredentials();
      
      if (!credentials) {
        // If no credentials exist yet (user skipped biometric setup),
        // create a minimal credentials object with just email/password/PIN
        if (!email || !password) {
          setError("Missing credentials. Please log in again.");
          return;
        }
        credentials = {
          email,
          password,
          pinHash,
          biometricType: null,
        };
      } else {
        // Update existing credentials with PIN hash
        credentials.pinHash = pinHash;
      }
      
      // Store the credentials
      await setItem("biometric_credentials", JSON.stringify(credentials));
      // Ensure flags are properly set
      await setItem("pin_enabled", "true");
      
      setShowPINConfirm(false);
      setFirstPin("");
      setPin("");
      setError("");
      // Navigate to app
      router.replace("/(app)/list");
    } catch (e) {
      setError(`Failed to set PIN: ${e}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 28,
              paddingTop: 32,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Back */}
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginBottom: 36 }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  color: COLORS.muted,
                  fontSize: 14,
                }}
              >
                ← Back
              </Text>
            </TouchableOpacity>

            {/* Header */}
            <Text
              style={{
                fontFamily: "Montserrat_700Bold",
                fontSize: 32,
                color: COLORS.ink,
                lineHeight: 40,
                marginBottom: 8,
              }}
            >
              Welcome{"\n"}back
            </Text>
            <Text
              style={{
                fontFamily: "Montserrat_400Regular",
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
                  fontFamily: "Montserrat_600SemiBold",
                  fontSize: 12,
                  color: COLORS.ink,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
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
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 15,
                  color: COLORS.ink,
                }}
              />
            </View>

            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: "Montserrat_600SemiBold",
                  fontSize: 12,
                  color: COLORS.ink,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
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
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 15,
                  color: COLORS.ink,
                }}
              />
            </View>

            {error ? (
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
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
                alignItems: "center",
                marginTop: 16,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Montserrat_700Bold",
                    fontSize: 16,
                    color: "#fff",
                    letterSpacing: 0.3,
                  }}
                >
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

            {/* Face ID / Touch ID — only when biometric is enabled */}
            {biometricReady && isBiometricAvailable && (
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.teal,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  marginTop: 12,
                }}
              >
                <Ionicons
                  name={
                    biometricType?.includes("faceId")
                      ? "person"
                      : "finger-print"
                  }
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontFamily: "Montserrat_700Bold",
                    fontSize: 16,
                    color: "#fff",
                    letterSpacing: 0.3,
                  }}
                >
                  {biometricType?.includes("faceId")
                    ? "Face ID"
                    : biometricType?.includes("touchId")
                      ? "Touch ID"
                      : "Biometric"}{" "}
                  Login
                </Text>
              </TouchableOpacity>
            )}

            {/* PIN Login — shown when PIN is enabled */}
            {pinReady && (
              <TouchableOpacity
                onPress={() => setShowPINEntry(true)}
                disabled={loading}
                activeOpacity={0.85}
                style={{
                  backgroundColor: COLORS.teal,
                  borderRadius: 16,
                  paddingVertical: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  marginTop: 12,
                }}
              >
                <Ionicons
                  name="keypad-outline"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontFamily: "Montserrat_700Bold",
                    fontSize: 16,
                    color: "#fff",
                    letterSpacing: 0.3,
                  }}
                >
                  Login with PIN
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push("/(auth)/forgot-password" as any)}
              style={{ alignItems: "center", marginTop: 20 }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  fontSize: 14,
                  color: COLORS.teal,
                }}
              >
                Forgot password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/signup")}
              style={{ alignItems: "center", marginTop: 16 }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 14,
                  color: COLORS.muted,
                }}
              >
                No account?{" "}
                <Text
                  style={{
                    fontFamily: "Montserrat_600SemiBold",
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
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  color: COLORS.muted,
                  fontSize: 14,
                }}
              >
                ← Back
              </Text>
            </TouchableOpacity>

            <Text
              style={{
                fontFamily: "Montserrat_700Bold",
                fontSize: 32,
                color: COLORS.ink,
                lineHeight: 40,
                marginBottom: 8,
              }}
            >
              {biometricType?.includes("faceId")
                ? "Enable Face ID"
                : biometricType?.includes("touchId")
                  ? "Enable Touch ID"
                  : "Enable Biometric"}
            </Text>
            <Text
              style={{
                fontFamily: "Montserrat_400Regular",
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
                alignItems: "center",
              }}
            >
              <Ionicons
                name={
                  biometricType?.includes("faceId") ? "person" : "finger-print"
                }
                size={64}
                color={COLORS.teal}
                style={{ marginBottom: 16 }}
              />
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  fontSize: 14,
                  color: COLORS.muted,
                  textAlign: "center",
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
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_700Bold",
                  fontSize: 16,
                  color: "#fff",
                  letterSpacing: 0.3,
                }}
              >
                Enable
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowBiometricSetup(false);
                // If skipping biometric, must still set up PIN
                setShowPINSetup(true);
              }}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_700Bold",
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
              // Don't allow skipping PIN setup - go back to biometric/PIN choice or straight to app
              // If user cancels, they must have already set up biometric or agree to skip to app
              setShowPINSetup(false);
              // Set biometric_credentials and flags so next login works
              if (email && password) {
                storeBiometricCredentials(email, password);
              }
              router.replace("/(app)/list");
            }}
            title="Set up PIN"
            subtitle="Create a 4-digit PIN as a backup login method"
            maxLength={4}
          />
        </SafeAreaView>
      </Modal>

      {/* PIN Confirm Modal */}
      <Modal visible={showPINConfirm} transparent animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
          <PINEntry
            onComplete={handleConfirmPIN}
            onCancel={() => {
              setShowPINConfirm(false);
              setFirstPin("");
              setShowPINSetup(true);
              setError("");
            }}
            title="Confirm your new PIN"
            subtitle="Enter the same 4-digit PIN again"
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

      {/* Credentials Failed Modal — shown when stored password is stale */}
      <Modal visible={showCredentialsFailedModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 20,
              padding: 28,
              marginHorizontal: 32,
              alignItems: "center",
              width: "85%",
            }}
          >
            <Ionicons
              name="alert-circle"
              size={48}
              color={COLORS.danger}
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontFamily: "Montserrat_700Bold",
                fontSize: 18,
                color: COLORS.ink,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Face ID failed
            </Text>
            <Text
              style={{
                fontFamily: "Montserrat_400Regular",
                fontSize: 15,
                color: COLORS.muted,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Please log in again
            </Text>
            <TouchableOpacity
              onPress={() => setShowCredentialsFailedModal(false)}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.teal,
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 40,
              }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_700Bold",
                  fontSize: 16,
                  color: "#fff",
                  letterSpacing: 0.3,
                }}
              >
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
