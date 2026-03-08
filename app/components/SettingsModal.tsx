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
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../lib/store";
import { updateMe, setupBiometric, disableBiometric, authLogout } from "../lib/api";
import { setItem, deleteItem } from "../lib/storage";
import { useBiometricAuth } from "../hooks/useBiometricAuth";
import { PINEntry } from "./PINEntry";
import { COLORS } from "@/lib/constants";

const TEAL = "#1B6B7A";
const TEAL_DARK = "#0D4F5C";
const TEXT = "#1A1A2E";
const MUTED = "#64748B";
const BORDER = "#E8EFF2";
const COLORS_SURFACE = "#F5F9FA";

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
  const [resetPINStep, setResetPINStep] = useState<"first" | "confirm">("first");
  const [firstResetPIN, setFirstResetPIN] = useState("");
  const [resetPINError, setResetPINError] = useState("");
  const [showBiometricSuccessModal, setShowBiometricSuccessModal] = useState(false);

  useEffect(() => {
    if (visible) {
      checkBiometricAvailability();
      isBiometricEnabled().then(setBiometricEnabled);
      isPinEnabled().then(setPinEnabledState);
    }
  }, [visible, checkBiometricAvailability, isBiometricEnabled, isPinEnabled]);

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
      const pinHash = await hashPin(pin);
      const credentials = await getBiometricCredentials();
      if (credentials) {
        credentials.pinHash = pinHash;
        await setItem("biometric_credentials", JSON.stringify(credentials));
        // Ensure PIN is enabled now that a valid hash exists
        await enablePin();
        setPinEnabledState(true);
        setShowResetPINModal(false);
        setResetPINStep("first");
        setFirstResetPIN("");
        setResetPINError("");
        Alert.alert("Success", "Your PIN has been updated successfully.");
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
              Smart Suggestions
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
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={async (val) => {
                    if (!val) {
                      // Disable biometric — preserves credentials, auto-enables PIN
                      await disableBiometric();
                      await disableBiometricLogin();
                      setBiometricEnabled(false);
                      setPinEnabledState(true); // PIN becomes the active fast-login method
                    } else {
                      // Enable biometric — launch enrollment flow
                      const credentials = await getBiometricCredentials();
                      if (!credentials?.pinHash) {
                        Alert.alert(
                          "PIN Required",
                          "You need to set up a PIN first before enabling biometric login.",
                          [{
                            text: "Set PIN",
                            onPress: () => {
                              setShowResetPINModal(true);
                              setResetPINStep("first");
                              setFirstResetPIN("");
                              setResetPINError("");
                            },
                          }],
                        );
                        return;
                      }

                      // Authenticate with biometric
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
                        // Call backend to enable biometric
                        const response = await setupBiometric(credentials.pinHash, biometricType || "faceId");
                        
                        // Persist the enabled state to local storage
                        try {
                          await setItem("biometric_enabled", "true");
                        } catch (storageError) {
                          console.error("Failed to save biometric_enabled to storage:", storageError);
                          Alert.alert(
                            "Storage Error",
                            "Biometric was enabled but couldn't be saved locally. Please try again.",
                            [{ text: "OK" }],
                          );
                          return;
                        }
                        
                        // Update local state
                        setBiometricEnabled(true);
                        setPinEnabledState(true); // PIN remains enabled as fallback
                        
                        setShowBiometricSuccessModal(true);
                      } catch (error: any) {
                        console.error("Failed to enable biometric:", error);
                        Alert.alert(
                          "Setup Failed",
                          `Failed to enable biometric login: ${error.message || 'Unknown error'}. Please try again.`,
                          [{ text: "OK" }],
                        );
                      }
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                />
              </View>

              {/* PIN Login toggle — grayed out when biometric is on (PIN always active as fallback),
                  independently controllable when biometric is off */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  opacity: biometricEnabled ? 0.5 : 1,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, color: TEXT, fontWeight: "500" }}>
                    PIN Login
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled ? true : pinEnabled}
                  disabled={biometricEnabled}
                  onValueChange={async (val) => {
                    if (val) {
                      // Check if a PIN hash already exists
                      const creds = await getBiometricCredentials();
                      if (!creds?.pinHash) {
                        // No PIN set — prompt user to create one
                        setShowResetPINModal(true);
                        setResetPINStep("first");
                        setFirstResetPIN("");
                        setResetPINError("");
                        return;
                      }
                      await enablePin();
                      setPinEnabledState(true);
                    } else {
                      await disablePin();
                      setPinEnabledState(false);
                    }
                  }}
                  trackColor={{ false: BORDER, true: TEAL }}
                  thumbColor="#fff"
                />
              </View>

              {/* Reset PIN — visible whenever PIN exists (biometric or PIN enabled) */}
              {(biometricEnabled || pinEnabled) && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowResetPINModal(true);
                      setResetPINStep("first");
                      setFirstResetPIN("");
                      setResetPINError("");
                    }}
                    style={{
                      width: "80%",
                      marginTop: 10,
                      paddingVertical: 8,
                      backgroundColor: TEAL,
                      borderRadius: 10,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: "#fff", fontWeight: "600" }}>
                      Reset PIN
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Manage my data */}
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push("/(app)/manage-data" as any);
            }}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Ionicons name="folder-outline" size={20} color={TEAL} style={{ marginRight: 12 }} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: TEXT }}>
              Manage my data
            </Text>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </TouchableOpacity>

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
          <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 20, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={async () => {
              onClose();
              try { await authLogout(); } catch (_) { /* best-effort */ }
              await deleteItem("auth_token");
              await deleteItem("refresh_token");
              await deleteItem("auth_user");
              clearAuth();
              router.replace("/(auth)/welcome" as any);
            }}
              activeOpacity={0.85}
              style={{
                backgroundColor: COLORS.danger,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                width: '90%',
              }}
            >
              <Text
                style={{fontSize: 13, color: "#fff", fontWeight: "600" }}
              >
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      {/* Reset PIN Modal - First Step */}
      <Modal
        visible={showResetPINModal && resetPINStep === "first"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS_SURFACE }}>
          <PINEntry
            onComplete={handleFirstResetPIN}
            onCancel={() => {
              setShowResetPINModal(false);
              setFirstResetPIN("");
              setResetPINError("");
            }}
            title="Enter new PIN"
            subtitle="Create a new 4-digit PIN"
            maxLength={4}
          />
        </SafeAreaView>
      </Modal>

      {/* Reset PIN Modal - Confirm Step */}
      <Modal
        visible={showResetPINModal && resetPINStep === "confirm"}
        transparent
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS_SURFACE }}>
          <PINEntry
            onComplete={handleConfirmResetPIN}
            onCancel={() => {
              setResetPINStep("first");
              setFirstResetPIN("");
              setResetPINError("");
            }}
            title="Confirm your new PIN"
            subtitle="Enter the same 4-digit PIN again"
            maxLength={4}
          />
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

    </Modal>
  );
}
