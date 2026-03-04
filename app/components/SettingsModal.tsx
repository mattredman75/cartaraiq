import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../lib/store";
import { updateMe } from "../lib/api";
import { setItem, deleteItem } from "../lib/storage";
import { useBiometricAuth } from "../hooks/useBiometricAuth";
import { PINEntry } from "./PINEntry";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;
  pairingEnabled: boolean;
  setPairingEnabled: (v: boolean) => void;
}

export function SettingsModal({
  visible,
  onClose,
  aiEnabled,
  setAiEnabled,
  pairingEnabled,
  setPairingEnabled,
}: SettingsModalProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth, updateUser } = useAuthStore();
  const {
    isBiometricAvailable,
    biometricType,
    checkBiometricAvailability,
    disableBiometricLogin,
    isBiometricEnabled,
    hashPin,
    getBiometricCredentials,
    authenticateWithBiometric,
    storeBiometricCredentials,
  } = useBiometricAuth();

  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameText, setDisplayNameText] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Re-enable biometric flow
  const [showEnableBiometricModal, setShowEnableBiometricModal] = useState(false);
  const [enablePassword, setEnablePassword] = useState("");
  const [enablePasswordError, setEnablePasswordError] = useState("");
  const [enablePINStep, setEnablePINStep] = useState<"none" | "first" | "confirm">("none");
  const [enableFirstPIN, setEnableFirstPIN] = useState("");

  // Reset PIN flow
  const [showResetPINModal, setShowResetPINModal] = useState(false);
  const [resetPINStep, setResetPINStep] = useState<"first" | "confirm">("first");
  const [firstResetPIN, setFirstResetPIN] = useState("");
  const [resetPINError, setResetPINError] = useState("");

  useEffect(() => {
    if (visible) {
      checkBiometricAvailability();
      isBiometricEnabled().then(setBiometricEnabled);
    }
  }, [visible, checkBiometricAvailability, isBiometricEnabled]);

  const handleEnableBiometricSubmitPassword = async () => {
    if (!enablePassword.trim()) {
      setEnablePasswordError("Please enter your password.");
      return;
    }
    setEnablePasswordError("");
    // Store credentials with the entered password
    await storeBiometricCredentials(user?.email ?? "", enablePassword);
    // Trigger Face ID / Touch ID prompt
    const success = await authenticateWithBiometric();
    if (!success) {
      setEnablePasswordError("Biometric authentication failed. Please try again.");
      return;
    }
    // Move to PIN setup
    setEnablePINStep("first");
  };

  const handleEnableFirstPIN = (pin: string) => {
    setEnableFirstPIN(pin);
    setEnablePINStep("confirm");
  };

  const handleEnableConfirmPIN = async (pin: string) => {
    if (pin !== enableFirstPIN) {
      setEnablePasswordError("PINs do not match. Please try again.");
      setEnableFirstPIN("");
      setEnablePINStep("first");
      return;
    }
    try {
      const pinHash = await hashPin(pin);
      const credentials = await getBiometricCredentials();
      if (credentials) {
        credentials.pinHash = pinHash;
        await setItem("biometric_credentials", JSON.stringify(credentials));
      }
      setBiometricEnabled(true);
      setShowEnableBiometricModal(false);
      setEnablePassword("");
      setEnablePasswordError("");
      setEnablePINStep("none");
      setEnableFirstPIN("");
      Alert.alert("Success", "Biometric login has been enabled.");
    } catch (e) {
      setEnablePasswordError(`Failed to set PIN: ${e}`);
    }
  };

  const handleFirstResetPIN = async (pin: string) => {
    setFirstResetPIN(pin);
    setResetPINStep("confirm");
  };

  const handleConfirmResetPIN = async (pin: string) => {
    if (pin !== firstResetPIN) {
      setResetPINError("PINs do not match. Please try again.");
      setFirstResetPIN("");
      setResetPINStep("first");
      return;
    }

    try {
      const pinHash = await hashPin(pin);
      const credentials = await getBiometricCredentials();
      if (credentials) {
        credentials.pinHash = pinHash;
        await setItem("biometric_credentials", JSON.stringify(credentials));
        setShowResetPINModal(false);
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
        Alert.alert("Success", "Your PIN has been reset successfully.");
      } else {
        setResetPINError("Could not update PIN. Please try again.");
      }
    } catch (e) {
      setResetPINError(`Failed to reset PIN: ${e}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose}>
        <View
          style={{
            position: "absolute",
            top: insets.top + 56,
            right: 16,
            width: 300,
            backgroundColor: "#fff",
            borderRadius: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 12,
            overflow: "hidden",
          }}
        >
          {/* User info */}
          <View
            style={{
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
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

          {/* AI suggestions toggle */}
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

          {/* Pairing suggestions toggle */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
              opacity: aiEnabled ? 1 : 0.4,
            }}
          >
            <View>
              <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                Pairing Suggestions
              </Text>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                Ingredients that pair with your list
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

          {/* Biometric login toggle */}
          {isBiometricAvailable && (
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
                  <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                    Use {biometricType} for quick login
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={async (val) => {
                    if (!val) {
                      // Disable biometric
                      await disableBiometricLogin();
                      setBiometricEnabled(false);
                    } else {
                      // Re-enable biometric inline
                      setEnablePassword("");
                      setEnablePasswordError("");
                      setEnablePINStep("none");
                      setEnableFirstPIN("");
                      setShowEnableBiometricModal(true);
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                />
              </View>

              {/* Reset PIN option when biometric is enabled */}
              {biometricEnabled && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowResetPINModal(true);
                      setResetPINStep("first");
                      setFirstResetPIN("");
                      setResetPINError("");
                    }}
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: TEAL,
                      borderRadius: 20,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#fff",
                        fontWeight: "600",
                      }}
                    >
                      Reset PIN
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Version */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            {(() => {
              const version = Constants.expoConfig?.version ?? "1.0.0";
              let build: string | null =
                Constants.expoConfig?.ios?.buildNumber ||
                (Constants.expoConfig?.android?.versionCode
                  ? String(Constants.expoConfig?.android?.versionCode)
                  : null) ||
                null;

              // try to read generated build-info with git commit
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const info = require("../build-info.json");
                if (info && info.gitCommit) {
                  const hash = String(info.gitCommit).slice(0, 10);
                  build = build ? `${build}.${hash}` : hash;
                }
              } catch (e) {
                // file may not exist in some environments; ignore
              }

              return (
                <Text style={{ fontSize: 12, color: MUTED }}>
                  Version {version}
                  {build ? ` (${build})` : ""}
                </Text>
              );
            })()}
          </View>

          {/* Sign out */}
          <TouchableOpacity
            onPress={async () => {
              onClose();
              await deleteItem("auth_token");
              await deleteItem("auth_user");
              clearAuth();
              router.replace("/(auth)/welcome" as any);
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Reset PIN Modal - First Step */}
      <Modal
        visible={showResetPINModal && resetPINStep === "first"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: TEAL }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32 }}>
            <TouchableOpacity
              onPress={() => {
                setShowResetPINModal(false);
                setFirstResetPIN("");
                setResetPINError("");
              }}
              style={{ marginBottom: 36 }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  color: "#fff",
                  fontSize: 14,
                }}
              >
                ← Back
              </Text>
            </TouchableOpacity>

            {resetPINError ? (
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 13,
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                {resetPINError}
              </Text>
            ) : null}

            <PINEntry
              onComplete={handleFirstResetPIN}
              onCancel={() => {
                setShowResetPINModal(false);
                setFirstResetPIN("");
                setResetPINError("");
              }}
              title="Enter New PIN"
              subtitle="Create a new 4-digit PIN"
              maxLength={4}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Reset PIN Modal - Confirm Step */}
      <Modal
        visible={showResetPINModal && resetPINStep === "confirm"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: TEAL }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32 }}>
            <TouchableOpacity
              onPress={() => {
                setResetPINStep("first");
                setFirstResetPIN("");
                setResetPINError("");
              }}
              style={{ marginBottom: 36 }}
            >
              <Text
                style={{
                  fontFamily: "Montserrat_500Medium",
                  color: "#fff",
                  fontSize: 14,
                }}
              >
                ← Back
              </Text>
            </TouchableOpacity>

            {resetPINError ? (
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 13,
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                {resetPINError}
              </Text>
            ) : null}

            <PINEntry
              onComplete={handleConfirmResetPIN}
              onCancel={() => {
                setResetPINStep("first");
                setFirstResetPIN("");
                setResetPINError("");
              }}
              title="Confirm New PIN"
              subtitle="Enter the same 4-digit PIN again"
              maxLength={4}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Enable Biometric - Password Entry */}
      <Modal
        visible={showEnableBiometricModal && enablePINStep === "none"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 32 }}>
            <TouchableOpacity
              onPress={() => setShowEnableBiometricModal(false)}
              style={{ marginBottom: 36 }}
            >
              <Text style={{ fontFamily: "Montserrat_500Medium", color: MUTED, fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>

            <Text style={{ fontFamily: "Montserrat_700Bold", fontSize: 28, color: TEXT, marginBottom: 8 }}>
              {biometricType?.includes("faceId") ? "Enable Face ID" : biometricType?.includes("touchId") ? "Enable Touch ID" : "Enable Biometric"}
            </Text>
            <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 15, color: MUTED, marginBottom: 32 }}>
              Enter your password to re-enable biometric login.
            </Text>

            <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: TEXT, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
              Password
            </Text>
            <TextInput
              value={enablePassword}
              onChangeText={setEnablePassword}
              placeholder="Your password"
              placeholderTextColor={MUTED}
              secureTextEntry
              autoFocus
              style={{
                backgroundColor: "#F8F9FA",
                borderWidth: 1.5,
                borderColor: BORDER,
                borderRadius: 14,
                paddingHorizontal: 18,
                paddingVertical: 15,
                fontFamily: "Montserrat_400Regular",
                fontSize: 15,
                color: TEXT,
                marginBottom: 12,
              }}
            />

            {enablePasswordError ? (
              <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>
                {enablePasswordError}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleEnableBiometricSubmitPassword}
              activeOpacity={0.85}
              style={{
                backgroundColor: TEAL,
                borderRadius: 16,
                paddingVertical: 18,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text style={{ fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#fff", letterSpacing: 0.3 }}>
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Enable Biometric - First PIN */}
      <Modal
        visible={showEnableBiometricModal && enablePINStep === "first"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32 }}>
            <TouchableOpacity
              onPress={() => setEnablePINStep("none")}
              style={{ marginBottom: 36 }}
            >
              <Text style={{ fontFamily: "Montserrat_500Medium", color: MUTED, fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>

            {enablePasswordError ? (
              <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>
                {enablePasswordError}
              </Text>
            ) : null}

            <PINEntry
              onComplete={handleEnableFirstPIN}
              onCancel={() => setShowEnableBiometricModal(false)}
              title="Set up PIN"
              subtitle="Create a 4-digit PIN as a backup login method"
              maxLength={4}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Enable Biometric - Confirm PIN */}
      <Modal
        visible={showEnableBiometricModal && enablePINStep === "confirm"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32 }}>
            <TouchableOpacity
              onPress={() => { setEnablePINStep("first"); setEnableFirstPIN(""); setEnablePasswordError(""); }}
              style={{ marginBottom: 36 }}
            >
              <Text style={{ fontFamily: "Montserrat_500Medium", color: MUTED, fontSize: 14 }}>
                ← Back
              </Text>
            </TouchableOpacity>

            {enablePasswordError ? (
              <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 13, color: "#DC2626", marginBottom: 16 }}>
                {enablePasswordError}
              </Text>
            ) : null}

            <PINEntry
              onComplete={handleEnableConfirmPIN}
              onCancel={() => setShowEnableBiometricModal(false)}
              title="Confirm PIN"
              subtitle="Enter the same 4-digit PIN again"
              maxLength={4}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}
