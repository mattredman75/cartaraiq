import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
  Switch,
  SafeAreaView,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../lib/store";
import {
  updateMe,
  setupBiometric,
  disableBiometric,
  authLogout,
} from "../../lib/api";
import { setItem, deleteItem, getItem } from "../../lib/storage";
import { useBiometricAuth } from "../../hooks/useBiometricAuth";
import { PINEntry } from "../../components/PINEntry";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const BG = "#DDE4E7";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth, updateUser } = useAuthStore();
  const {
    isBiometricAvailable,
    biometricType,
    checkBiometricAvailability,
    disableBiometricLogin,
    isBiometricEnabled,
    isPinEnabled,
    enablePin,
    disablePin,
    hashPin,
    getBiometricCredentials,
    authenticateWithBiometric,
    storeBiometricCredentials,
  } = useBiometricAuth();

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameText, setDisplayNameText] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [showResetPINModal, setShowResetPINModal] = useState(false);
  const [resetPINStep, setResetPINStep] = useState<"first" | "confirm">(
    "first",
  );
  const [firstResetPIN, setFirstResetPIN] = useState("");
  const [resetPINError, setResetPINError] = useState("");
  const [showBiometricSuccessModal, setShowBiometricSuccessModal] =
    useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pairingEnabled, setPairingEnabled] = useState(true);

  useEffect(() => {
    checkBiometricAvailability();
    isBiometricEnabled().then(setBiometricEnabled);
    isPinEnabled().then(setPinEnabledState);

    // Load feature flags
    getItem("ai_suggestions_enabled").then((v) => {
      if (v !== "0") setAiEnabled(true);
    });
    getItem("pairing_suggestions_enabled").then((v) => {
      if (v !== "0") setPairingEnabled(true);
    });
  }, [checkBiometricAvailability, isBiometricEnabled, isPinEnabled]);

  const handleFirstResetPIN = async (pin: string) => {
    setFirstResetPIN(pin);
    setResetPINStep("confirm");
  };

  const handleConfirmResetPIN = async (pin: string) => {
    if (pin !== firstResetPIN) {
      Alert.alert(
        "PINs don't match",
        "The PINs you entered don't match. Please try again.",
        [{ text: "OK" }],
      );
      setFirstResetPIN("");
      setResetPINStep("first");
      return;
    }

    try {
      const hash = await hashPin(pin);
      const success = await enablePin(hash);
      if (success) {
        setShowResetPINModal(false);
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
        setPinEnabledState(true);
        Alert.alert("Success", "Your PIN has been set successfully.");
      } else {
        setResetPINError("Could not set PIN. Please try again.");
      }
    } catch (e) {
      setResetPINError(`Failed to set PIN: ${e}`);
    }
  };

  const handleDisablePIN = async () => {
    try {
      const success = await disablePin();
      if (success) {
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
        Alert.alert("Success", "Your PIN has been disabled successfully.");
      } else {
        setResetPINError("Could not disable PIN. Please try again.");
      }
    } catch (e) {
      setResetPINError(`Failed to disable PIN: ${e}`);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel" },
      {
        text: "Log Out",
        onPress: async () => {
          try {
            await authLogout();
            clearAuth();
            router.replace("/(auth)/login");
          } catch (e) {
            Alert.alert("Error", `Failed to log out: ${e}`);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: BG }}
      edges={["right", "left"]}
    >
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* User Profile Section */}
        <View
          style={{
            paddingVertical: 20,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
            backgroundColor: "#fff",
          }}
        >
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: TEAL_DARK,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </Text>
            </View>
            {editingDisplayName ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TextInput
                  value={displayNameText}
                  onChangeText={setDisplayNameText}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={async () => {
                    const name = displayNameText.trim();
                    if (name && name !== user?.name) {
                      await updateMe(name);
                      updateUser({ name });
                      await setItem(
                        "auth_user",
                        JSON.stringify({ ...user, name }),
                      );
                    }
                    setEditingDisplayName(false);
                  }}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: "700",
                    color: TEXT,
                    borderBottomWidth: 1.5,
                    borderBottomColor: TEAL,
                    paddingVertical: 2,
                  }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    const name = displayNameText.trim();
                    if (name && name !== user?.name) {
                      await updateMe(name);
                      updateUser({ name });
                      await setItem(
                        "auth_user",
                        JSON.stringify({ ...user, name }),
                      );
                    }
                    setEditingDisplayName(false);
                  }}
                >
                  <Text
                    style={{ color: TEAL, fontWeight: "700", fontSize: 13 }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setDisplayNameText(user?.name ?? "");
                  setEditingDisplayName(true);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: TEXT }}>
                  {user?.name ?? "User"}
                </Text>
                <Text style={{ fontSize: 11, color: MUTED }}>✎</Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
              {user?.email ?? ""}
            </Text>
          </View>
        </View>

        {/* AI Suggestions Toggle */}
        <View style={{ backgroundColor: "#fff", marginTop: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
              AI Suggestions
            </Text>
            <Switch
              value={aiEnabled}
              onValueChange={(val) => {
                setAiEnabled(val);
                setItem("ai_suggestions_enabled", val ? "1" : "0");
              }}
              trackColor={{ false: BORDER, true: TEAL }}
              thumbColor="#fff"
            />
          </View>

          {/* Pairing Suggestions Toggle */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              opacity: aiEnabled ? 1 : 0.4,
            }}
          >
            <View>
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                Recipe Suggestions
              </Text>
            </View>
            <Switch
              value={pairingEnabled && aiEnabled}
              disabled={!aiEnabled}
              onValueChange={(val) => {
                setPairingEnabled(val);
                setItem("pairing_suggestions_enabled", val ? "1" : "0");
              }}
              trackColor={{ false: BORDER, true: TEAL }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Biometric and PIN Section */}
        {isBiometricAvailable && (
          <View style={{ marginTop: 12, backgroundColor: "#fff" }}>
            {/* Biometric Toggle */}
            <View
              style={{
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View>
                  <Text
                    style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}
                  >
                    {biometricType?.includes("faceId")
                      ? "Face ID"
                      : biometricType?.includes("touchId")
                        ? "Touch ID"
                        : "Biometric"}{" "}
                    Login
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={async (val) => {
                    if (!val) {
                      await disableBiometric();
                      await disableBiometricLogin();
                      setBiometricEnabled(false);
                      setPinEnabledState(true);
                    } else {
                      const credentials = await getBiometricCredentials();
                      if (!credentials?.pinHash) {
                        Alert.alert(
                          "PIN Required",
                          "You need to set up a PIN first before enabling biometric login.",
                          [
                            {
                              text: "Set PIN",
                              onPress: () => {
                                setShowResetPINModal(true);
                                setResetPINStep("first");
                                setFirstResetPIN("");
                                setResetPINError("");
                              },
                            },
                          ],
                        );
                        return;
                      }

                      const bioSuccess = await authenticateWithBiometric();
                      if (!bioSuccess) {
                        Alert.alert(
                          "Biometric Setup Failed",
                          "Biometric authentication failed. Please try again.",
                          [{ text: "OK" }],
                        );
                        return;
                      }

                      try {
                        await setupBiometric(
                          credentials.pinHash,
                          biometricType || "faceId",
                        );
                        await setItem("biometric_enabled", "true");
                        setBiometricEnabled(true);
                        setPinEnabledState(true);
                        setShowBiometricSuccessModal(true);
                      } catch (error: any) {
                        Alert.alert(
                          "Setup Failed",
                          `Failed to enable biometric login: ${error.message || "Unknown error"}. Please try again.`,
                          [{ text: "OK" }],
                        );
                      }
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* PIN Toggle */}
            <View
              style={{
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View>
                  <Text
                    style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}
                  >
                    PIN Login
                  </Text>
                </View>
                <Switch
                  value={pinEnabled}
                  onValueChange={async (val) => {
                    if (val) {
                      setShowResetPINModal(true);
                      setResetPINStep("first");
                      setFirstResetPIN("");
                      setResetPINError("");
                    } else if (biometricEnabled) {
                      Alert.alert(
                        "PIN Always Active",
                        "PIN remains active as a fallback for biometric authentication.",
                        [{ text: "OK" }],
                      );
                    } else {
                      await handleDisablePIN();
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                  disabled={biometricEnabled}
                />
              </View>
            </View>
          </View>
        )}

        {/* Utility Section */}
        <View style={{ marginTop: 12, backgroundColor: "#fff" }}>
          {/* Version Info */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 12, color: MUTED }}>
              App Version {Constants.expoConfig?.version || "1.0.0"}
            </Text>
          </View>

          {/* Reset PIN Button */}
          {pinEnabled && (
            <View
              style={{
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
                alignItems: "center",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setShowResetPINModal(true);
                  setResetPINStep("first");
                  setFirstResetPIN("");
                  setResetPINError("");
                }}
                style={{
                  width: "80%",
                  backgroundColor: TEAL,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 16, color: "#fff", fontWeight: "600" }}>
                  Reset PIN
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Logout Button - Red, 80% width, centered */}
          <View
            style={{
              paddingVertical: 20,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                width: "80%",
                backgroundColor: "#DC2626",
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 16, color: "#fff", fontWeight: "600" }}>
                Log Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reset PIN Modal */}
      <Modal visible={showResetPINModal} transparent animationType="slide">
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 24,
              paddingVertical: 24,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: TEXT,
                marginBottom: 6,
              }}
            >
              {resetPINStep === "first" ? "Set PIN" : "Confirm PIN"}
            </Text>
            <Text style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
              {resetPINStep === "first"
                ? "Enter a 4-digit PIN to secure your account"
                : "Re-enter your PIN to confirm"}
            </Text>

            <PINEntry
              onComplete={
                resetPINStep === "first"
                  ? handleFirstResetPIN
                  : handleConfirmResetPIN
              }
              error={resetPINError}
            />

            <TouchableOpacity
              onPress={() => {
                setShowResetPINModal(false);
                setResetPINStep("first");
                setFirstResetPIN("");
                setResetPINError("");
              }}
              style={{ marginTop: 16 }}
            >
              <Text style={{ fontSize: 14, color: MUTED, textAlign: "center" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Biometric Success Modal */}
      <Modal
        visible={showBiometricSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBiometricSuccessModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              margin: 20,
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 12,
            }}
          >
            <Ionicons
              name={
                biometricType?.includes("faceId") ? "person" : "finger-print"
              }
              size={48}
              color={TEAL}
              style={{ marginBottom: 16 }}
            />
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: TEXT,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              {biometricType?.includes("faceId")
                ? "Face ID"
                : biometricType?.includes("touchId")
                  ? "Touch ID"
                  : "Biometric"}{" "}
              Enabled
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: MUTED,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              You can now use{" "}
              {biometricType?.includes("faceId")
                ? "Face ID"
                : biometricType?.includes("touchId")
                  ? "Touch ID"
                  : "biometric authentication"}{" "}
              to log in quickly.
            </Text>
            <TouchableOpacity
              onPress={() => setShowBiometricSuccessModal(false)}
              style={{
                backgroundColor: TEAL,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
